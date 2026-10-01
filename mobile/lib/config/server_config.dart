import '../utils/app_theme.dart';
import 'app_environment.dart';

/// Immutable snapshot of the administrator-editable server configuration.
///
/// ## How the effective API URL is resolved
///
/// 1. **Forwarded address** — used only when [useForwardedUrl] is `true` *and*
///    [forwardedUrl] is not blank. This is the "reverse proxy" case
///    (`https://example.com/api`). It is deliberately opt-in: an address like
///    this is never taken from a network response, only from what the unlocked
///    administrator typed on this device.
/// 2. **[serverBaseUrl]** — e.g. `https://api.example.com`.
/// 3. **[serverIp]** (+ optional [serverPort]) — e.g. `192.168.1.100:8080`, using
///    [AppEnvironment.defaultScheme] as the scheme.
/// 4. Otherwise the compile-time fallback `AppConstants.defaultApiBaseUrl`.
///
/// After a base is chosen, the **API base path** is appended *unless the base
/// already contains a path*. So `https://api.example.com` + `/api` →
/// `https://api.example.com/api`, while `https://example.com/proxy/api` is used
/// verbatim (a forwarded address that already points at the API root).
class ServerConfig {
  /// Default API prefix of the Rozgarmitra backend (`/api/health`, `/api/jobs`).
  static const String defaultApiBasePath = '/api';

  /// [serverBaseUrl] — full origin of the backend, e.g. `https://api.example.com`.
  final String serverBaseUrl;

  /// [serverIp] — IPv4/IPv6 literal or hostname, e.g. `192.168.1.100`.
  final String serverIp;

  /// [serverPort] — optional port used together with [serverIp].
  final int? serverPort;

  /// [forwardedUrl] — reverse proxy / public address of the API.
  final String forwardedUrl;

  /// Explicit opt-in for [forwardedUrl] (never inferred from a network reply).
  final bool useForwardedUrl;

  /// [apiBasePath] — prefix appended to the origin, e.g. `/api`.
  final String apiBasePath;

  /// Selected deployment environment, e.g. [AppEnvironment.production].
  final AppEnvironment environment;

  /// Escape hatch that lets an administrator save a configuration whose
  /// connection test failed. Only honoured while the environment is
  /// [AppEnvironment.development].
  final bool allowSaveWithoutTest;

  /// ISO-8601 timestamp of the last successful save (audit trail).
  final String? updatedAt;

  /// Non-sensitive label of who made the last change (`device-admin`,
  /// `admin-otp:<mobile>`). Never contains tokens or passwords.
  final String? updatedBy;

  const ServerConfig({
    this.serverBaseUrl = '',
    this.serverIp = '',
    this.serverPort,
    this.forwardedUrl = '',
    this.useForwardedUrl = false,
    this.apiBasePath = defaultApiBasePath,
    this.environment = AppEnvironment.development,
    this.allowSaveWithoutTest = false,
    this.updatedAt,
    this.updatedBy,
  });

  /// Fresh, unconfigured instance.
  factory ServerConfig.blank() => const ServerConfig();

