import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../config/config_manager.dart';
import '../../utils/app_theme.dart';

/// Onboarding / entry screen — chooses Worker vs Job Creator login.
/// Gradient hero + large tappable option cards, designed for low digital
/// literacy: big touch targets, high contrast, simple Hinglish copy.
class EntryWorkScreen extends StatelessWidget {
  const EntryWorkScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final topPad = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: AppColors.background,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(32)),
              child: SizedBox(
                width: double.infinity,
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: Image.asset(
                        'assets/images/hero.jpg',
                        fit: BoxFit.cover,
                        alignment: const Alignment(0, -0.1),
                      ),
                    ),
                    Positioned.fill(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              AppColors.primaryDark.withValues(alpha: 0.92),
                              AppColors.primary.withValues(alpha: 0.82),
                              const Color(0xFF14B8A6).withValues(alpha: 0.68),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Padding(
                      padding: EdgeInsets.fromLTRB(24, topPad + 32, 24, 32),
                      child: Column(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.15),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1.5),
                            ),
                            child: const Icon(Icons.handshake_outlined, size: 40, color: Colors.white),
                          ),
                          const SizedBox(height: 16),
                          const Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: 'Rozgar'),
                                TextSpan(text: 'Mitra', style: TextStyle(color: AppColors.accent)),
                              ],
                            ),
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 30,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.5,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            'Rozgarmitra kaam aur rozgar ko saath laata hai.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 14, height: 1.4),
                          ),
                          const SizedBox(height: 18),
                          const Wrap(
                            alignment: WrapAlignment.center,
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              _HeroChip('📍 Local jobs'),
                              _HeroChip('⚡ Instant OTP'),
                              _HeroChip('💰 Daily wages'),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Aap kis liye aaye hain?',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppColors.textPrimary),
                  ),
                  const SizedBox(height: 6),
                  const Text('Choose your way to get started', style: TextStyle(color: AppColors.textMuted)),
                  const SizedBox(height: 20),
                  _EntryOption(
                    icon: Icons.work_outline_rounded,
                    title: 'Worker login',
                    subtitle: 'Find local work and accept tasks',
                    color: AppColors.primary,
                    onTap: () => context.go('/login?role=worker'),
                  ),
                  const SizedBox(height: 14),
                  _EntryOption(
                    icon: Icons.business_center_outlined,
                    title: 'Job creator login',
                    subtitle: 'Add tasks and find reliable workers',
                    color: AppColors.accent,
                    onTap: () => context.go('/login?role=job_creator'),
                  ),
                  const SizedBox(height: 18),
                  InkWell(
                    onTap: () => context.go('/role-select'),
                    borderRadius: BorderRadius.circular(16),
                    child: Container(
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: AppColors.primaryLight.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: AppColors.primary.withValues(alpha: 0.35)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.person_add_alt_1_outlined, color: AppColors.primaryDark),
                          const SizedBox(width: 12),
                          const Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Naye ho Rozgarmitra par?',
                                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                                ),
                                SizedBox(height: 2),
                                Text(
                                  'Naya account banayein — Worker ya Job Creator chuniye.',
                                  style: TextStyle(color: AppColors.textMuted, fontSize: 12.5),
                                ),
                              ],
                            ),
                          ),
                          const Icon(Icons.chevron_right_rounded, color: AppColors.primaryDark),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  // Fresh install / unconfigured device: give an administrator a
                  // way in without a working login. Once a server has been saved
                  // this disappears, so ordinary users never see it.
                  if (!context.watch<ConfigManager>().isConfigured)
                    Center(
                      child: TextButton.icon(
                        onPressed: () => context.push('/admin/server-settings'),
                        icon: const Icon(Icons.settings_outlined, size: 18),
                        label: const Text('Server settings'),
                      ),
                    ),
                ],
              ),
            ),
            const Center(
              child: Text(
                'Kaam bhi, Rozgar bhi.',
                style: TextStyle(color: AppColors.textMuted, fontStyle: FontStyle.italic),
              ),
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final String label;
  const _HeroChip(this.label);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
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
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.10),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(18),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [color, color.withValues(alpha: 0.75)]),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: Colors.white, size: 26),
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
                Container(
                  padding: const EdgeInsets.all(6),
                  decoration: BoxDecoration(color: color.withValues(alpha: 0.10), shape: BoxShape.circle),
                  child: Icon(Icons.arrow_forward_rounded, size: 18, color: color),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
