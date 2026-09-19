import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../utils/app_theme.dart';

class RoleSelectScreen extends StatelessWidget {
  const RoleSelectScreen({super.key});

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
              Text('ROZGARMITRA', style: Theme.of(context).textTheme.headlineMedium?.copyWith(color: AppColors.primary)),
              const SizedBox(height: 4),
              const Text('Kaam bhi, Rozgar bhi.', style: TextStyle(color: AppColors.textMuted, fontStyle: FontStyle.italic)),
              const SizedBox(height: 48),
              const Text('Aap kya karna chahte hain?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              const Text('What do you want to do?', style: TextStyle(color: AppColors.textMuted)),
              const SizedBox(height: 32),
              _RoleCard(
                emoji: '👷',
                title: 'Mujhe Kaam Chahiye',
                subtitle: 'I need Work — Find jobs near you',
                onTap: () => context.go('/login?role=worker'),
              ),
              const SizedBox(height: 16),
              _RoleCard(
                emoji: '🏠',
                title: 'Mujhe Worker Chahiye',
                subtitle: 'I need a Worker — Post jobs & hire',
                onTap: () => context.go('/login?role=job_creator'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  final String emoji;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _RoleCard({required this.emoji, required this.title, required this.subtitle, required this.onTap});

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
            Text(emoji, style: const TextStyle(fontSize: 40)),
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
