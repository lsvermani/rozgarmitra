import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

/// Talks to the Rozgarmitra backend's SMS gateway API.
///
/// The device bearer token is held in [FlutterSecureStorage] rather than shared
/// preferences: it authorises sending SMS from the user's SIM, so anyone who can
/// read the phone's storage should not be able to lift it.
class GatewayClient {
  GatewayClient({
    required this.baseUrl,
    required this.deviceId,
    http.Client? client,
  }) : _client = client ?? http.Client();

  /// e.g. `https://api.example.com/api` â€” no trailing slash.
  final String baseUrl;
  final String deviceId;
  final http.Client _client;

  static const _tokenKey = 'rm_gateway_token';

  final _storage = const FlutterSecureStorage();

  String? _token;
  bool get hasToken => _token != null && _token!.isNotEmpty;

  Future<String?> loadToken() async {
    _token = await _storage.read(key: _tokenKey);
    return _token;
  }

  Future<void> saveToken(String token) async {
    _token = token;
    await _storage.write(key: _tokenKey, value: token);
  }

  Future<void> clearToken() async {
    _token = null;
    await _storage.delete(key: _tokenKey);
  }

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
        if (hasToken) 'Authorization': 'Bearer $_token',
      };

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  /// Registers this device and stores the issued token.
  ///
  /// Re-registering rotates the token, so any previous one stops working
  /// immediately. That is what makes "forgot my token" recoverable.
  Future<void> register({String name = '', String phoneNumber = ''}) async {
    final res = await _client.post(
      _uri('/sms-gateway/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'deviceId': deviceId,
        'name': name,
        'phoneNumber': phoneNumber,
      }),
    );
    final body = _decode(res);
    final token = body['token'];
    if (token is! String || token.isEmpty) {
      throw GatewayException('Registration did not return a token.');
    }
    await saveToken(token);
  }

  /// Claims queued jobs. Returns an empty list when there is nothing to do.
  Future<List<GatewayJob>> poll({int limit = 3}) async {
    final res = await _client.post(
      _uri('/sms-gateway/poll'),
      headers: _headers,
      body: jsonEncode({'limit': limit}),
    );
    final body = _decode(res);
    final jobs = body['jobs'];
    if (jobs is! List) return const [];
    return jobs
        .whereType<Map<String, dynamic>>()
        .map((j) => GatewayJob(
              id: '${j['id']}',
              to: '${j['to']}',
              body: '${j['body']}',
            ))
        .toList(growable: false);
  }

  /// Tells the backend this phone is alive and whether it can actually send.
  ///
  /// The server replies with the cadences it wants, so changing the poll and
  /// heartbeat intervals needs no reinstall of this app.
  Future<GatewayHealth> heartbeat({
    required String simStatus,
    required String networkStatus,
    String appVersion = '',
    String deviceModel = '',
  }) async {
    final res = await _client.post(
      _uri('/sms-gateway/heartbeat'),
      headers: _headers,
      body: jsonEncode({
        'simStatus': simStatus,
        'networkStatus': networkStatus,
        'appVersion': appVersion,
        'deviceModel': deviceModel,
      }),
    );
    return GatewayHealth.fromJson(_decode(res));
  }

  /// Reports what the phone actually did with a claimed job.
  ///
  /// A reporting failure must never cause a resend - the backend treats a job
  /// whose report is lost as `unknown`, not as work to retry, precisely so the
  /// user never receives two codes.
  Future<void> report(
    String jobId, {
    required String status,
    String gatewayMessageId = '',
    String errorCode = '',
    String errorMessage = '',
  }) async {
    await _client.post(
      _uri('/sms-gateway/report'),
      headers: _headers,
      body: jsonEncode({
        'jobId': jobId,
        'status': status,
        'gatewayMessageId': gatewayMessageId,
        'errorCode': errorCode,
        'errorMessage': errorMessage,
      }),
    );
  }

  Map<String, dynamic> _decode(http.Response res) {
    Map<String, dynamic> body;
    try {
      body = res.body.isEmpty
          ? <String, dynamic>{}
          : jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      throw GatewayException(
        'Unexpected reply from server (HTTP ${res.statusCode}).',
      );
    }
    if (res.statusCode >= 400) {
      throw GatewayException(
        body['message']?.toString() ?? 'Request failed.',
      );
    }
    return body;
  }

  void dispose() => _client.close();
}

/// Liveness and capability, as reported by the backend's heartbeat reply.
class GatewayHealth {
  const GatewayHealth({
    required this.simStatus,
    required this.networkStatus,
    this.pollIntervalSeconds = 5,
    this.heartbeatIntervalSeconds = 30,
  });

  final String simStatus;
  final String networkStatus;
  final int pollIntervalSeconds;
  final int heartbeatIntervalSeconds;

  bool get canSend => simStatus == 'available' && networkStatus == 'connected';

  factory GatewayHealth.fromJson(Map<String, dynamic> json) {
    return GatewayHealth(
      simStatus: (json['simStatus'] ?? 'unknown').toString(),
      networkStatus: (json['networkStatus'] ?? 'unknown').toString(),
      pollIntervalSeconds: (json['pollIntervalSeconds'] as num?)?.toInt() ?? 5,
      heartbeatIntervalSeconds: (json['nextHeartbeatSeconds'] as num?)?.toInt() ?? 30,
    );
  }
}

/// One queued message awaiting delivery.
class GatewayJob {
  const GatewayJob({required this.id, required this.to, required this.body});

  final String id;

  /// Recipient in E.164, e.g. `+918699142699`.
  final String to;

  /// The message text, including the OTP.
  final String body;
}

class GatewayException implements Exception {
  GatewayException(this.message);

  final String message;

  @override
  String toString() => message;
}
