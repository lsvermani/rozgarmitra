import 'package:flutter/material.dart';
import '../services/location_service.dart';
import '../utils/app_theme.dart';

/// Shared "current GPS location" bar, pinned to the **top-left** of a screen
/// (directly under the AppBar / tab bar).
///
/// Shows `locality, city` from the live GPS fix, a GPS badge, a refresh
/// button, and any GPS error — so every screen displays location in the same
/// place instead of mid-screen pills.
class CurrentLocationBar extends StatelessWidget {
  final LocationData? location;
  final bool fetching;
  final String? error;
  final VoidCallback? onRefresh;

  const CurrentLocationBar({
    super.key,
    this.location,
    this.fetching = false,
    this.error,
    this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    final text = fetching
        ? 'Fetching GPS location...'
        : (error != null
            ? error!
            : (location != null
                ? '${location!.displayLocation} · GPS'
                : 'Tap to fetch GPS location'));

    return Align(
      alignment: Alignment.centerLeft,
      child: InkWell(
        onTap: fetching ? null : onRefresh,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.primaryLight.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.location_on, size: 18, color: AppColors.primary),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  text,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: AppColors.primaryDark,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),
              if (fetching)
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
                )
              else
                const Icon(Icons.refresh, size: 16, color: AppColors.primaryDark),
            ],
          ),
        ),
      ),
    );
  }
}
