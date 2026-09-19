import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  final _nameCtrl = TextEditingController();
  final _businessCtrl = TextEditingController();
  final _cityCtrl = TextEditingController();
  bool _saving = false;

  Future<void> _save() async {
    final auth = context.read<AuthProvider>();
    setState(() => _saving = true);
    try {
      final api = context.read<ApiService>();
      await api.put('/users/profile', {
        'name': _nameCtrl.text.trim(),
        if (auth.currentUser?.role == 'job_creator') 'businessName': _businessCtrl.text.trim(),
        'location': {'city': _cityCtrl.text.trim(), 'address': '', 'state': '', 'pincode': ''},
      });
      await auth.refreshProfile();
      if (!mounted) return;
      if (auth.currentUser!.role == 'worker') {
        context.go('/worker/home');
      } else {
        context.go('/creator/home');
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isCreator = auth.currentUser?.role == 'job_creator';

    return Scaffold(
      appBar: AppBar(title: const Text('Complete Your Profile')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Your Name')),
            if (isCreator) ...[
              const SizedBox(height: 12),
              TextField(controller: _businessCtrl, decoration: const InputDecoration(labelText: 'Business / Shop Name (optional)')),
            ],
            const SizedBox(height: 12),
            TextField(controller: _cityCtrl, decoration: const InputDecoration(labelText: 'City / Area')),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving...' : 'Save & Continue'),
            ),
          ],
        ),
      ),
    );
  }
}
