import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/config_manager.dart';
import '../../security/admin_passcode.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';

/// Proof that a human authorised to change server settings unlocked the page.
class AdminUnlock {
  const AdminUnlock({required this.actor, required this.viaBackend, this.adminToken});

  /// Non-sensitive label for the audit trail (`admin-otp:9999999999`).
  final String actor;

  /// True when a real backend administrator session was verified (preferred).
  final bool viaBackend;

  /// Short-lived admin JWT used only for sending the audit line to the backend.
  /// Kept in memory for the lifetime of the settings screen — never persisted.
  final String? adminToken;
}

/// Blocks the Server / Admin Settings page until an administrator proves who
/// they are.
///
/// Two independent unlock paths:
///
/// 1. **Administrator login (preferred)** — phone + OTP against the *current*
///    backend, then a role check (`admin`) plus a server-side admin-only call.
///    This is the same JWT auth the rest of the app uses; no extra credentials
///    are stored anywhere.
/// 2. **Device recovery passcode** — the escape hatch for the classic support
///    case: the saved server address is wrong, so no login is possible at all.
///    The passcode is created on first use and stored as a PBKDF2 hash in
///    encrypted storage. It only ever unlocks *local* configuration editing.
class AdminGate extends StatefulWidget {
  const AdminGate({
    super.key,
    required this.builder,
    this.intro,
    this.onUnlocked,
  });

  /// Builds the protected content once [AdminGate] is unlocked.
  final Widget Function(BuildContext context, AdminUnlock unlock) builder;

  /// Optional explanatory text shown above the unlock form.
  final String? intro;

  final ValueChanged<AdminUnlock>? onUnlocked;

  @override
  State<AdminGate> createState() => _AdminGateState();
}

class _AdminGateState extends State<AdminGate> {
  AdminUnlock? _unlock;
  bool _loading = false;
  String? _error;

  // Administrator OTP path
  final _mobileController = TextEditingController();
  final _otpController = TextEditingController();
  bool _otpRequested = false;

  // Device passcode path
  final _passcodeController = TextEditingController();
  final _confirmController = TextEditingController();
  bool _hasPasscode = true;
  bool _creatingPasscode = false;
  int _failedAttempts = 0;
  DateTime? _lockUntil;

  @override
  void initState() {
    super.initState();
    _refreshPasscodeState();
  }

