import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

class LoginScreen extends StatefulWidget {
  final String role; // 'worker' | 'job_creator'
  const LoginScreen({super.key, required this.role});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _mobileCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  bool _otpSent = false;
  String? _error;

  /// True when the last failure looked like "cannot reach the server", which is
  /// the signal that the saved backend address may be wrong. Surfaces the
  /// administrator's recovery path (Server settings) right on the login screen.
  bool _serverUnreachable = false;

  Future<void> _sendOtp() async {
    final auth = context.read<AuthProvider>();
    setState(() {
      _error = null;
      _serverUnreachable = false;
    });
    if (_mobileCtrl.text.trim().length != 10) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      await auth.sendOtp(_mobileCtrl.text.trim(), role: widget.role);
      if (!mounted) return;
      setState(() {
        _otpSent = true;
        // In demo mode the backend returns the OTP so it can be auto-filled.
        final demoOtp = auth.demoOtp;
        if (demoOtp != null) _otpCtrl.text = demoOtp;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _serverUnreachable = e is ApiException && e.isNetworkError;
      });
    }
  }

  Future<void> _verifyOtp() async {
    final auth = context.read<AuthProvider>();
    setState(() {
      _error = null;
      _serverUnreachable = false;
    });
    try {
      await auth.verifyOtp(_mobileCtrl.text.trim(), _otpCtrl.text.trim(), role: widget.role);
      if (!mounted) return;
      final needsProfile = auth.currentUser?.name.isEmpty ?? true;
      if (needsProfile) {
        context.go('/profile-setup');
      } else if (auth.currentUser!.role == 'worker') {
        context.go('/worker/home');
      } else {
        context.go('/creator/home');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _serverUnreachable = e is ApiException && e.isNetworkError;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Login')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              widget.role == 'worker' ? '👷 Job Seeker Login' : '🏠 Job Creator Login',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 24),
            TextField(
              controller: _mobileCtrl,
              enabled: !_otpSent,
              keyboardType: TextInputType.phone,
              maxLength: 10,
              decoration: const InputDecoration(labelText: 'Mobile Number', prefixText: '+91  ', counterText: ''),
            ),
            if (_otpSent) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _otpCtrl,
                keyboardType: TextInputType.number,
                maxLength: 6,
                decoration: const InputDecoration(labelText: 'Enter OTP', counterText: ''),
              ),
              if (auth.demoOtp != null)
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
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
                          'Demo mode: OTP ${auth.demoOtp} (auto-filled) — no SMS is sent.',
                          style: const TextStyle(fontSize: 13, color: AppColors.primaryDark),
                        ),
                      ),
                    ],
                  ),
                ),
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
              ),
            // Recovery path: the saved backend may be wrong or offline, so let an
            // administrator open the protected server settings page from here.
            if (_serverUnreachable)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => context.push('/admin/server-settings'),
                  icon: const Icon(Icons.settings_outlined, size: 18),
                  label: const Text('Server unreachable — open server settings'),
                ),
              ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: auth.isLoading ? null : (_otpSent ? _verifyOtp : _sendOtp),
              child: Text(auth.isLoading ? 'Please wait...' : (_otpSent ? 'Verify' : 'Continue')),
            ),
          ],
        ),
      ),
    );
  }
}
