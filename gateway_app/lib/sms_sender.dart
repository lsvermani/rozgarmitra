import 'package:flutter/services.dart';

/// Sends a real SMS through the device's SIM.
///
/// Implemented over a [MethodChannel] (commands) plus an [EventChannel]
/// (receipts) rather than a plugin, so the *sent* and *delivered* broadcast
/// results can be captured. Android's `SmsManager` reports both through
/// `PendingIntent` callbacks, which is what lets the backend distinguish
/// "handed to the carrier" from "actually delivered" — information most SMS
/// gateways discard.
///
/// The native side lives in `MainActivity.kt`; see docs/SMS_GATEWAY.md.
class SmsSender {
  const SmsSender();

  static const _methods = MethodChannel('rozgarmitra/gateway');
  static const _events = EventChannel('rozgarmitra/gateway/events');

  /// Whether the SEND_SMS permission has been granted.
  Future<bool> hasPermission() async {
    final granted = await _methods.invokeMethod<bool>('hasPermission');
    return granted ?? false;
  }

  /// Triggers the system runtime-permission dialog.
  ///
  /// Android does not allow an app to request this silently, so the user has to
  /// tap Allow. Returns whether it is granted afterwards.
  Future<bool> requestPermission() async {
    final granted = await _methods.invokeMethod<bool>('requestPermission');
    return granted ?? false;
  }

  /// The SIM's own number, when the carrier exposes it. Frequently `null`.
  Future<String?> senderNumber() async {
    try {
      return await _methods.invokeMethod<String>('senderNumber');
    } on PlatformException {
      return null;
    }
  }

  /// Hands a message to the system SMS manager.
  ///
  /// [jobId] is echoed back with the delivery receipt so the result can be
  /// matched to the right queue entry.
  ///
  /// Returns as soon as Android accepts the message. The eventual outcome
  /// arrives asynchronously on [statusStream].
  Future<void> send(String to, String body, {required String jobId}) async {
    try {
      await _methods.invokeMethod<void>('sendSms', {
        'to': to,
        'body': body,
        'jobId': jobId,
      });
    } on PlatformException catch (e) {
      throw SmsException(e.code, e.message ?? 'Could not send the message.');
    }
  }

  /// Receipts: `jobId`, `status` (sent|delivered|failed),
  /// `androidMessageId`, `errorCode`, `errorMessage`.
  static Stream<Map<String, dynamic>> get statusStream =>
      _events.receiveBroadcastStream().map((event) {
        final map = <String, dynamic>{};
        if (event is Map) {
          for (final entry in event.entries) {
            map['${entry.key}'] = entry.value;
          }
        }
        return map;
      });
}

class SmsException implements Exception {
  SmsException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => message;
}