import 'package:flutter/material.dart';

import 'gateway_client.dart';
import 'gateway_panel.dart';
import 'gateway_runner.dart';
import 'sms_sender.dart';

/// Operator console for the gateway phone.
///
/// The one thing this screen must answer quickly is "can this phone actually
/// send right now?" - if it cannot, every OTP in the product is silently stuck.
/// SIM and network state are therefore first-class facts, reported to the
/// server by heartbeat, not buried in a log.
void main() => runApp(const GatewayApp());

class GatewayApp extends StatelessWidget {
  const GatewayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Rozgarmitra SMS Gateway',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F766E)),
        useMaterial3: true,
      ),
      home: const GatewayHome(),
    );
  }
}

class GatewayHome extends StatefulWidget {
  const GatewayHome({super.key});

  @override
  State<GatewayHome> createState() => _GatewayHomeState();
}

class _GatewayHomeState extends State<GatewayHome> {
  final _baseUrlCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _sender = const SmsSender();

  bool _permissionGranted = false;
  String? _senderNumber;

  late final GatewayClient _client;
  late final GatewayRunner _runner;

  @override
  void initState() {
    super.initState();

    _baseUrlCtrl.text = const String.fromEnvironment(
      'GATEWAY_API',
      defaultValue: 'http://10.0.2.2:5000/api',
    );

    _client = GatewayClient(
      baseUrl: _baseUrlCtrl.text.trim(),
      // Stable per-install identity; the backend treats it as the device.
      deviceId:
          'android-gateway-${DateTime.now().millisecondsSinceEpoch ~/ 1000000}',
    );

    _runner = GatewayRunner(client: _client, sender: _sender);

    _checkPermission();
  }

  Future<void> _checkPermission() async {
    final granted = await _sender.hasPermission();
    final number = await _sender.senderNumber();
    if (!mounted) return;
    setState(() {
      _permissionGranted = granted;
      _senderNumber = number;
    });
  }

  Future<void> _grantPermission() async {
    final granted = await _sender.requestPermission();
    await _checkPermission();
    if (!granted && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('SMS permission denied. This app cannot send anything.'),
        ),
      );
    }
  }

  Future<void> _start() async {
    try {
      if (!_client.hasToken) await _client.loadToken();
      // First run enrols the phone; the token is then kept in secure storage.
      if (!_client.hasToken) {
        await _client.register(
          name: _nameCtrl.text.trim(),
          phoneNumber: _senderNumber ?? '',
        );
      }
      _runner.start();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not start: $e')),
      );
    }
  }

  @override
  void dispose() {
    _runner.dispose();
    _baseUrlCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('SMS Gateway')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GatewayPanel(client: _client, runner: _runner, sender: _sender),
            const SizedBox(height: 12),
            if (!_permissionGranted) ...[
              FilledButton.tonal(
                onPressed: _grantPermission,
                child: const Text('Grant SMS permission'),
              ),
              const SizedBox(height: 12),
            ],
            TextField(
              controller: _baseUrlCtrl,
              decoration: const InputDecoration(
                labelText: 'Backend API base URL',
                hintText: 'http://10.0.2.2:5000/api',
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _nameCtrl,
              decoration:
                  const InputDecoration(labelText: 'Device name (optional)'),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _permissionGranted ? _start : null,
              child: const Text('Start gateway'),
            ),
            const SizedBox(height: 16),
            const Text(
              'Keep this app running and the phone online. If it stops, no OTP '
              'can be sent and users will see "gateway not responding".',
              style: TextStyle(fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
