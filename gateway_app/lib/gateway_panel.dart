import 'package:flutter/material.dart';

import 'gateway_client.dart';
import 'gateway_runner.dart';
import 'sms_sender.dart';

/// Operator console for the gateway phone.
///
/// The single most important thing this screen answers is "can this phone
/// actually send right now?" - if it cannot, every OTP in the product is
/// silently stuck. So SIM and network state are shown as first-class facts,
/// not buried in a log.
class GatewayPanel extends StatefulWidget {
  const GatewayPanel({super.key, required this.client, required this.runner, required this.sender});

  final GatewayClient client;
  final GatewayRunner runner;
  final SmsSender sender;

  @override
  State<GatewayPanel> createState() => _GatewayPanelState();
}

class _GatewayPanelState extends State<GatewayPanel> {
  String _status = 'Stopped';
  bool _simAvailable = false;
  bool _networkOk = false;
  int _sent = 0;
  int _failed = 0;
  DateTime? _lastHeartbeat;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    final permission = await widget.sender.hasPermission();
    final number = await widget.sender.senderNumber();
    // A phone with no readable SIM line cannot send, whatever the server says.
    final sim = permission && number != null;

    var net = false;
    var status = 'Server unreachable';
    try {
      final health = await widget.client.heartbeat(
        simStatus: sim ? 'available' : 'unavailable',
        networkStatus: 'unknown',
        appVersion: '1.0.0',
      );
      net = health.networkStatus == 'connected';
      status = health.canSend ? 'Ready' : 'Cannot send';
    } catch (_) {
      // Kept as "unreachable": the phone may be perfectly able to send, we just
      // cannot confirm the server is there.
    }

    if (!mounted) return;
    setState(() {
      _simAvailable = sim;
      _networkOk = net;
      _status = status;
      _lastHeartbeat = DateTime.now();
    });
  }
  void _start() {
    widget.runner.start();
    setState(() => _status = 'Running');
  }

  void _stop() {
    widget.runner.stop();
    setState(() => _status = 'Stopped');
  }

  @override
  Widget build(BuildContext context) {
    final online = widget.runner.isRunning;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              online ? 'RUNNING' : 'STOPPED',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w700,
                color: online ? Colors.green : Colors.red,
              ),
            ),
            const SizedBox(height: 4),
            Text(_status),
            const Divider(height: 20),
            _row('Server', online ? 'CONNECTED' : 'DISCONNECTED', online),
            _row('SIM', _simAvailable ? 'AVAILABLE' : 'NOT AVAILABLE', _simAvailable),
            _row('Network', _networkOk ? 'CONNECTED' : 'DISCONNECTED', _networkOk),
            _row('Sent', '$_sent', true),
            _row('Failed', '$_failed', _failed == 0),
            if (_lastHeartbeat != null) _row('Last heartbeat', _lastHeartbeat!.toIso8601String(), true),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: FilledButton(
                    onPressed: online ? null : _start,
                    child: const Text('Start gateway'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: online ? _stop : null,
                    child: const Text('Stop'),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: _refresh,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Refresh status'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, bool good) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(
            value,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: good ? Colors.green : Colors.red,
            ),
          ),
        ],
      ),
    );
  }
}


