import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.currentUser;
    if (user == null) return const SizedBox.shrink();

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: CircleAvatar(
              radius: 44,
              backgroundColor: AppColors.primaryLight,
              child: Text(
                user.name.isNotEmpty ? user.name[0].toUpperCase() : '?',
                style: const TextStyle(fontSize: 32, color: AppColors.primary, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Center(child: Text(user.businessName ?? user.name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800))),
          Center(child: Text(user.mobile, style: const TextStyle(color: AppColors.textMuted))),
          const SizedBox(height: 8),
          Center(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('⭐ ${user.rating.toStringAsFixed(1)} (${user.ratingCount})'),
                const SizedBox(width: 12),
                if (user.verified)
                  const Chip(label: Text('Verified ✓'), backgroundColor: AppColors.primaryLight, visualDensity: VisualDensity.compact),
              ],
            ),
          ),
          const SizedBox(height: 24),
          if (user.role == 'worker') ...[
            const Text('Skills', style: TextStyle(fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: user.skills.map((s) => Chip(label: Text(s))).toList(),
            ),
            const SizedBox(height: 16),
            _StatRow(label: 'Experience', value: '${user.experienceYears} Years'),
            _StatRow(label: 'Completed Jobs', value: '${user.completedJobs}'),
          ] else
            _StatRow(label: 'Completed Jobs', value: '${user.completedJobs}'),
          const SizedBox(height: 32),
          OutlinedButton(
            onPressed: () async {
              await auth.logout();
              if (context.mounted) context.go('/role-select');
            },
            child: const Text('Log Out'),
          ),
        ],
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  final String label;
  final String value;
  const _StatRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textMuted)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
