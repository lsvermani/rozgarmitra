/// Deployment environment an administrator selects in the in-app
/// Server / Admin Settings page.
///
/// The environment drives security rules that cannot be relaxed from the UI:
///
/// * [production] **requires** `https://` (see `ServerConfig.validate`).
/// * [development] / [testing] also accept `http://` so a backend running on a
///   LAN address (e.g. `http://192.168.1.100:8080`) can be used while testing.
///
/// Note for release builds: Android still blocks cleartext HTTP unless the host
/// is whitelisted in
/// `android/app/src/main/res/xml/network_security_config.xml` — see
/// `docs/ADMIN_SERVER_SETTINGS.md`.
enum AppEnvironment {
  development(
    id: 'development',
    label: 'Development',
    shortLabel: 'Dev',
    description: 'Local / LAN backend. HTTP allowed.',
  ),
  testing(
    id: 'testing',
    label: 'Testing',
    shortLabel: 'Test',
    description: 'Staging or UAT backend. HTTP allowed.',
  ),
  production(
    id: 'production',
    label: 'Production',
    shortLabel: 'Prod',
    description: 'Live backend. HTTPS required.',
  );

  const AppEnvironment({
    required this.id,
    required this.label,
    required this.shortLabel,
    required this.description,
  });

  /// Stable identifier persisted to encrypted storage.
  final String id;
  final String label;
  final String shortLabel;
  final String description;

  /// Production traffic must be encrypted in transit.
  bool get requiresHttps => this == AppEnvironment.production;

  /// Scheme used when the administrator only supplies an IP address.
  String get defaultScheme => requiresHttps ? 'https' : 'http';

  static AppEnvironment fromId(String? id) {
    final needle = (id ?? '').trim().toLowerCase();
    for (final env in AppEnvironment.values) {
      if (env.id == needle) return env;
    }
    return AppEnvironment.development;
  }
}
