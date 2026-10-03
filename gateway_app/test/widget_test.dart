import 'package:flutter_test/flutter_test.dart';
import 'package:gateway_app/gateway_client.dart';
import 'package:gateway_app/main.dart';

void main() {
  test('GatewayJob carries the fields the runner needs', () {
    const job = GatewayJob(id: 'abc123', to: '+918699142699', body: 'Your code is 123456');
    expect(job.id, 'abc123');
    expect(job.to, '+918699142699');
    expect(job.body, contains('123456'));
  });

  test('GatewayException surfaces a readable message', () {
    expect(GatewayException('boom').toString(), 'boom');
  });

  testWidgets('gateway screen shows its operational state', (tester) async {
    await tester.pumpWidget(const GatewayApp());
    await tester.pump();

    // The operator must be able to see, at a glance, whether this phone can send.
    expect(find.text('SMS Gateway'), findsOneWidget);
    expect(find.text('STOPPED'), findsOneWidget);

    // SIM and network are first-class rows, not buried in a log.
    expect(find.text('SIM'), findsOneWidget);
    expect(find.text('Network'), findsOneWidget);
    expect(find.text('Server'), findsOneWidget);

    // The actions the operator needs during setup.
    expect(find.text('Start gateway'), findsWidgets);
    expect(find.text('Refresh status'), findsOneWidget);
    expect(find.text('Grant SMS permission'), findsOneWidget);
  });
}

