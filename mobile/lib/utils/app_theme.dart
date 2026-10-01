import 'package:flutter/material.dart';

/// Central design system for Rozgarmitra.
/// Large touch targets, high-contrast text, simple iconography —
/// built for users with limited digital literacy.
class AppColors {
  static const primary = Color(0xFF0F766E); // teal - trust, work
  static const primaryDark = Color(0xFF0B544E);
  static const primaryLight = Color(0xFFCCFBF1);
  static const accent = Color(0xFFF59E0B); // amber - action/CTA
  static const background = Color(0xFFF8FAFC);
  static const surface = Colors.white;
  static const textPrimary = Color(0xFF0F172A);
  static const textMuted = Color(0xFF64748B);
  static const success = Color(0xFF16A34A);
  static const danger = Color(0xFFDC2626);
  static const border = Color(0xFFE2E8F0);
}

class AppTheme {
  static ThemeData light() {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.primary,
        primary: AppColors.primary,
        secondary: AppColors.accent,
      ),
      fontFamily: 'Roboto',
      textTheme: const TextTheme(
        headlineMedium: TextStyle(fontWeight: FontWeight.w800, fontSize: 24, color: AppColors.textPrimary),
        titleLarge: TextStyle(fontWeight: FontWeight.w700, fontSize: 18, color: AppColors.textPrimary),
        bodyLarge: TextStyle(fontSize: 16, color: AppColors.textPrimary),
        bodyMedium: TextStyle(fontSize: 14, color: AppColors.textMuted),
      ),
      // NOTE: Size.fromHeight(56) = Size(double.infinity, 56): buttons fill the
      // width of a bounded parent (Column, Expanded slot, SizedBox). Because the
      // width is ∞, an ElevatedButton placed directly in a Row (whose non-flex
      // children get unbounded main-axis width) will assert "BoxConstraints
      // forces an infinite width" — wrap such buttons in a width-bounded widget
      // (e.g. SizedBox(width: ...)) first. See job_card.dart.
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(56), // large touch target
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.border),
        ),
      ),
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        centerTitle: false,
      ),
    );
  }
}

class AppConstants {
  /// Compile-time *fallback* backend address.
  ///
  /// The app no longer depends on this value at runtime: the effective API base
  /// URL is resolved from [ConfigManager] (Server / Admin Settings) and only
  /// falls back to this constant when no administrator configuration exists yet.
  /// Keep it pointing somewhere sane (production builds should ship a real
  /// `https://` URL through `scripts/build-release.ps1`).
  static const String defaultApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5000/api',
  );

  /// Backwards-compatible alias. Prefer [defaultApiBaseUrl] or, better, the
  /// runtime value from `ConfigManager.currentApiBaseUrl`.
  static const String apiBaseUrl = defaultApiBaseUrl;

  /// Version injected at build time by `scripts/build-release.ps1`; shown on the
  /// Server / Admin Settings page so an administrator can confirm the build.
  static const String appVersion = String.fromEnvironment(
    'APP_VERSION',
    defaultValue: 'dev',
  );

  static const List<String> distanceOptions = ['2', '5', '10', '20'];
}

