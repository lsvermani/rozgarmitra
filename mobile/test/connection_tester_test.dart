import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rozgarmitra/services/connection_tester.dart';

/// "Test Connection" must classify failures precisely: that classification is
/// what the administrator sees on the Server / Admin Settings page.
void main() {
  test('successful health response reports connected with server metadata', () async {
    final tester = ConnectionTester(
      client: MockClient((request) async {
        expect(request.url.path, '/api/health');
        return http.Response(
          jsonEncode({
            'success': true,
            'message': 'Rozgarmitra API is running.',
            'mode': 'demo',
            'version': '1.0.0',
          }),
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    final result = await tester.probe('https://api.example.com/api');
    expect(result.ok, isTrue);
    expect(result.outcome, ConnectionOutcome.success);
    expect(result.statusCode, 200);
    expect(result.serverMode, 'demo');
    expect(result.serverVersion, '1.0.0');
    expect(result.checkedUrl, 'https://api.example.com/api/health');
    expect(result.latency, isNotNull);
  });

  test('trailing slashes are normalised before probing', () async {
    late Uri seen;
    final tester = ConnectionTester(
      client: MockClient((request) async {
        seen = request.url;
        return http.Response('{"success":true}', 200);
      }),
    );

    await tester.probe('https://api.example.com/api///');
    expect(seen.toString(), 'https://api.example.com/api/health');
  });

  test('a 500 is reported as an HTTP error, not a transport failure', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => http.Response('{"message":"boom"}', 500)),
    );

    final result = await tester.probe('https://api.example.com/api');
    expect(result.ok, isFalse);
    expect(result.outcome, ConnectionOutcome.httpError);
    expect(result.statusCode, 500);
    expect(result.message, contains('500'));
    expect(result.message, contains('boom'));
  });

  test('a non-JSON body still yields a readable message', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => http.Response('<html>nginx 404</html>', 404)),
    );

    final result = await tester.probe('https://api.example.com/api');
    expect(result.outcome, ConnectionOutcome.httpError);
    expect(result.message, contains('404'));
  });

  test('DNS failures are explained in plain language', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => throw const SocketishError('Failed host lookup: nope.example')),
    );

    final result = await tester.probe('https://nope.example/api');
    expect(result.outcome, ConnectionOutcome.unreachable);
    expect(result.message, contains('could not be resolved'));
  });

  test('refused connections are explained', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => throw const SocketishError('Connection refused')), 
    );

    final result = await tester.probe('http://192.168.1.100:8080/api');
    expect(result.outcome, ConnectionOutcome.unreachable);
    expect(result.message, contains('refused'));
  });

  test('an unreachable host produces advice instead of a stack trace', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => throw const SocketishError('SocketException: Network is unreachable')),
    );

    final result = await tester.probe('http://10.0.2.2:5000/api');
    expect(result.ok, isFalse);
    expect(result.outcome, ConnectionOutcome.unreachable);
    expect(result.message, contains('unreachable'));
  });

  test('plain HTTP blocked by the platform is called out explicitly', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async =>
          throw const SocketishError('Insecure HTTP is not allowed by platform')),
    );

    final result = await tester.probe('http://192.168.1.100:8080/api');
    expect(result.outcome, ConnectionOutcome.blockedCleartext);
    expect(result.message, contains('https'));
  });

  test('TLS problems are reported as such', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async => throw const SocketishError('HandshakeException: bad certificate')),
    );

    final result = await tester.probe('https://api.example.com/api');
    expect(result.outcome, ConnectionOutcome.tlsError);
  });

  test('an unroutable/iP-literal-free address never causes a request', () async {
    var calls = 0;
    final tester = ConnectionTester(
      client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }),
    );

    final result = await tester.probe('not-a-url');
    expect(result.outcome, ConnectionOutcome.invalidUrl);
    expect(calls, 0);
  });

  test('a slow server trips the timeout', () async {
    final tester = ConnectionTester(
      client: MockClient((_) async {
        await Future<void>.delayed(const Duration(milliseconds: 300));
        return http.Response('{}', 200);
      }),
    );

    final result = await tester.probe(
      'https://api.example.com/api',
      timeout: const Duration(milliseconds: 50),
    );
    expect(result.outcome, ConnectionOutcome.timeout);
  });
}

/// Stand-in for the platform-specific transport errors (`SocketException`,
/// `HandshakeException`, browser `ClientException`). The tester classifies by
/// message text on purpose, so no `dart:io` import is needed (web builds).
class SocketishError implements Exception {
  const SocketishError(this.message);
  final String message;

  @override
  String toString() => message;
}
