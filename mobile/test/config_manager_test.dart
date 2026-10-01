import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:rozgarmitra/config/app_environment.dart';
import 'package:rozgarmitra/config/config_manager.dart';
import 'package:rozgarmitra/config/config_store.dart';
import 'package:rozgarmitra/config/secure_store.dart';
import 'package:rozgarmitra/config/server_config.dart';
import 'package:rozgarmitra/services/connection_tester.dart';
import 'package:rozgarmitra/services/api_service.dart';

/// Behaviour of the configuration manager: the piece that lets an administrator
/// repoint the whole app at another backend at runtime.
void main() {
  ConfigManager buildManager({
    required http.Client client,
    InMemoryKeyValueStore? storage,
  }) {
    return ConfigManager(
      store: ConfigStore(storage: storage ?? InMemoryKeyValueStore()),
      tester: ConnectionTester(client: client),
    );
  }

  http.Response okResponse() => http.Response(
        jsonEncode({'success': true, 'message': 'Rozgarmitra API is running.', 'version': '1.0.0'}),
        200,
      );

  test('starts on the compiled default and reports it', () async {
    final manager = buildManager(client: MockClient((_) async => okResponse()));
    await manager.load();

    expect(manager.isConfigured, isFalse);
    expect(manager.usingCompiledDefault, isTrue);
    expect(manager.config.environment, AppEnvironment.development);
    expect(manager.apiBaseUrl, isNotEmpty);
  });

  test('a configuration that has NOT passed a test cannot be saved', () async {
    final manager = buildManager(client: MockClient((_) async => okResponse()));
    await manager.load();

    final saved = await manager.save(
      const ServerConfig(serverBaseUrl: 'https://api.example.com'),
      actor: 'device-admin',
    );

    expect(saved, isFalse);
    expect(manager.isConfigured, isFalse);
    expect(manager.audit.last.action, 'denied');
    expect(manager.audit.last.success, isFalse);
  });

  test('an unsupported scheme is rejected without any network call', () async {
    var calls = 0;
    final manager = buildManager(client: MockClient((_) async {
      calls++;
      return okResponse();
    }));
    await manager.load();

    final result = await manager.test(const ServerConfig(serverBaseUrl: 'ftp://files.example.com'));
    expect(result.outcome, ConnectionOutcome.invalidUrl);
    expect(calls, 0);

    final saved = await manager.save(
      const ServerConfig(serverBaseUrl: 'ftp://files.example.com'),
      actor: 'device-admin',
    );
    expect(saved, isFalse);
  });

  test('test + save switches the live API base URL and persists it', () async {
    final storage = InMemoryKeyValueStore();
    final manager = buildManager(client: MockClient((_) async => okResponse()), storage: storage);
    await manager.load();

    const candidate = ServerConfig(
      serverBaseUrl: 'https://api.example.com',
      environment: AppEnvironment.production,
    );
    final probe = await manager.test(candidate);
    expect(probe.ok, isTrue);
    expect(manager.status, ConnectionStatus.connected);
    expect(manager.lastSuccessfulConnection, isNotNull);

    final saved =
        await manager.save(candidate, actor: 'admin-otp:******9999', verifiedBy: probe);
    expect(saved, isTrue);
    expect(manager.apiBaseUrl, 'https://api.example.com/api');
    expect(manager.config.updatedBy, 'admin-otp:******9999');
    expect(manager.audit.last.action, 'save');

    // A fresh manager reading the same storage keeps the new address: this is
    // what makes the change survive an app restart.
    final reloaded = buildManager(client: MockClient((_) async => okResponse()), storage: storage);
    await reloaded.load();
    expect(reloaded.apiBaseUrl, 'https://api.example.com/api');
    expect(reloaded.config.environment, AppEnvironment.production);
  });

  test('the developer override only works in the Development environment', () async {
    final manager = buildManager(client: MockClient((_) async => okResponse()));
    await manager.load();

    const devOverride = ServerConfig(
      serverIp: '192.168.1.100',
      serverPort: 8080,
      allowSaveWithoutTest: true,
    );
    expect(await manager.save(devOverride, actor: 'device-admin'), isTrue);

    final prodOverride = manager.config.copyWith(
      serverBaseUrl: 'https://api.example.com',
      serverIp: '',
      serverPort: null,
      environment: AppEnvironment.production,
      allowSaveWithoutTest: true,
    );
    expect(await manager.save(prodOverride, actor: 'device-admin'), isFalse);
  });

  test('a failed test never replaces the working configuration', () async {
    final storage = InMemoryKeyValueStore();
    var healthy = true;
    final manager = buildManager(
      client: MockClient(
          (_) async => healthy ? okResponse() : http.Response('{"message":"down"}', 502)),
      storage: storage,
    );
    await manager.load();

    const working = ServerConfig(serverBaseUrl: 'https://api.example.com');
    await manager.save(working, actor: 'device-admin', verifiedBy: await manager.test(working));
    final before = manager.apiBaseUrl;

    healthy = false;
    const broken = ServerConfig(serverBaseUrl: 'https://broken.example.com');
    final brokenProbe = await manager.test(broken);
    expect(brokenProbe.ok, isFalse);
    final refused = await manager.save(broken, actor: 'device-admin', verifiedBy: brokenProbe);

    expect(refused, isFalse);
    expect(manager.apiBaseUrl, before);
    expect(manager.audit.last.action, 'denied');
  });

  test('switching servers keeps the previous one available for rollback', () async {
    final storage = InMemoryKeyValueStore();
    final manager = buildManager(client: MockClient((_) async => okResponse()), storage: storage);
    await manager.load();

    const first = ServerConfig(serverBaseUrl: 'https://one.example.com');
    await manager.save(first, actor: 'device-admin', verifiedBy: await manager.test(first));

    const second = ServerConfig(serverBaseUrl: 'https://two.example.com');
    await manager.save(second, actor: 'device-admin', verifiedBy: await manager.test(second));
    expect(manager.apiBaseUrl, 'https://two.example.com/api');
    expect(manager.canRestoreLastWorking, isTrue);

    expect(await manager.restoreLastWorking(actor: 'device-admin'), isTrue);
    expect(manager.apiBaseUrl, 'https://one.example.com/api');
    expect(manager.audit.last.action, 'restore');
  });

  test('reset returns to the compiled default and records the change', () async {
    final storage = InMemoryKeyValueStore();
    final manager = buildManager(client: MockClient((_) async => okResponse()), storage: storage);
    await manager.load();

    const candidate = ServerConfig(serverBaseUrl: 'https://api.example.com');
    await manager.save(candidate, actor: 'device-admin', verifiedBy: await manager.test(candidate));
    expect(manager.isConfigured, isTrue);

    await manager.resetToDefault(actor: 'device-admin');
    expect(manager.isConfigured, isFalse);
    expect(manager.usingCompiledDefault, isTrue);
    expect(manager.audit.last.action, 'reset');

    final stored = await ConfigStore(storage: storage).readConfig();
    expect(stored?.isConfigured ?? false, isFalse);
  });

  test('ApiService reads the live address, so no URL is hard-coded', () async {
    final manager = buildManager(client: MockClient((_) async => okResponse()));
    await manager.load();

    final api = ApiService(config: manager, client: MockClient((_) async => okResponse()));
    expect(api.baseUrl, manager.apiBaseUrl);

    const candidate = ServerConfig(serverBaseUrl: 'https://api.example.com');
    await manager.save(candidate, actor: 'device-admin', verifiedBy: await manager.test(candidate));
    expect(api.baseUrl, 'https://api.example.com/api');
  });

  test('audit entries never contain credentials', () async {
    final manager = buildManager(client: MockClient((_) async => okResponse()));
    await manager.load();

    await manager.logEvent(
      action: 'save',
      actor: 'device-admin',
      summary: 'Switched to https://admin:s3cr3t@api.example.com/api',
    );

    final entry = manager.audit.last;
    expect(entry.summary.contains('s3cr3t'), isFalse);
    expect(entry.summary, contains('https://***@api.example.com/api'));
  });
}
