import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../utils/app_theme.dart';

class EntryWorkScreen extends StatelessWidget {
  const EntryWorkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              Text(
                'ENTRYWORK',
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1,
                    ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Rozgarmitra kaam aur rozgar ko saath laata hai.',
                style: TextStyle(color: AppColors.textMuted),
              ),
              const SizedBox(height: 56),
              const Text(
                'Aap kis liye aaye hain?',
                style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              const Text(
                'Choose your way to get started',
                style: TextStyle(color: AppColors.textMuted),
              ),
              const SizedBox(height: 28),
              _EntryOption(
                icon: Icons.work_outline_rounded,
                title: 'Worker login',
                subtitle: 'Find local work and accept tasks',
                color: AppColors.primary,
                onTap: () => context.go('/login?role=worker'),
              ),
              const SizedBox(height: 16),
              _EntryOption(
                icon: Icons.business_center_outlined,
                title: 'Job creator login',
                subtitle: 'Add tasks and find reliable workers',
                color: AppColors.accent,
                onTap: () => context.go('/login?role=job_creator'),
              ),
              const Spacer(),
              const Center(
                child: Text(
                  'Kaam bhi, Rozgar bhi.',
                  style: TextStyle(color: AppColors.textMuted, fontStyle: FontStyle.italic),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EntryOption extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _EntryOption({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.12),
              foregroundColor: color,
              child: Icon(icon),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: AppColors.textMuted, fontSize: 13)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.textMuted),
          ],
        ),
      ),
    );
  }
}
