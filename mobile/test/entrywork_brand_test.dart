import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

import 'package:rozgarmitra/config/config_manager.dart';
import 'package:rozgarmitra/config/config_store.dart';
import 'package:rozgarmitra/config/secure_store.dart';
import 'package:rozgarmitra/screens/auth/entrywork_screen.dart';
import 'package:rozgarmitra/utils/app_theme.dart';

/// The entry/onboarding screen is the first screen after the splash, so its hero
/// must show the RozgarMitra wordmark (with "Mitra" in the accent orange) instead
/// of the old ENTRYWORK label.
void main() {
  testWidgets('EntryWorkScreen hero shows the RozgarMitra brand mark',
      (WidgetTester tester) async {
    // In-memory store: the real SecureStore would hit the platform keystore,
    // whose MethodChannel can hang in widget tests (no native platform here).
    final manager = ConfigManager(store: ConfigStore(storage: InMemoryKeyValueStore()));
    await manager.load();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider<ConfigManager>.value(value: manager),
        ],
        child: MaterialApp(
          theme: AppTheme.light(),
          home: const EntryWorkScreen(),
        ),
      ),
    );
    await tester.pump();

    expect(find.text('ENTRYWORK'), findsNothing);

    final brand = find.text('RozgarMitra');
    expect(brand, findsOneWidget);

    final span = tester.widget<Text>(brand).textSpan! as TextSpan;
    expect(span.children, hasLength(2));
    expect((span.children!.first as TextSpan).text, 'Rozgar');
    expect((span.children!.last as TextSpan).text, 'Mitra');
    expect((span.children!.last as TextSpan).style?.color, AppColors.accent);
  });
}
