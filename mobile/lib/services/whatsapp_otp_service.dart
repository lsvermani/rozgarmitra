import 'api_service.dart';

/// WhatsApp OTP support.
///
/// Talks **only** to this app's backend. The Meta access token, phone number ID
/// and HMAC pepper live in the server's environment and are never present in the
/// APK - see docs/WHATSAPP_OTP.md.
class WhatsappOtpResult {
  const WhatsappOtpResult({
    required this.expiresIn,
    required this.resendAfter,
    this.testOtp,
  });

  final int expiresIn;
  final int resendAfter;

  /// Only populated when the server runs with `WHATSAPP_TEST_MODE=true`, which
  /// it refuses to do in production. Used by the widget tests.
  final String? testOtp;
}

/// Raised when the server reports the WhatsApp service is not usable, so the
/// caller can fall back to the existing SMS / Firebase flow.
class WhatsappUnavailableException implements Exception {
  WhatsappUnavailableException(this.message);

  final String message;

  @override
  String toString() => message;
}

class WhatsappOtpService {
  WhatsappOtpService(this._api);

  final ApiService _api;

  /// Whether the backend can deliver OTPs over WhatsApp right now.
  Future<bool> isAvailable() async {
    try {
      final res = await _api.get('/auth/whatsapp/status');
      return res['active'] == true;
    } on ApiException {
      return false;
    }
  }

  /// Requests a code for [mobile].
  ///
  /// Throws [WhatsappUnavailableException] when the service is switched off, so
  /// the caller can fall back rather than showing a dead end.
  Future<WhatsappOtpResult> sendOtp(
    String mobile, {
    String? role,
    String purpose = 'registration',
  }) async {
    try {
      final res = await _api.post('/auth/whatsapp/send-otp', {
        'phone': mobile,
        'purpose': purpose,
        if (role != null) 'role': role,
      });
      return WhatsappOtpResult(
        expiresIn: (res['expiresIn'] as num?)?.toInt() ?? 300,
        resendAfter: (res['resendAfter'] as num?)?.toInt() ?? 60,
        testOtp: res['testOtp']?.toString(),
      );
    } on ApiException catch (e) {
      if (e.statusCode == 503) throw WhatsappUnavailableException(e.message);
      rethrow;
    }
  }

  /// Resends after the cooldown has elapsed. Same contract as [sendOtp].
  Future<WhatsappOtpResult> resendOtp(
    String mobile, {
    String? role,
    String purpose = 'registration',
  }) async {
    try {
      final res = await _api.post('/auth/whatsapp/resend-otp', {
        'phone': mobile,
        'purpose': purpose,
        if (role != null) 'role': role,
      });
      return WhatsappOtpResult(
        expiresIn: (res['expiresIn'] as num?)?.toInt() ?? 300,
        resendAfter: (res['resendAfter'] as num?)?.toInt() ?? 60,
        testOtp: res['testOtp']?.toString(),
      );
    } on ApiException catch (e) {
      if (e.statusCode == 503) throw WhatsappUnavailableException(e.message);
      rethrow;
    }
  }

  /// Verifies [otp]. Returns the backend's `{ token, user }` envelope, identical
  /// to the SMS endpoint's, so the caller stores the session the same way.
  Future<Map<String, dynamic>> verifyOtp(
    String mobile,
    String otp, {
    String? role,
    String purpose = 'registration',
    String? name,
  }) {
    return _api.post('/auth/whatsapp/verify-otp', {
      'phone': mobile,
      'otp': otp,
      'purpose': purpose,
      if (role != null) 'role': role,
      if (name != null && name.isNotEmpty) 'name': name,
    });
  }
}