  factory ServerConfig.fromJson(Map<String, dynamic> json) {
    final port = json['serverPort'];
    return ServerConfig(
      serverBaseUrl: (json['serverBaseUrl'] ?? '').toString(),
      serverIp: (json['serverIp'] ?? '').toString(),
      serverPort:
          port == null ? null : (port is int ? port : int.tryParse(port.toString())),
      forwardedUrl: (json['forwardedUrl'] ?? '').toString(),
      useForwardedUrl: json['useForwardedUrl'] == true,
      apiBasePath: normalizeApiBasePath(
          (json['apiBasePath'] ?? defaultApiBasePath).toString()),
      environment: AppEnvironment.fromId(json['environment']?.toString()),
      allowSaveWithoutTest: json['allowSaveWithoutTest'] == true,
      updatedAt: json['updatedAt']?.toString(),
      updatedBy: json['updatedBy']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'serverBaseUrl': serverBaseUrl,
        'serverIp': serverIp,
        'serverPort': serverPort,
        'forwardedUrl': forwardedUrl,
        'useForwardedUrl': useForwardedUrl,
        'apiBasePath': apiBasePath,
        'environment': environment.id,
        'allowSaveWithoutTest': allowSaveWithoutTest,
        'updatedAt': updatedAt,
        'updatedBy': updatedBy,
      };

  ServerConfig copyWith({
    String? serverBaseUrl,
    String? serverIp,
    Object? serverPort = _unset,
    String? forwardedUrl,
    bool? useForwardedUrl,
    String? apiBasePath,
    AppEnvironment? environment,
    bool? allowSaveWithoutTest,
    String? updatedAt,
    String? updatedBy,
  }) {
    return ServerConfig(
      serverBaseUrl: serverBaseUrl ?? this.serverBaseUrl,
      serverIp: serverIp ?? this.serverIp,
      serverPort:
          identical(serverPort, _unset) ? this.serverPort : serverPort as int?,
      forwardedUrl: forwardedUrl ?? this.forwardedUrl,
      useForwardedUrl: useForwardedUrl ?? this.useForwardedUrl,
      apiBasePath:
          apiBasePath == null ? this.apiBasePath : normalizeApiBasePath(apiBasePath),
      environment: environment ?? this.environment,
      allowSaveWithoutTest: allowSaveWithoutTest ?? this.allowSaveWithoutTest,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }

  /// True when an administrator has saved something (used to decide whether the
  /// "configure this device" prompt is shown on the entry screen).
  bool get isConfigured =>
      serverBaseUrl.trim().isNotEmpty ||
      forwardedUrl.trim().isNotEmpty ||
      serverIp.trim().isNotEmpty;

  /// Whether [allowSaveWithoutTest] may actually be honoured.
  bool get saveWithoutTestAllowed =>
      allowSaveWithoutTest && environment == AppEnvironment.development;

  /// The origin (scheme://host[:port]) the app will talk to, or `null` when
  /// nothing is configured yet.
  String? get resolvedOrigin {
    if (useForwardedUrl && forwardedUrl.trim().isNotEmpty) {
      return _stripTrailingSlashes(forwardedUrl.trim());
    }
    if (serverBaseUrl.trim().isNotEmpty) {
      return _stripTrailingSlashes(serverBaseUrl.trim());
    }
    if (serverIp.trim().isNotEmpty) {
      final ip = serverIp.trim();
      final buffer = StringBuffer('${_effectiveScheme(ip)}://$ip');
      if (serverPort != null) buffer.write(':$serverPort');
      return buffer.toString();
    }
    return null;
  }

  /// The full API base URL every request is built from, e.g.
  /// `https://api.example.com/api`. Falls back to the compile-time default when
  /// nothing is configured, so a fresh install still works out of the box.
  String get effectiveApiBaseUrl =>
      _withApiBasePath(resolvedOrigin ?? AppConstants.defaultApiBaseUrl, apiBasePath);

  /// True when the fallback compiled address is in use (the administrator has
  /// not configured this device yet).
  bool get usingCompiledDefault => resolvedOrigin == null;

  /// Human readable summary of where requests currently go.
  String get summary => effectiveApiBaseUrl;

  // ---------------------------------------------------------------------------
  // Validation (pure logic — covered by test/server_config_test.dart)
  // ---------------------------------------------------------------------------

  /// One message per invalid field, keyed by the form field name. An empty map
  /// means the configuration is safe to test and save.
  Map<String, String> fieldErrors() {
    final errors = <String, String>{};

    final baseError =
        validateUrlField(serverBaseUrl, label: 'Server base URL', environment: environment);
    if (baseError != null) errors['serverBaseUrl'] = baseError;

    final forwardedError =
        validateUrlField(forwardedUrl, label: 'Forwarded address', environment: environment);
    if (forwardedError != null) errors['forwardedUrl'] = forwardedError;

    final ipError = validateHostField(serverIp);
    if (ipError != null) errors['serverIp'] = ipError;

    if (serverPort != null && (serverPort! < 1 || serverPort! > 65535)) {
      errors['serverPort'] = 'Port must be between 1 and 65535.';
    }

    final pathError = validateApiBasePath(apiBasePath);
    if (pathError != null) errors['apiBasePath'] = pathError;

    // A forwarded address that is switched on must be usable.
    if (useForwardedUrl && forwardedUrl.trim().isEmpty) {
      errors['forwardedUrl'] = 'Enter the forwarded address or turn the switch off.';
    }

    return errors;
  }

  /// Flat list form of [fieldErrors].
  List<String> validate() => fieldErrors().values.toList(growable: false);

  bool get isValid => fieldErrors().isEmpty;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /// Safe, human-readable text for audit logs. Credentials inside URLs are
  /// rejected by validation and additionally masked here — anywhere in the
  /// string, not just at the start.
  static String redact(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return '(empty)';
    return trimmed
        .replaceAllMapped(
          RegExp(r'([a-zA-Z][a-zA-Z0-9+.-]*://)[^/@\s]+@'),
          (m) => '${m[1]}***@',
        )
        // Belt and braces: a MongoDB connection string must never survive into a
        // log line, even if one is ever pasted into a field.
        .replaceAll(RegExp(r'mongodb(\+srv)?://\S+', caseSensitive: false), 'mongodb://***');
  }

  static String _stripTrailingSlashes(String value) => value.replaceAll(RegExp(r'/+$'), '');

  /// Ensures a leading `/` and drops any trailing `/`. Returns the default when
  /// the value is blank.
  static String normalizeApiBasePath(String raw) {
    var value = raw.trim();
    if (value.isEmpty) return defaultApiBasePath;
    if (!value.startsWith('/')) value = '/$value';
    value = value.replaceAll(RegExp(r'/+$'), '');
    return value.isEmpty ? defaultApiBasePath : value;
  }

  /// Appends the API base path only when the origin has no path of its own.
  static String _withApiBasePath(String origin, String apiBasePath) {
    final cleaned = _stripTrailingSlashes(origin);
    final uri = Uri.tryParse(cleaned);
    if (uri == null) return cleaned;
    if (uri.path.isNotEmpty && uri.path != '/') return cleaned;
    return '$cleaned${normalizeApiBasePath(apiBasePath)}';
  }

  /// Scheme for an IP-based address: whatever the administrator typed, otherwise
  /// the environment default (https in production).
  String _effectiveScheme(String ip) {
    final lower = ip.toLowerCase();
    if (lower.startsWith('https://')) return 'https';
    if (lower.startsWith('http://')) return 'http';
    return environment.defaultScheme;
  }

  /// Validates a URL field. Returns an error message, or `null` when acceptable.
  /// Public so the settings form can validate a single field while typing.
  static String? validateUrlField(
    String raw, {
    required String label,
    required AppEnvironment environment,
  }) {
    final value = raw.trim();
    if (value.isEmpty) return null; // the field is optional

    if (!RegExp(r'^[a-zA-Z][a-zA-Z0-9+.-]*://').hasMatch(value)) {
      return '$label must start with http:// or https://.';
    }

    final uri = Uri.tryParse(value);
    if (uri == null) return '$label is not a valid URL.';

    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'http' && scheme != 'https') {
      return 'Unsupported scheme "$scheme://". Only http:// and https:// are allowed.';
    }
    if (uri.host.isEmpty) return '$label is missing a host name or IP address.';
    if (uri.userInfo.isNotEmpty) {
      return 'Remove the user name/password from the URL — credentials must never be stored in the app.';
    }
    if (uri.hasQuery || uri.hasFragment) {
      return '$label must not contain "?" or "#". Use "API base path" for a path prefix.';
    }
    if (!_isValidHost(uri.host)) return '$label contains an invalid host name.';
    if (environment.requiresHttps && scheme != 'https') {
      return 'Production requires https://. Use an encrypted address or another environment.';
    }
    return null;
  }

  /// Validates the "Server IP address" field: an IP literal *or* hostname, with
  /// no scheme and no path.
  static String? validateHostField(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return null;

    if (value.contains('://')) {
      return 'Enter just the address here (e.g. 192.168.1.100); use "Server base URL" for a full URL.';
    }
    if (value.contains('/') || value.contains(' ') || value.contains('@')) {
      return 'The address must not contain "/", spaces or "@".';
    }
    // An unbracketed IPv6 literal cannot be combined with a port unambiguously.
    if (value.contains(':') && !value.startsWith('[')) {
      return 'Wrap an IPv6 address in square brackets, e.g. [2001:db8::1].';
    }
    if (!_isValidHost(value)) return 'Enter a valid IPv4/IPv6 address or host name.';
    return null;
  }

  /// Validates the API base path, e.g. `/api` or `/api/v1`.
  static String? validateApiBasePath(String raw) {
    final value = raw.trim();
    if (value.isEmpty) return null; // blank means "origin only"
    if (value.contains('?') || value.contains('#')) {
      return 'The API base path must not contain "?" or "#".';
    }
    if (value.contains(' ')) return 'The API base path must not contain spaces.';
    if (!RegExp(r'^/?[A-Za-z0-9._~%\-/]*$').hasMatch(value)) {
      return 'Only letters, digits, "/", "-", "_", "." and "~" are allowed.';
    }
    return null;
  }

  /// Accepts IPv4 literals, bracketed IPv6 literals and DNS host names.
  static bool _isValidHost(String host) {
    if (host.isEmpty || host.length > 253) return false;
    if (RegExp(r'^\[[0-9A-Fa-f:.]+\]$').hasMatch(host)) return true; // IPv6 literal
    if (RegExp(r'^(\d{1,3}\.){3}\d{1,3}$').hasMatch(host)) {
      return host.split('.').every((part) => (int.tryParse(part) ?? 256) <= 255);
    }
    return RegExp(r'^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$').hasMatch(host);
  }
}

/// Sentinel used by [ServerConfig.copyWith] so that `serverPort: null` can clear
/// the port while an omitted argument keeps the current value.
const Object _unset = Object();
