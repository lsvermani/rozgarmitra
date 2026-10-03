import 'api_service.dart';

/// MSG91 OTP Widget configuration, fetched at runtime.
///
/// `tokenAuth` is required by the widget SDK, but it is deliberately **not**
/// baked into the Dart source: it is requested from the backend so it never
/// appears in the compiled APK or in version control. It is held in memory for
/// the lifetime of this object only.
class Msg91WidgetConfig {
  const Msg91WidgetConfig({
    required this.enabled,
    required this.widgetId,
    required this.tokenAuth,
    required this.otpLength,
    this.reason,
  });

  final bool enabled;
  final String widgetId;
  final String tokenAuth;
  final int otpLength;
  final String? reason;

  factory Msg91WidgetConfig.fromJson(Map<String, dynamic> json) {
    return Msg91WidgetConfig(
      enabled: json['enabled'] == true,
      widgetId: (json['widgetId'] ?? '').toString(),
      tokenAuth: (json['tokenAuth'] ?? '').toString(),
      otpLength: (json['otpLength'] as num?)?.toInt() ?? 6,
      reason: json['reason']?.toString(),
    );
  }
}

/// Talks to the backend about MSG91. The widget itself is driven by the
/// `sendotp_flutter_sdk` package; this class only handles the parts that must
/// stay server-side.
class Msg91Service {
  Msg91Service(this._api);

  final ApiService _api;

  /// Asks whether MSG91 is usable, and obtains the widget credentials if so.
  Future<Msg91WidgetConfig> widgetConfig() async {
    try {
      final res = await _api.get('/auth/msg91/widget-config');
      return Msg91WidgetConfig.fromJson(res);
    } on ApiException {
      return const Msg91WidgetConfig(
        enabled: false,
        widgetId: '',
        tokenAuth: '',
        otpLength: 6,
        reason: 'Could not reach the server.',
      );
    }
  }

  /// Exchanges the widget's access-token for a session.
  ///
  /// The backend re-validates that token with MSG91 before issuing anything, so
  /// a caller cannot obtain a session by bypassing the widget.
  Future<Map<String, dynamic>> complete(
    String accessToken, {
    String? role,
    String? name,
  }) {
    return _api.post('/auth/msg91/complete', {
      'accessToken': accessToken,
      if (role != null) 'role': role,
      if (name != null && name.isNotEmpty) 'name': name,
    });
  }
}

/// MSG91 expects the country code with no `+`, e.g. `918699142699`.
String msg91Identifier(String e164OrNational) {
  final digits = e164OrNational.replaceAll(RegExp(r'[^0-9]'), '');
  return digits.startsWith('91') && digits.length == 12
      ? digits
      : '91$digits';
}