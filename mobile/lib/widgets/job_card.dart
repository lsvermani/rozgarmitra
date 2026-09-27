import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/job.dart';
import '../utils/app_theme.dart';
import '../utils/format_utils.dart';

class JobCard extends StatelessWidget {
  final Job job;
  final VoidCallback onTap;

  const JobCard({super.key, required this.job, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final dateLabel = DateFormat('d MMM').format(job.date);

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(job.title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 14,
                runSpacing: 6,
                children: [
                  _iconText(
                    '📍',
                    job.distanceKm != null
                        ? '${job.location.displayLocation} · ${formatDistance(job.distanceKm!)}'
                        : job.location.displayLocation,
                  ),
                  _iconText('📅', dateLabel),
                  _iconText('⏰', '${job.startTime} – ${job.endTime}'),
                ],
              ),
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    '₹${job.payment}/${job.paymentUnit}',
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primary),
                  ),
                  SizedBox(
                    // The theme's elevatedButtonTheme sets
                    // minimumSize: Size.fromHeight(56) — i.e. width = ∞ — so the
                    // button asserts ("BoxConstraints forces an infinite width")
                    // when it receives unbounded width from this Row's main axis,
                    // which blanks the entire list. Give it an explicit width.
                    width: 160,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                      ),
                      onPressed: onTap,
                      child: const Text('View & Apply', style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _iconText(String icon, String text) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(icon, style: const TextStyle(fontSize: 13)),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 13, color: AppColors.textMuted)),
      ],
    );
  }
}
