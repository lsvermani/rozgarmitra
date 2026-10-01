import 'dart:convert';

import '../security/admin_passcode.dart';
import 'secure_store.dart';
import 'server_config.dart';

/// One line in the configuration audit trail. Never contains tokens, passwords
/// or MongoDB/JWT secrets — only URLs (redacted) and outcomes.
class ConfigAuditEntry {
  ConfigAuditEntry({
    required this.at,
    required this.action,
    required this.actor,
    required this.summary,
    this.success = true,
  });

  final DateTime at;

  /// `save`, `test`, `reset`, `restore`, `unlock`, `denied`.
  final String action;

  /// `device-admin`, `admin-otp:<mobile>` or `unknown`.
  final String actor;

  /// Redacted, human-readable detail.
  final String summary;
  final bool success;

  factory ConfigAuditEntry.fromJson(Map<String, dynamic> json) => ConfigAuditEntry(
        at: DateTime.tryParse(json['at']?.toString() ?? '') ?? DateTime.now(),
        action: json['action']?.toString() ?? 'unknown',
        actor: json['actor']?.toString() ?? 'unknown',
        summary: ServerConfig.redact(json['summary']?.toString() ?? ''),
        success: json['success'] != false,
      );

  Map<String, dynamic> toJson() => {
        'at': at.toIso8601String(),
        'action': action,
        'actor': actor,
        'summary': summary,
        'success': success,
      };
}

/// Persists everything the Server / Admin Settings feature needs.
///
/// Two slots are kept:
/// * **current** — what the app is using right now.
/// * **last known good** — the previous configuration that passed a connection
///   test, so an administrator can roll back with one tap.
class ConfigStore {
  ConfigStore({KeyValueStore? storage}) : storage = storage ?? SecureKeyValueStore();

  final KeyValueStore storage;

  static const String _configKey = 'rm.server_config.v1';
  static const String _lastGoodKey = 'rm.server_config.last_good.v1';
  static const String _auditKey = 'rm.server_config.audit.v1';
  static const String _passcodeKey = 'rm.admin.passcode.v1';

  /// Maximum retained audit lines (older ones are dropped).
  static const int auditLimit = 50;

  bool get isEncrypted => storage.isEncrypted;
  String get backendLabel => storage.backendLabel;

  Future<ServerConfig?> readConfig() async {
    final raw = await storage.read(_configKey);
    final decoded = _decode(raw);
    return decoded == null ? null : ServerConfig.fromJson(decoded);
  }

  Future<void> writeConfig(ServerConfig config) =>
      storage.write(_configKey, jsonEncode(config.toJson()));

  Future<void> deleteConfig() => storage.delete(_configKey);

  Future<ServerConfig?> readLastGood() async {
    final raw = await storage.read(_lastGoodKey);
    final decoded = _decode(raw);
    return decoded == null ? null : ServerConfig.fromJson(decoded);
  }

  Future<void> writeLastGood(ServerConfig config) =>
      storage.write(_lastGoodKey, jsonEncode(config.toJson()));

  Future<List<ConfigAuditEntry>> readAudit() async {
    final raw = await storage.read(_auditKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return [];
      return decoded
          .whereType<Map<String, dynamic>>()
          .map(ConfigAuditEntry.fromJson)
          .toList(growable: false);
    } catch (_) {
      return [];
    }
  }

  Future<void> writeAudit(List<ConfigAuditEntry> entries) async {
    final capped = entries.length > auditLimit
        ? entries.sublist(entries.length - auditLimit)
        : entries;
    await storage.write(
      _auditKey,
      jsonEncode(capped.map((e) => e.toJson()).toList(growable: false)),
    );
  }

  Future<void> clearAudit() => storage.delete(_auditKey);

  // --- Device recovery passcode ---------------------------------------------

  Future<bool> hasAdminPasscode() async =>
      (await storage.read(_passcodeKey))?.isNotEmpty == true;

  Future<void> setAdminPasscode(String passcode) =>
      storage.write(_passcodeKey, AdminPasscode.hash(passcode));

  /// Verifies [passcode] against the stored hash. Returns false when no
  /// passcode has been created yet.
  Future<bool> verifyAdminPasscode(String passcode) async {
    final stored = await storage.read(_passcodeKey);
    if (stored == null || stored.isEmpty) return false;
    return AdminPasscode.verify(passcode, stored);
  }

  Map<String, dynamic>? _decode(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }
}
