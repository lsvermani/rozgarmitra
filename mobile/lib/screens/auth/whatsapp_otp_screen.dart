import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../models/user.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/whatsapp_otp_service.dart';
import '../../utils/app_theme.dart';

/// WhatsApp OTP verification.
///
/// Two steps in one screen: enter the number, then enter the code that arrives
/// on WhatsApp. Deliberately self-contained - it does not touch the existing SMS
/// or Firebase paths, so switching it on cannot regress the login flow that is
/// already working.
///
/// The countdown here is a convenience only. The server enforces the real
/// resend cooldown and attempt limit, so skipping the timer gains nothing.
class WhatsappOtpScreen extends StatefulWidget {
  const WhatsappOtpScreen({super.key, required this.role});

  final String role; // 'worker' | 'job_creator'

  @override
  State<WhatsappOtpScreen> createState() => _WhatsappOtpScreenState();
}

class _WhatsappOtpScreenState extends State<WhatsappOtpScreen> {
  final _mobileCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _codeSent = false;
  bool _busy = false;
  String? _error;
  bool _serverUnreachable = false;
  Timer? _timer;
  int _secondsLeft = 0;
  String? _testOtp;

  @override
  void dispose() {
    _timer?.cancel();
    _mobileCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  /// Built from the running provider so the screen follows a server-address
  /// change in the settings page.
  WhatsappOtpService get _api {
    final api = context.read<AuthProvider>().api;
    return WhatsappOtpService(api);
  }

  void _startCountdown(int seconds) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        _secondsLeft -= 1;
        if (_secondsLeft <= 0) timer.cancel();
      });
    });
  }

  Future<void> _request({ bool resend = false }) async {
    setState(() {
      _error = null;
      _serverUnreachable = false;
    });

    final mobile = _mobileCtrl.text.trim();
    if (!RegExp(r'^[6-9]\d{9}$').hasMatch(mobile)) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }

    setState(() => _busy = true);
    try {
      final service = _api;
      final result = resend
          ? await service.resendOtp(mobile, role: widget.role)
          : await service.sendOtp(mobile, role: widget.role);

      if (!mounted) return;
      setState(() {
        _codeSent = true;
        _testOtp = result.testOtp;
        // Auto-fill only outside production; the server refuses to send it there.
        if (result.testOtp != null) _otpCtrl.text = result.testOtp!;
      });
      _startCountdown(result.resendAfter);
    } on WhatsappUnavailableException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _serverUnreachable = e.isNetworkError;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _error = null;
      _serverUnreachable = false;
    });

    final otp = _otpCtrl.text.trim();
    if (otp.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from WhatsApp.');
      return;
    }

    setState(() => _busy = true);
    try {
      final res = await _api.verifyOtp(
        _mobileCtrl.text.trim(),
        otp,
        role: widget.role,
      );
      if (!mounted) return;

      final user = AppUser.fromJson(res['user']);
      context.read<AuthProvider>().adoptSession(res);

      final needsProfile = user.name.isEmpty;
      if (needsProfile) {
        context.go('/profile-setup');
      } else if (user.role == 'worker') {
        context.go('/worker/home');
      } else {
        context.go('/creator/home');
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _serverUnreachable = e.isNetworkError;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
  @override
  Widget build(BuildContext context) {
    final masked = _mobileCtrl.text.trim().isEmpty
        ? 'your number'
        : '+91 ${_mobileCtrl.text.trim()}';

    return Scaffold(
      appBar: AppBar(title: const Text('Verify with WhatsApp')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.role == 'worker'
                  ? 'Sign in with WhatsApp OTP'
                  : 'Job creator sign in with WhatsApp OTP',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'We will send a one-time code to your WhatsApp. '
              'Standard messaging rates may apply.',
            ),
            const SizedBox(height: 24),

            if (!_codeSent) ...[
              TextField(
                controller: _mobileCtrl,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(
                  labelText: 'Mobile Number',
                  prefixText: '+91  ',
                  counterText: '',
                ),
              ),
            ] else ...[
              Text(
                'OTP sent to $masked',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _otpCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                autofocus: true,
                style: const TextStyle(
                  fontSize: 22,
                  letterSpacing: 8,
                  fontWeight: FontWeight.w700,
                ),
                decoration: const InputDecoration(
                  labelText: 'Enter Verification Code',
                  counterText: '',
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  if (_secondsLeft > 0)
                    Expanded(
                      child: Text(
                        'Resend available in ${_secondsLeft}s',
                        style: const TextStyle(color: AppColors.textMuted),
                      ),
                    )
                  else
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _request(resend: true),
                        icon: const Icon(Icons.refresh, size: 18),
                        label: const Text('Resend OTP'),
                      ),
                    ),
                ],
              ),
            ],

            if (_testOtp != null) ...[
              const SizedBox(height: 12),
              _NoticeBox(
                text: 'Test mode: OTP $_testOtp (auto-filled). No message is sent.',
              ),
            ],

            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: AppColors.danger)),
            ],

            if (_serverUnreachable) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => context.push('/admin/server-settings'),
                  icon: const Icon(Icons.settings_outlined, size: 18),
                  label: const Text('Server unreachable â€” open server settings'),
                ),
              ),
            ],

            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _busy ? null : (_codeSent ? _verify : () => _request()),
              child: Text(
                _busy
                    ? 'Please wait...'
                    : (_codeSent ? 'Verify OTP' : 'Send OTP'),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _busy
                  ? null
                  : () {
                      _timer?.cancel();
                      setState(() {
                        _codeSent = false;
                        _error = null;
                        _otpCtrl.clear();
                        _secondsLeft = 0;
                      });
                    },
              child: const Text('Use a different number'),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoticeBox extends StatelessWidget {
  const _NoticeBox({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.primaryLight.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.info_outline, size: 16, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 13, color: AppColors.primaryDark),
            ),
          ),
        ],
      ),
    );
  }
}

