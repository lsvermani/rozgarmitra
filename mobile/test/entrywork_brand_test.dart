import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rozgarmitra/screens/auth/entrywork_screen.dart';
import 'package:rozgarmitra/utils/app_theme.dart';

/// The entry/onboarding screen is the first screen after the splash, so its hero
/// must show the RozgarMitra wordmark (with "Mitra" in the accent orange) instead
/// of the old ENTRYWORK label.
void main() {
  testWidgets('EntryWorkScreen hero shows the RozgarMitra brand mark',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: const EntryWorkScreen(),
      ),
    );

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
