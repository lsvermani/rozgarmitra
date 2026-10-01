import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';
import 'package:rozgarmitra/config/config_manager.dart';
import 'package:rozgarmitra/config/config_store.dart';
import 'package:rozgarmitra/config/secure_store.dart';
import 'package:rozgarmitra/providers/auth_provider.dart';
import 'package:rozgarmitra/screens/admin/admin_settings_screen.dart';
import 'package:rozgarmitra/security/admin_passcode.dart';
import 'package:rozgarmitra/services/api_service.dart';
import 'package:rozgarmitra/services/connection_tester.dart';
import 'package:rozgarmitra/utils/app_theme.dart';
/// Widget tests for the administrator-only Server / Admin Settings page: the
/// page must stay locked until an administrator unlocks it, must reject bad
/// addresses, and must require a successful connection test before saving.
void main() {
  /// Passcode key used by ConfigStore (kept in sync with its private constant).
  const passcodeKey = 'rm.admin.passcode.v1';

  http.Response healthy() => http.Response(
        jsonEncode({'success': true, 'message': 'Rozgarmitra API is running.', 'version': '1.0.0'}),
        200,
      );

  /// Builds the settings screen backed by in-memory storage and a fake HTTP
  /// client, so nothing touches the network or the device keystore.
  Future<ConfigManager> pumpSettings(
    WidgetTester tester, {
    required InMemoryKeyValueStore storage,
    required http.Client client,
  }) async {
    // A phone-width viewport (360 dp logical) with a tall test height, so the
    // narrow-screen layout under test is a real device's while the whole page is
    // laid out (no lazily-unbuilt children for the finders to miss).
    tester.view.physicalSize = const Size(1080, 7800);
    tester.view.devicePixelRatio = 3.0;
    addTearDown(tester.view.reset);

    final manager = ConfigManager(
      store: ConfigStore(storage: storage),
      tester: ConnectionTester(client: client),
    );
    await manager.load();
    final api = ApiService(config: manager, client: client);

    await tester.pumpWidget(MultiProvider(
      providers: [
        ChangeNotifierProvider<ConfigManager>.value(value: manager),
        Provider<ApiService>.value(value: api),
        ChangeNotifierProvider<AuthProvider>.value(value: AuthProvider(api)),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: const AdminSettingsScreen()),
    ));
    await tester.pump();
    return manager;
  }

  /// The page is long, so scroll the target into view before tapping it.
  Future<void> tapText(WidgetTester tester, String text) async {
    final finder = find.text(text);
    await tester.ensureVisible(finder);
    await tester.pump();
    await tester.tap(finder);
    await tester.pump();
  }

  /// Scrolls back to the top so messages rendered above the fold (validation
  /// errors, unlock failures) are rebuilt and findable.
  Future<void> scrollToTop(WidgetTester tester) async {
    await tester.drag(find.byType(ListView).first, const Offset(0, 4000));
    await tester.pump();
  }

  /// Storage pre-seeded with a recovery passcode (fast iteration count so the
  /// suite stays quick — the production count is covered by the unit tests).
  InMemoryKeyValueStore storageWithPasscode() => InMemoryKeyValueStore({
        passcodeKey: AdminPasscode.hash('rozgar123', iterations: 200),
      });

  Future<void> unlock(WidgetTester tester) async {
    await tester.enterText(find.widgetWithText(TextField, 'Device passcode'), 'rozgar123');
    await tapText(tester, 'Unlock');
    await tester.pump(const Duration(milliseconds: 50));
  }

  testWidgets('a fresh device must create a recovery passcode before anything is editable',
      (tester) async {
    await pumpSettings(
      tester,
      storage: InMemoryKeyValueStore(),
      client: MockClient((_) async => healthy()),
    );

    expect(find.text('Administrator access only'), findsOneWidget);
    expect(find.text('Create a device recovery passcode'), findsOneWidget);
    // The configuration form must not be reachable before unlocking.
    expect(find.text('Server base URL'), findsNothing);
    expect(find.text('Test Connection'), findsNothing);

    // A too-short passcode is refused by the local policy.
    await tester.enterText(find.widgetWithText(TextField, 'New passcode'), '123');
    await tester.enterText(find.widgetWithText(TextField, 'Confirm passcode'), '123');
    await tapText(tester, 'Create & unlock');
    await scrollToTop(tester);
    expect(find.textContaining('at least 6 characters'), findsOneWidget);

    // A valid passcode unlocks the form.
    await tester.enterText(find.widgetWithText(TextField, 'New passcode'), 'rozgar123');
    await tester.enterText(find.widgetWithText(TextField, 'Confirm passcode'), 'rozgar123');
    await tapText(tester, 'Create & unlock');
    await tester.pump(const Duration(milliseconds: 50));

    expect(find.text('Server base URL'), findsOneWidget);
    expect(find.text('Test Connection'), findsOneWidget);
    expect(find.text('Save Configuration'), findsOneWidget);
    expect(find.text('Reset to Default'), findsOneWidget);
    expect(find.text('Restore previous working'), findsOneWidget);
    // The unlock itself is recorded in the on-device audit trail.
    final manager =
        tester.element(find.byType(AdminSettingsScreen)).read<ConfigManager>();
    expect(manager.audit.any((e) => e.action == 'unlock' && e.success), isTrue);
  });

  testWidgets('an existing passcode unlocks the page, and bad addresses are rejected',
      (tester) async {
    var probeCount = 0;
    await pumpSettings(
      tester,
      storage: storageWithPasscode(),
      client: MockClient((_) async {
        probeCount++;
        return healthy();
      }),
    );

    expect(find.text('Device recovery passcode'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Device passcode'), 'wrong-pass');
    await tapText(tester, 'Unlock');
    await tester.pump(const Duration(milliseconds: 50));
    await scrollToTop(tester);
    expect(find.textContaining('Incorrect passcode'), findsOneWidget);

    await unlock(tester);
    expect(find.text('Server base URL'), findsOneWidget);

    // An unsupported scheme must be refused locally: no request is attempted.
    await tester.enterText(find.widgetWithText(TextField, 'Server base URL'), 'ftp://bad.example');
    await tester.pump();
    await tapText(tester, 'Test Connection');
    await tester.pump(const Duration(milliseconds: 50));

    expect(probeCount, 0);
    expect(find.text('Connection failed'), findsOneWidget);
    expect(find.textContaining('Only http:// and https://'), findsWidgets);

    // Saving stays disabled until a test passes.
    final saveButton =
        tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Save Configuration'));
    expect(saveButton.onPressed, isNull);
  });

  testWidgets('a successful test enables saving and probes the live address', (tester) async {
    late Uri probed;
    await pumpSettings(
      tester,
      storage: storageWithPasscode(),
      client: MockClient((request) async {
        probed = request.url;
        return healthy();
      }),
    );

    await unlock(tester);

    await tester.enterText(
        find.widgetWithText(TextField, 'Server base URL'), 'https://api.example.com');
    await tester.pump();
    // The preview shows exactly what will be called, including the API path.
    expect(find.text('https://api.example.com/api'), findsOneWidget);

    await tapText(tester, 'Test Connection');
    await tester.pumpAndSettle();

    expect(probed.toString(), 'https://api.example.com/api/health');
    // Banner and "Save" rebuild a few frames after the async probe + audit
    // write; give the test clock generous virtual time rather than a single
    // 50 ms pump (flaky on slow hosts).
    await tester.pump(const Duration(milliseconds: 500));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('Connection successful'), findsOneWidget);

    final saveButton =
        tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Save Configuration'));
    expect(saveButton.onPressed, isNotNull);
  });
}
