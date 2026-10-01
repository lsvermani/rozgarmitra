import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config/config_manager.dart';
import '../utils/app_theme.dart';
import 'connection_tester.dart';

/// Broad category of a failed request, so screens can react differently to
/// "the server said no" vs "we could not reach the server".
enum ApiErrorKind { api, network, timeout, invalidResponse }

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.kind = ApiErrorKind.api});

  final String message;

  /// HTTP status code when the request reached the server.
  final int? statusCode;
  final ApiErrorKind kind;

  /// True when the request never reached the backend (offline, DNS, TLS...).
  bool get isNetworkError =>
      kind == ApiErrorKind.network || kind == ApiErrorKind.timeout;

  /// True when the session is missing, expired or forbidden.
  bool get isAuthError => statusCode == 401 || statusCode == 403;

  @override
  String toString() => message;
}

/// Thin wrapper around the `http` package. Centralizes the **runtime** base URL,
/// auth header injection, timeouts and error handling so screens don't repeat
/// boilerplate.
///
/// The base URL is resolved from [ConfigManager] on **every request**, which is
/// what makes the Server / Admin Settings page work without a rebuild: changing
/// the saved server address immediately redirects the whole app.
class ApiService {
  ApiService({String? baseUrl, ConfigManager? config, http.Client? client})
      : _fixedBaseUrl = baseUrl,
        _config = config,
        _client = client ?? http.Client();

  /// When set (tests, or an explicit override) this address wins and the
  /// configuration manager is ignored.
  final String? _fixedBaseUrl;
  final ConfigManager? _config;
  final http.Client _client;

  /// Per-request timeout: long enough for a slow mobile network, short enough
  /// that a dead server never freezes the UI.
  Duration requestTimeout = const Duration(seconds: 20);

  String? _token;

  /// Effective API base URL, e.g. `https://api.example.com/api`.
  String get baseUrl {
    final fixed = _fixedBaseUrl;
    if (fixed != null && fixed.isNotEmpty) {
      return fixed.replaceAll(RegExp(r'/+$'), '');
    }
    final manager = _config;
    if (manager != null) return manager.apiBaseUrl;
    return ConfigManager.currentApiBaseUrl;
  }

  void setToken(String? token) => _token = token;

  /// Independent client for a secondary session — used by the admin gate to
  /// verify an administrator's OTP without touching the signed-in user's token
  /// and without reusing the caller's auth state.
  ApiService fork() => ApiService(config: _config, client: _client);

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (_token != null) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path, [Map<String, dynamic>? query]) {
    final uri = Uri.parse('$baseUrl$path');
    if (query == null || query.isEmpty) return uri;

    final clean = query.map((k, v) => MapEntry(k, v.toString()))
      ..removeWhere((_, v) => v == 'null' || v.isEmpty);
    if (clean.isEmpty) return uri;
    return uri.replace(queryParameters: clean);
  }

  /// Shared response handling: decodes JSON and turns non-2xx into
  /// [ApiException]s that carry the HTTP status.
  Map<String, dynamic> _handle(http.Response res) {
    Map<String, dynamic> body;
    try {
      body = res.body.isNotEmpty ? jsonDecode(res.body) as Map<String, dynamic> : {};
    } catch (_) {
      throw ApiException(
        'The server sent an unexpected response (HTTP ${res.statusCode}).',
        statusCode: res.statusCode,
        kind: ApiErrorKind.invalidResponse,
      );
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return body;

    throw ApiException(
      body['message']?.toString() ?? 'Something went wrong (HTTP ${res.statusCode}).',
      statusCode: res.statusCode,
    );
  }

  /// Turns transport failures into messages a field worker can understand.
  ApiException _transportError(Object error) {
    if (error is TimeoutException) {
      return ApiException(
        'The server took too long to respond. Check your internet connection and try again.',
        kind: ApiErrorKind.timeout,
      );
    }
    // Classify by text so no `dart:io` import is needed (keeps web builds
    // working): SocketException, HandshakeException and browser errors all
    // arrive here as strings.
    final text = error.toString().toLowerCase();
    if (text.contains('insecure http is not allowed')) {
      return ApiException(
        'This build blocks plain HTTP. Ask your administrator to use an https:// address.',
        kind: ApiErrorKind.network,
      );
    }
    if (text.contains('socketexception') ||
        text.contains('clientexception') ||
        text.contains('host lookup') ||
        text.contains('unreachable') ||
        text.contains('connection refused') ||
        text.contains('xmlhttprequest') ||
        text.contains('handshake') ||
        text.contains('certificate') ||
        text.contains('timed out')) {
      return ApiException(
        'Cannot reach the server. Check your internet connection.',
        kind: ApiErrorKind.network,
      );
    }
    return ApiException('Request failed: $error', kind: ApiErrorKind.network);
  }

  Future<Map<String, dynamic>> _send(
    Future<http.Response> Function() request,
  ) async {
    try {
      final res = await request().timeout(requestTimeout);
      return _handle(res);
    } on ApiException {
      rethrow;
    } catch (error) {
      throw _transportError(error);
    }
  }

  Future<Map<String, dynamic>> get(String path, {Map<String, dynamic>? query}) =>
      _send(() => _client.get(_uri(path, query), headers: _headers));

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> data) =>
      _send(() => _client.post(_uri(path), headers: _headers, body: jsonEncode(data)));

  Future<Map<String, dynamic>> put(String path, Map<String, dynamic> data) =>
      _send(() => _client.put(_uri(path), headers: _headers, body: jsonEncode(data)));

  Future<Map<String, dynamic>> delete(String path) =>
      _send(() => _client.delete(_uri(path), headers: _headers));

  /// One-shot `GET <base>/health` probe against the currently active address.
  Future<ProbeResult> checkHealth({Duration timeout = const Duration(seconds: 10)}) =>
      ConnectionTester(client: _client).probe(baseUrl, timeout: timeout);

  /// The compile-time fallback, exposed for the settings page.
  static String get compiledDefaultBaseUrl => AppConstants.defaultApiBaseUrl;

  void dispose() => _client.close();
}