  @override
  void dispose() {
    _mobileController.dispose();
    _otpController.dispose();
    _passcodeController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  ConfigManager get _config => context.read<ConfigManager>();

  Future<void> _refreshPasscodeState() async {
    final exists = await _config.store.hasAdminPasscode();
    if (!mounted) return;
    setState(() {
      _hasPasscode = exists;
      _creatingPasscode = !exists;
    });
  }

  void _unlockWith(AdminUnlock unlock) {
    setState(() {
      _unlock = unlock;
      _loading = false;
      _error = null;
    });
    widget.onUnlocked?.call(unlock);
  }

  // --- Path 1: administrator OTP --------------------------------------------

  Future<void> _sendAdminOtp() async {
    final mobile = _mobileController.text.trim();
    if (mobile.length < 10) {
      setState(() => _error = 'Enter the 10-digit mobile number of an administrator account.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // A forked client: verifying an administrator must never replace the
      // session of the user who is currently signed in on this device.
      final api = context.read<ApiService>().fork();
      final res = await api.post('/auth/send-otp', {'mobile': mobile, 'role': 'admin'});
      if (!mounted) return;
      final demoOtp = res['demoOtp']?.toString();
      setState(() {
        _otpRequested = true;
        if (demoOtp != null) _otpController.text = demoOtp;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verifyAdminOtp() async {
    final mobile = _mobileController.text.trim();
    final otp = _otpController.text.trim();
    if (otp.length < 4) {
      setState(() => _error = 'Enter the OTP you received.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final api = context.read<ApiService>().fork();
      final res = await api.post('/auth/verify-otp', {
        'mobile': mobile,
        'otp': otp,
        'role': 'admin',
      });

      final user = (res['user'] as Map?)?.cast<String, dynamic>() ?? const {};
      if (user['role'] != 'admin') {
        await _config.logEvent(
          action: 'denied',
          actor: 'admin-otp:${_mask(mobile)}',
          summary: 'OTP login refused: account role is "${user['role']}".',
          success: false,
        );
        if (!mounted) return;
        setState(() => _error = 'This account is not an administrator.');
        return;
      }

      final token = res['token']?.toString();
      api.setToken(token);

      // Independent, server-side proof that this token really has admin rights.
      if (token != null) {
        try {
          await api.get('/admin/server-config-log');
        } on ApiException catch (error) {
          if (error.statusCode == 403) {
            await _config.logEvent(
              action: 'denied',
              actor: 'admin-otp:${_mask(mobile)}',
              summary: 'Backend rejected the admin session (HTTP 403).',
              success: false,
            );
            if (!mounted) return;
            setState(() => _error = 'The server refused administrator access for this account.');
            return;
          }
          // 404 = backend without the audit endpoint; the JWT role check above
          // still applies, so continue.
        }
      }

      final actor = 'admin-otp:${_mask(mobile)}';
      await _config.logEvent(
        action: 'unlock',
        actor: actor,
        summary: 'Admin Settings unlocked with a backend administrator OTP session.',
        success: true,
      );
      if (!mounted) return;
      _unlockWith(AdminUnlock(actor: actor, viaBackend: true, adminToken: token));
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // --- Path 2: device recovery passcode -------------------------------------

  Future<void> _submitPasscode() async {
    final lock = _lockUntil;
    if (lock != null && DateTime.now().isBefore(lock)) {
      final seconds = lock.difference(DateTime.now()).inSeconds + 1;
      setState(() => _error = 'Too many attempts. Try again in $seconds s.');
      return;
    }

    final passcode = _passcodeController.text;

    if (_creatingPasscode) {
      final problem = AdminPasscode.validate(passcode);
      if (problem != null) {
        setState(() => _error = problem);
        return;
      }
      if (passcode != _confirmController.text) {
        setState(() => _error = 'The two passcodes do not match.');
        return;
      }

      setState(() {
        _loading = true;
        _error = null;
      });
      await _config.store.setAdminPasscode(passcode);
      await _config.logEvent(
        action: 'unlock',
        actor: 'device-admin',
        summary: 'Device recovery passcode created on this device.',
        success: true,
      );
      if (!mounted) return;
      _unlockWith(const AdminUnlock(actor: 'device-admin', viaBackend: false));
      return;
    }

    if (passcode.isEmpty) {
      setState(() => _error = 'Enter the device passcode.');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });
    final ok = await _config.store.verifyAdminPasscode(passcode);
    if (!mounted) return;

    if (ok) {
      _failedAttempts = 0;
      await _config.logEvent(
        action: 'unlock',
        actor: 'device-admin',
        summary: 'Admin Settings unlocked with the device recovery passcode.',
        success: true,
      );
      if (!mounted) return;
      _unlockWith(const AdminUnlock(actor: 'device-admin', viaBackend: false));
      return;
    }

    _failedAttempts++;
    if (_failedAttempts >= 5) {
      _failedAttempts = 0;
      _lockUntil = DateTime.now().add(const Duration(seconds: 30));
    }
    await _config.logEvent(
      action: 'denied',
      actor: 'device-admin',
      summary: 'Incorrect device recovery passcode.',
      success: false,
    );
    if (!mounted) return;
    setState(() {
      _loading = false;
      _error = 'Incorrect passcode.'
          '${_lockUntil != null ? ' Locked for 30 seconds.' : ''}';
    });
  }

  /// Masks a phone number for the audit trail (`******9999`).
  static String _mask(String mobile) {
    if (mobile.length <= 4) return '****';
    return '******${mobile.substring(mobile.length - 4)}';
  }

  @override
  Widget build(BuildContext context) {
    final unlock = _unlock;
    if (unlock != null) return widget.builder(context, unlock);
    return _buildUnlockForm(context);
  }

  Widget _buildUnlockForm(BuildContext context) {
    final config = context.watch<ConfigManager>();
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560),
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primaryLight,
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Row(
                    children: [
                      Icon(Icons.lock_outline, color: AppColors.primary),
                      SizedBox(width: 10),
                      // Flexible so a large system font size cannot overflow.
                      Expanded(
                        child: Text('Administrator access only',
                            style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    widget.intro ??
                        'Changing the server address affects every user of this app.',
                    style: const TextStyle(fontSize: 13, color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 10),
                  Text('Current API address: ${config.apiBaseUrl}',
                      style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                ],
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 16),
              _errorBanner(_error!),
            ],
            const SizedBox(height: 20),
            _card(
              title: 'Administrator login (recommended)',
              subtitle:
                  'Verified by the current backend: only an account whose role is "admin" can pass.',
              child: Column(
                children: [
                  TextField(
                    controller: _mobileController,
                    keyboardType: TextInputType.phone,
                    maxLength: 10,
                    decoration: const InputDecoration(
                      labelText: 'Administrator mobile number',
                      prefixIcon: Icon(Icons.smartphone),
                      counterText: '',
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (_otpRequested) ...[
                    TextField(
                      controller: _otpController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'OTP',
                        prefixIcon: Icon(Icons.password),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed:
                          _loading ? null : (_otpRequested ? _verifyAdminOtp : _sendAdminOtp),
                      icon: Icon(_otpRequested ? Icons.verified_user : Icons.sms_outlined),
                      label: Text(_otpRequested ? 'Verify & unlock' : 'Send OTP'),
                    ),
                  ),
                  if (_otpRequested)
                    TextButton(
                      onPressed: _loading
                          ? null
                          : () => setState(() {
                                _otpRequested = false;
                                _otpController.clear();
                              }),
                      child: const Text('Change number'),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            _card(
              title: _creatingPasscode
                  ? 'Create a device recovery passcode'
                  : 'Device recovery passcode',
              subtitle: _creatingPasscode
                  ? 'Needed when the saved server address is wrong and login is impossible. '
                      'Store it safely — it is the way back in from this screen.'
                  : (_hasPasscode
                      ? 'A passcode is already set on this device. Use it when the server '
                          'address is wrong or the backend is offline.'
                      : 'Use this when the server address is wrong or the backend is offline.'),
              child: Column(
                children: [
                  TextField(
                    controller: _passcodeController,
                    obscureText: true,
                    decoration: InputDecoration(
                      labelText: _creatingPasscode ? 'New passcode' : 'Device passcode',
                      prefixIcon: const Icon(Icons.key_outlined),
                      helperText: _creatingPasscode
                          ? 'At least ${AdminPasscode.minLength} characters'
                          : null,
                    ),
                  ),
                  if (_creatingPasscode) ...[
                    const SizedBox(height: 8),
                    TextField(
                      controller: _confirmController,
                      obscureText: true,
                      decoration: const InputDecoration(
                        labelText: 'Confirm passcode',
                        prefixIcon: Icon(Icons.key_outlined),
                      ),
                    ),
                  ],
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _loading ? null : _submitPasscode,
                      icon: const Icon(Icons.lock_open),
                      label: Text(_creatingPasscode ? 'Create & unlock' : 'Unlock'),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              'Security notes\n'
              '• Server settings never store MongoDB credentials, JWT secrets or passwords.\n'
              '• The passcode is kept as a salted PBKDF2 hash in encrypted storage; URLs are\n'
              '  validated and a connection test must pass before a new address is saved.\n'
              '• Production addresses must use https://.',
              style: TextStyle(fontSize: 12, color: AppColors.textMuted),
            ),
            const SizedBox(height: 32),
          ],
        ),
      ),
    );
  }

  Widget _card({required String title, required String subtitle, required Widget child}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _errorBanner(String message) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEE2E2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppColors.danger, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(message, style: const TextStyle(color: AppColors.danger, fontSize: 13)),
          ),
        ],
      ),
    );
  }
}
