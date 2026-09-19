import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
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

  Future<void> _sendOtp() async {
    final auth = context.read<AuthProvider>();
    setState(() => _error = null);
    if (_mobileCtrl.text.trim().length != 10) {
      setState(() => _error = 'Enter a valid 10-digit mobile number.');
      return;
    }
    try {
      await auth.sendOtp(_mobileCtrl.text.trim(), role: widget.role);
      setState(() => _otpSent = true);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  Future<void> _verifyOtp() async {
    final auth = context.read<AuthProvider>();
    setState(() => _error = null);
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
      setState(() => _error = e.toString());
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
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!, style: const TextStyle(color: AppColors.danger)),
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
