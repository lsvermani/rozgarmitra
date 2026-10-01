import 'package:flutter_test/flutter_test.dart';
import 'package:rozgarmitra/config/app_environment.dart';
import 'package:rozgarmitra/config/server_config.dart';
import 'package:rozgarmitra/utils/app_theme.dart';

/// Unit tests for the runtime server configuration: URL precedence, URL
/// validation and JSON persistence. These are the rules that make it safe to
/// change the backend address from inside the APK.
void main() {
  group('URL resolution', () {
    test('falls back to the address compiled into the APK', () {
      const config = ServerConfig();
      expect(config.usingCompiledDefault, isTrue);
      expect(config.isConfigured, isFalse);
      expect(config.effectiveApiBaseUrl, AppConstants.defaultApiBaseUrl);
    });

    test('appends the API base path to a bare origin', () {
      const config = ServerConfig(serverBaseUrl: 'https://api.example.com');
      expect(config.effectiveApiBaseUrl, 'https://api.example.com/api');
    });

    test('does not duplicate a path that is already present', () {
      const config = ServerConfig(serverBaseUrl: 'https://api.example.com/api');
      expect(config.effectiveApiBaseUrl, 'https://api.example.com/api');
    });

    test('strips trailing slashes', () {
      const config = ServerConfig(serverBaseUrl: 'https://api.example.com/');
      expect(config.effectiveApiBaseUrl, 'https://api.example.com/api');
    });

    test('uses the forwarded address ONLY when the switch is on', () {
      const off = ServerConfig(
        serverBaseUrl: 'https://api.example.com',
        forwardedUrl: 'https://example.com/proxy/api',
      );
      expect(off.effectiveApiBaseUrl, 'https://api.example.com/api');

      const on = ServerConfig(
        serverBaseUrl: 'https://api.example.com',
        forwardedUrl: 'https://example.com/proxy/api',
        useForwardedUrl: true,
      );
      // A forwarded address that already points at the API root is used as-is.
      expect(on.effectiveApiBaseUrl, 'https://example.com/proxy/api');
    });

    test('builds the address from IP + port using the environment scheme', () {
      const dev = ServerConfig(serverIp: '192.168.1.100', serverPort: 8080);
      expect(dev.effectiveApiBaseUrl, 'http://192.168.1.100:8080/api');

      const prod = ServerConfig(
        serverIp: 'api.example.com',
        serverPort: 443,
        environment: AppEnvironment.production,
      );
      expect(prod.effectiveApiBaseUrl, 'https://api.example.com:443/api');
    });

    test('prefers the base URL over the IP when both are set', () {
      const config = ServerConfig(serverBaseUrl: 'https://api.example.com', serverIp: '10.0.0.5');
      expect(config.effectiveApiBaseUrl, 'https://api.example.com/api');
    });

    test('honours a custom API base path', () {
      const config = ServerConfig(serverBaseUrl: 'https://api.example.com', apiBasePath: '/api/v1');
      expect(config.effectiveApiBaseUrl, 'https://api.example.com/api/v1');
    });

    test('normaliseApiBasePath adds a leading slash and drops the trailing one', () {
      expect(ServerConfig.normalizeApiBasePath('api/'), '/api');
      expect(ServerConfig.normalizeApiBasePath(''), '/api');
      expect(ServerConfig.normalizeApiBasePath('/api/v1/'), '/api/v1');
    });
  });

  group('validation', () {
    test('accepts a normal production configuration', () {
      const config = ServerConfig(
        serverBaseUrl: 'https://api.example.com',
        apiBasePath: '/api',
        environment: AppEnvironment.production,
      );
      expect(config.validate(), isEmpty);
    });

    test('rejects a scheme other than http(s)', () {
      const config = ServerConfig(serverBaseUrl: 'ftp://files.example.com');
      expect(config.fieldErrors()['serverBaseUrl'], contains('Unsupported scheme'));
    });

    test('rejects credentials embedded in the URL', () {
      const config = ServerConfig(serverBaseUrl: 'https://user:secret@api.example.com');
      expect(config.fieldErrors()['serverBaseUrl'], contains('credentials'));
    });

    test('rejects a query string or fragment in the address', () {
      const withQuery = ServerConfig(serverBaseUrl: 'https://api.example.com?token=abc');
      expect(withQuery.fieldErrors()['serverBaseUrl'], contains('must not contain'));

      const withFragment = ServerConfig(serverBaseUrl: 'https://api.example.com#top');
      expect(withFragment.fieldErrors()['serverBaseUrl'], contains('must not contain'));
    });

    test('requires https in production but allows http elsewhere', () {
      const prod = ServerConfig(
        serverBaseUrl: 'http://api.example.com',
        environment: AppEnvironment.production,
      );
      expect(prod.validate(), isNotEmpty);
      expect(prod.fieldErrors()['serverBaseUrl'], contains('https'));

      const testing = ServerConfig(
        serverBaseUrl: 'http://api.example.com',
        environment: AppEnvironment.testing,
      );
      expect(testing.validate(), isEmpty);
    });

    test('rejects an out-of-range port', () {
      const config = ServerConfig(serverIp: '192.168.1.100', serverPort: 70000);
      expect(config.fieldErrors()['serverPort'], contains('65535'));
    });

    test('accepts IP literals and host names but rejects malformed values', () {
      expect(const ServerConfig(serverIp: '192.168.1.100').fieldErrors()['serverIp'], isNull);
      expect(const ServerConfig(serverIp: '[2001:db8::1]').fieldErrors()['serverIp'], isNull);
      expect(const ServerConfig(serverIp: '[2001:db8::1]', serverPort: 8080).effectiveApiBaseUrl,
          'http://[2001:db8::1]:8080/api');
      expect(const ServerConfig(serverIp: '999.1.1.1').fieldErrors()['serverIp'], isNotNull);
      expect(const ServerConfig(serverIp: 'http://192.168.1.100').fieldErrors()['serverIp'],
          isNotNull);
      expect(const ServerConfig(serverIp: '192.168.1.100/24').fieldErrors()['serverIp'], isNotNull);
      // Unbracketed IPv6 is ambiguous with a port, so it is rejected with a hint.
      expect(const ServerConfig(serverIp: '2001:db8::1').fieldErrors()['serverIp'],
          contains('square brackets'));
    });

    test('rejects an API path containing a query', () {
      const config = ServerConfig(apiBasePath: '/api?debug=1');
      expect(config.fieldErrors()['apiBasePath'], isNotNull);
    });

    test('requires the forwarded address once its switch is on', () {
      const config = ServerConfig(useForwardedUrl: true);
      expect(config.fieldErrors()['forwardedUrl'], isNotNull);
    });

    test('only honours the test-override in development', () {
      const dev = ServerConfig(
        serverIp: '192.168.1.100',
        allowSaveWithoutTest: true,
        environment: AppEnvironment.development,
      );
      expect(dev.saveWithoutTestAllowed, isTrue);

      const prod = ServerConfig(
        serverBaseUrl: 'https://api.example.com',
        allowSaveWithoutTest: true,
        environment: AppEnvironment.production,
      );
      expect(prod.saveWithoutTestAllowed, isFalse);
    });
  });

  group('persistence', () {
    test('round-trips through JSON', () {
      const original = ServerConfig(
        serverBaseUrl: 'https://api.example.com',
        serverIp: '192.168.1.100',
        serverPort: 8080,
        forwardedUrl: 'https://example.com/api',
        useForwardedUrl: true,
        apiBasePath: '/api/v1',
        environment: AppEnvironment.production,
        allowSaveWithoutTest: true,
        updatedAt: '2026-10-01T10:00:00.000Z',
        updatedBy: 'admin-otp:******9999',
      );

      final restored = ServerConfig.fromJson(original.toJson());
      expect(restored.serverBaseUrl, original.serverBaseUrl);
      expect(restored.serverIp, original.serverIp);
      expect(restored.serverPort, original.serverPort);
      expect(restored.forwardedUrl, original.forwardedUrl);
      expect(restored.useForwardedUrl, isTrue);
      expect(restored.apiBasePath, '/api/v1');
      expect(restored.environment, AppEnvironment.production);
      expect(restored.allowSaveWithoutTest, isTrue);
      expect(restored.updatedBy, 'admin-otp:******9999');
    });

    test('an unknown environment id falls back to development', () {
      expect(AppEnvironment.fromId('staging-ish'), AppEnvironment.development);
      expect(AppEnvironment.fromId('production'), AppEnvironment.production);
      expect(AppEnvironment.fromId(null), AppEnvironment.development);
    });

    test('copyWith can clear the port and keeps other fields', () {
      const original = ServerConfig(serverIp: '10.0.0.1', serverPort: 8080, apiBasePath: '/api');
      final cleared = original.copyWith(serverPort: null);
      expect(cleared.serverPort, isNull);
      expect(cleared.serverIp, '10.0.0.1');
      expect(cleared.copyWith(apiBasePath: 'v2/').apiBasePath, '/v2');
    });

    test('redact() masks credentials and empty values', () {
      expect(
        ServerConfig.redact('https://user:secret@api.example.com/api'),
        'https://***@api.example.com/api',
      );
      expect(ServerConfig.redact('   '), '(empty)');
      expect(ServerConfig.redact('https://api.example.com/api'), 'https://api.example.com/api');
      // Credentials must be masked wherever they appear in a sentence...
      expect(
        ServerConfig.redact('Switched to https://admin:s3cr3t@api.example.com/api now'),
        'Switched to https://***@api.example.com/api now',
      );
      // ...and a pasted MongoDB connection string must never survive.
      expect(
        ServerConfig.redact('uri mongodb+srv://u:p@cluster0.example.net/db'),
        contains('mongodb://***'),
      );
    });
  });
}
