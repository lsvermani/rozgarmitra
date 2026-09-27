import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:rozgarmitra/models/job.dart';
import 'package:rozgarmitra/utils/app_theme.dart';
import 'package:rozgarmitra/widgets/job_card.dart';

Job _sampleJob() => Job(
      id: 'job1',
      title: 'Construction Helper',
      description: 'Lift and carry bricks',
      category: 'Construction',
      requiredSkills: const ['Physical Labour'],
      workersRequired: 2,
      date: DateTime(2026, 9, 28),
      startTime: '09:00',
      endTime: '17:00',
      duration: '1 Day',
      payment: 550,
      paymentUnit: 'day',
      location: JobLocation(address: '12 Main St', city: 'New Delhi', locality: 'Delhi Cantt'),
      status: 'OPEN',
      applicationsCount: 3,
    );

void main() {
  testWidgets('JobCard lays out inside a padded vertical ListView',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: ListView(
            padding: const EdgeInsets.all(20),
            children: [JobCard(job: _sampleJob(), onTap: () {})],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('View & Apply'), findsOneWidget);
    expect(find.text('₹550/day'), findsOneWidget);
  });

  testWidgets('JobCard payment row lays out in a bounded Column',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: Column(
            children: [JobCard(job: _sampleJob(), onTap: () {})],
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('View & Apply'), findsOneWidget);
  });

  testWidgets('ElevatedButton in a ListTile trailing slot lays out',
      (WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: ListTile(
            title: const Text('Selected job'),
            trailing: SizedBox(
              width: 150,
              child: ElevatedButton(
                onPressed: () {},
                child: const Text('Accept task'),
              ),
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('Accept task'), findsOneWidget);
  });
}
