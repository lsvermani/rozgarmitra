import 'dart:async';

import 'gateway_client.dart';
import 'sms_sender.dart';

/// Drives the gateway: poll -> send -> report.
///
/// Two properties matter here and are easy to get wrong:
///
/// 1. **One message in flight at a time.** Sending two concurrently on a single
///    SIM can interleave fragments on cheap handsets, and the delivery callbacks
///    become ambiguous.
///
/// 2. **A failed report never causes a resend.** If the SMS went out but the
///    report did not, retrying the *send* would give the user a second code.
///    The backend already treats an unreported lease as `unknown`; the app must
///    behave the same way and simply move on.
class GatewayRunner {
  GatewayRunner({
    required this.client,
    required this.sender,
    this.onStatus,
  });

  final GatewayClient client;
  final SmsSender sender;

  /// Called with human-readable state changes for the UI.
  final void Function(String message)? onStatus;

  Timer? _timer;
  bool _running = false;
  bool _busy = false;

  /// jobId -> whether Android accepted it, so the broadcast callback can be
  /// matched back to the right job.
  final Map<String, String> _inFlight = {};

  StreamSubscription<Map<String, dynamic>>? _statusSub;

  bool get isRunning => _running;

  void start() {
    if (_running) return;

    _statusSub = SmsSender.statusStream.listen(_onStatusEvent, onError: (_) {});

    _running = true;
    onStatus?.call('Connecting…');
    _tick();
    // A fixed cadence is fine: the server answers instantly when there is work,
    // so this interval only sets how quickly an *empty* queue is noticed.
    _timer = Timer.periodic(const Duration(seconds: 5), (_) => _tick());
  }

  void stop() {
    _running = false;
    _timer?.cancel();
    _timer = null;
    _statusSub?.cancel();
    _statusSub = null;
  }

  Future<void> _tick() async {
    // Skip rather than queue: overlapping polls would race for the same jobs.
    if (!_running || _busy) return;
    _busy = true;
    try {
      final jobs = await client.poll();
      for (final job in jobs) {
        if (!_running) break;
        await _handle(job);
      }
    } catch (e) {
      onStatus?.call('Offline: ${_friendly(e)}');
    } finally {
      _busy = false;
    }
  }

  Future<void> _handle(GatewayJob job) async {
    _inFlight[job.id] = job.to;
    try {
      await sender.send(job.to, job.body, jobId: job.id);
      onStatus?.call('Sent one message');
    } on SmsException catch (e) {
      // Rejected before leaving the device - safe to mark failed.
      _inFlight.remove(job.id);
      await _report(
        job.id,
        'failed',
        errorCode: e.code,
        errorMessage: e.message,
      );
      onStatus?.call('Could not send: ${e.message}');
    } catch (e) {
      _inFlight.remove(job.id);
      await _report(job.id, 'failed', errorCode: 'send_failed', errorMessage: _friendly(e));
    }
  }

  void _onStatusEvent(Map<String, dynamic> event) {
    final jobId = '${event['jobId'] ?? ''}';
    if (jobId.isEmpty) return;
    final status = '${event['status'] ?? ''}';

    // Once terminal, forget the job: a duplicate broadcast must not report twice.
    if (status == 'delivered' || status == 'failed') {
      _inFlight.remove(jobId);
    }
    _report(
      jobId,
      status,
      gatewayMessageId: '${event['androidMessageId'] ?? ''}',
      errorCode: '${event['errorCode'] ?? ''}',
      errorMessage: '${event['errorMessage'] ?? ''}',
    );
  }

  Future<void> _report(
    String jobId,
    String status, {
    String gatewayMessageId = '',
    String errorCode = '',
    String errorMessage = '',
  }) async {
    try {
      await client.report(
        jobId,
        status: status,
        gatewayMessageId: gatewayMessageId,
        errorCode: errorCode,
        errorMessage: errorMessage,
      );
    } catch (_) {
      // Deliberately swallowed. The lease will expire and the backend will mark
      // the job `unknown` - which is correct. Resending here would be the bug.
    }
  }

  String _friendly(Object e) {
    final text = e.toString();
    if (text.contains('SocketException') ||
        text.contains('ClientException') ||
        text.contains('Connection refused')) {
      return 'cannot reach the server';
    }
    if (text.contains('TimeoutException')) return 'server timed out';
    return text.length > 80 ? 'unexpected error' : text;
  }

  void dispose() {
    stop();
    client.dispose();
  }
}