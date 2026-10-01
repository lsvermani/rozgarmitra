import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// How a connection test finished.
enum ConnectionOutcome {
  success,
  httpError,
  unreachable,
  timeout,
  invalidUrl,
  blockedCleartext,
  tlsError,
  unexpected,
}

/// Result of probing a candidate API base URL.
class ProbeResult {
  const ProbeResult({
    required this.outcome,
    required this.message,
    required this.checkedUrl,
    this.statusCode,
    this.latency,
    this.serverMessage,
    this.serverMode,
    this.serverVersion,
  });

  final ConnectionOutcome outcome;

  /// Human readable result, safe to show to an administrator.
  final String message;
  final String checkedUrl;
  final int? statusCode;
  final Duration? latency;

  /// Values reported by the backend health endpoint (non-sensitive).
  final String? serverMessage;
  final String? serverMode;
  final String? serverVersion;

  bool get ok => outcome == ConnectionOutcome.success;

  /// True when this probe tested exactly [apiBaseUrl] (i.e. it called
  /// `GET <apiBaseUrl>/health` for that base). The form and [ConfigManager]
  /// use this so editing a field after a successful test invalidates it.
  bool verifiesApiBase(String apiBaseUrl) {
    final base = apiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    return checkedUrl == '$base${ConnectionTester.healthPath}';
  }

  /// Compact one-liner for the audit log.
  String get auditSummary {
    final status = statusCode == null ? '' : 'HTTP $statusCode, ';
    final ms = latency == null ? '' : '${latency!.inMilliseconds} ms, ';
    return '${outcome.name} ($status$ms$message)';
  }
}

/// Calls `GET <apiBaseUrl>/health` on a *candidate* URL without touching the
/// app's live session, so "Test Connection" can never break the running app.
///
/// Deliberately free of `dart:io` so the same code compiles for Android, web
/// and desktop; transport errors are classified by type/message instead of
/// `SocketException` / `HandshakeException`.
class ConnectionTester {
  ConnectionTester({http.Client? client}) : _client = client ?? http.Client();

  /// Health endpoint exposed by the Rozgarmitra backend (`GET /api/health`).
  static const String healthPath = '/health';

  final http.Client _client;

  Future<ProbeResult> probe(
    String apiBaseUrl, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    final base = apiBaseUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final target = '$base$healthPath';

    final uri = Uri.tryParse(target);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return ProbeResult(
        outcome: ConnectionOutcome.invalidUrl,
        message: 'That address is not a valid URL.',
        checkedUrl: target,
      );
    }

    final stopwatch = Stopwatch()..start();
    try {
      final res = await _client
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(timeout);
      stopwatch.stop();

      Map<String, dynamic>? body;
      try {
        final decoded = jsonDecode(res.body);
        if (decoded is Map<String, dynamic>) body = decoded;
      } catch (_) {
        body = null;
      }

      if (res.statusCode >= 200 && res.statusCode < 300) {
        return ProbeResult(
          outcome: ConnectionOutcome.success,
          statusCode: res.statusCode,
          latency: stopwatch.elapsed,
          message: 'Connected successfully.',
          checkedUrl: target,
          serverMessage: body?['message']?.toString(),
          serverMode: body?['mode']?.toString(),
          serverVersion: body?['version']?.toString(),
        );
      }

      final detail = body?['message']?.toString() ?? _snippet(res.body);
      return ProbeResult(
        outcome: ConnectionOutcome.httpError,
        statusCode: res.statusCode,
        latency: stopwatch.elapsed,
        message: 'The server answered with HTTP ${res.statusCode}. '
            '${detail.isEmpty ? '' : 'Server said: $detail'}',
        checkedUrl: target,
      );
    } on TimeoutException {
      return ProbeResult(
        outcome: ConnectionOutcome.timeout,
        message: 'Timed out after ${timeout.inSeconds}s. The server may be down, '
            'blocked by a firewall, or unreachable from this network.',
        checkedUrl: target,
      );
    } catch (error) {
      final classified = _classify(error);
      return ProbeResult(
        outcome: classified.$1,
        message: classified.$2,
        checkedUrl: target,
      );
    }
  }

  /// Maps a transport error to an outcome + administrator-friendly advice.
  static (ConnectionOutcome, String) _classify(Object error) {
    final text = error.toString();
    final lower = text.toLowerCase();

    if (error is FormatException) {
      return (ConnectionOutcome.invalidUrl, 'The address could not be parsed: ${error.message}');
    }
    if (lower.contains('insecure http is not allowed')) {
      return (
        ConnectionOutcome.blockedCleartext,
        'Plain HTTP is blocked in this build. Use https:// or add the host to '
            'android/app/src/main/res/xml/network_security_config.xml and rebuild.',
      );
    }
    if (lower.contains('handshake') || lower.contains('certificate') || lower.contains('ssl')) {
      return (
        ConnectionOutcome.tlsError,
        'TLS/HTTPS handshake failed. Check the certificate on the server '
            '(${_snippet(text)}).',
      );
    }
    if (lower.contains('failed host lookup') || lower.contains('nodename nor servname')) {
      return (
        ConnectionOutcome.unreachable,
        'Host name could not be resolved. Check the spelling and DNS/VPN.',
      );
    }
    if (lower.contains('connection refused') || lower.contains('actively refused')) {
      return (
        ConnectionOutcome.unreachable,
        'Connection refused. The server is reachable but nothing is listening on that port.',
      );
    }
    if (lower.contains('network is unreachable') ||
        lower.contains('no route to host') ||
        lower.contains('timed out') ||
        lower.contains('unreachable') ||
        lower.contains('xmlhttprequest') ||
        lower.contains('socketexception') ||
        lower.contains('clientexception')) {
      return (
        ConnectionOutcome.unreachable,
        'Server unreachable: ${_snippet(text)}. Check the address, port, Wi-Fi/VPN '
            'and whether the backend is running.',
      );
    }
    return (ConnectionOutcome.unexpected, 'Unexpected error: ${_snippet(text)}');
  }

  /// Keeps error text short enough for a SnackBar.
  static String _snippet(String value, {int max = 160}) {
    final clean = value.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (clean.length <= max) return clean;
    return '${clean.substring(0, max)}…';
  }

  void dispose() => _client.close();
}
