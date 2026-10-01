import 'package:flutter/foundation.dart';

import '../services/connection_tester.dart';
import '../utils/app_theme.dart';
import 'config_store.dart';
import 'server_config.dart';

/// Live connection state shown on the Server / Admin Settings page.
enum ConnectionStatus { unknown, testing, connected, failed }

/// Single source of truth for **where the backend is**.
///
/// Every request in the app is built from [apiBaseUrl], so changing the server
/// address from the Admin Settings page takes effect immediately, for every
/// screen, without rebuilding or reinstalling the APK.
///
/// The manager is created once in `main()`; static code with no `BuildContext`
/// (e.g. the geolocation helper) can read [ConfigManager.currentApiBaseUrl].
class ConfigManager extends ChangeNotifier {
  ConfigManager({ConfigStore? store, ConnectionTester? tester})
      : store = store ?? ConfigStore(),
        tester = tester ?? ConnectionTester();

  static ConfigManager? _current;

  /// Installed by `main()`.
  static ConfigManager get current => _current ??= ConfigManager();

  static void install(ConfigManager manager) => _current = manager;

  /// Effective API base URL for code that runs outside the widget tree (falls
  /// back to the compile-time default before [load] completes).
  static String get currentApiBaseUrl =>
      _current?.apiBaseUrl ?? AppConstants.defaultApiBaseUrl;

  final ConfigStore store;
  final ConnectionTester tester;

  ServerConfig config = ServerConfig.blank();

  /// Previous configuration that was saved through a successful connection
  /// test — used by "Restore previous working configuration".
  ServerConfig? lastKnownGood;

  List<ConfigAuditEntry> audit = const [];

  bool loaded = false;
  ConnectionStatus status = ConnectionStatus.unknown;
  ProbeResult? lastProbe;
  DateTime? lastSuccessfulConnection;
  String? lastSuccessfulUrl;

  /// Actor label written to the audit trail for the current settings session.
  String auditActor = 'device-admin';

  /// The API base URL every request is built from right now.
  String get apiBaseUrl => config.effectiveApiBaseUrl;

  bool get isConfigured => config.isConfigured;
  bool get storageEncrypted => store.isEncrypted;
  String get storageLabel => store.backendLabel;

  /// True when the app is still using the address compiled into the APK.
  bool get usingCompiledDefault => config.usingCompiledDefault;

  /// True when "Restore previous working configuration" can do something.
  bool get canRestoreLastWorking =>
      lastKnownGood != null && lastKnownGood!.effectiveApiBaseUrl != apiBaseUrl;

  /// Reads persisted state. Safe to call before `runApp`: any storage failure
  /// degrades to the compile-time default instead of blocking start-up.
  Future<void> load() async {
    try {
      config = await store.readConfig() ?? ServerConfig.blank();
      lastKnownGood = await store.readLastGood();
      audit = await store.readAudit();
      final savedAt = config.updatedAt;
      if (savedAt != null) {
        lastSuccessfulConnection = DateTime.tryParse(savedAt);
        lastSuccessfulUrl = config.effectiveApiBaseUrl;
      }
    } catch (error) {
      debugPrint('ConfigManager.load() failed, using compiled defaults: $error');
      config = ServerConfig.blank();
    } finally {
      loaded = true;
      notifyListeners();
    }
  }

  /// Probes [candidate] against `GET <candidate>/health`.
  ///
  /// The local URL rules are evaluated first so an obviously invalid address
  /// never causes a network call.
  Future<ProbeResult> test(ServerConfig candidate, {Duration? timeout}) async {
    final errors = candidate.fieldErrors();
    if (errors.isNotEmpty) {
      final result = ProbeResult(
        outcome: ConnectionOutcome.invalidUrl,
        message: errors.values.first,
        checkedUrl: candidate.effectiveApiBaseUrl,
      );
      status = ConnectionStatus.failed;
      lastProbe = result;
      notifyListeners();
      return result;
    }

    status = ConnectionStatus.testing;
    lastProbe = null;
    notifyListeners();

    final result = await tester.probe(
      candidate.effectiveApiBaseUrl,
      timeout: timeout ?? const Duration(seconds: 10),
    );

    status = result.ok ? ConnectionStatus.connected : ConnectionStatus.failed;
    lastProbe = result;
    if (result.ok) {
      lastSuccessfulConnection = DateTime.now();
      lastSuccessfulUrl = candidate.effectiveApiBaseUrl;
    }

    await logEvent(
      action: 'test',
      actor: auditActor,
      summary: 'Test ${result.ok ? 'succeeded' : 'failed'} for '
          '${candidate.effectiveApiBaseUrl} — ${result.auditSummary}',
      success: result.ok,
    );
    notifyListeners();
    return result;
  }

  /// Persists [candidate] and makes it the live configuration.
  ///
  /// Returns `false` (and writes a `denied` audit line) when the configuration
  /// is invalid, or when it has not passed a connection test. The only
  /// exception is [ServerConfig.allowSaveWithoutTest], honoured strictly in the
  /// Development environment.
  Future<bool> save(
    ServerConfig candidate, {
    required String actor,
    ProbeResult? verifiedBy,
    bool requireSuccessfulTest = true,
  }) async {
    final errors = candidate.fieldErrors();
    if (errors.isNotEmpty) {
      await logEvent(
        action: 'denied',
        actor: actor,
        summary: 'Rejected invalid configuration: ${errors.values.first}',
        success: false,
      );
      notifyListeners();
      return false;
    }

    final tested = verifiedBy?.verifiesApiBase(candidate.effectiveApiBaseUrl) == true
        ? verifiedBy
        : (lastProbe?.verifiesApiBase(candidate.effectiveApiBaseUrl) == true
            ? lastProbe
            : null);
    final testOk = tested?.ok == true;
    if (requireSuccessfulTest && !testOk && !candidate.saveWithoutTestAllowed) {
      await logEvent(
        action: 'denied',
        actor: actor,
        summary: 'Rejected save of ${candidate.effectiveApiBaseUrl}: '
            'connection test has not succeeded.',
        success: false,
      );
      notifyListeners();
      return false;
    }

    final previous = config;
    // Roll-back target: the previously saved (and therefore verified) address.
    if (previous.isConfigured &&
        previous.updatedBy != null &&
        previous.effectiveApiBaseUrl != candidate.effectiveApiBaseUrl) {
      lastKnownGood = previous;
      await store.writeLastGood(previous);
    }

    final stamped = candidate.copyWith(
      updatedAt: DateTime.now().toIso8601String(),
      updatedBy: actor,
    );
    await store.writeConfig(stamped);
    config = stamped;

    if (testOk) {
      lastSuccessfulConnection = DateTime.now();
      lastSuccessfulUrl = stamped.effectiveApiBaseUrl;
      status = ConnectionStatus.connected;
    }

    await logEvent(
      action: 'save',
      actor: actor,
      summary: 'Server changed from ${previous.effectiveApiBaseUrl} to '
          '${stamped.effectiveApiBaseUrl} (environment=${stamped.environment.id}'
          '${testOk ? ', verified' : ', unverified'})',
      success: true,
    );
    notifyListeners();
    return true;
  }

  /// Drops the stored configuration so the app returns to the address compiled
  /// into the APK.
  Future<void> resetToDefault({required String actor}) async {
    final previous = config;
    if (previous.isConfigured && previous.updatedBy != null) {
      lastKnownGood = previous;
      await store.writeLastGood(previous);
    }
    await store.deleteConfig();
    config = ServerConfig.blank();
    status = ConnectionStatus.unknown;
    lastProbe = null;
    await logEvent(
      action: 'reset',
      actor: actor,
      summary: 'Reset to the built-in default (${config.effectiveApiBaseUrl})',
      success: true,
    );
    notifyListeners();
  }

  /// Re-applies [lastKnownGood]. Returns `false` when there is nothing to
  /// restore.
  Future<bool> restoreLastWorking({required String actor}) async {
    final target = lastKnownGood;
    if (target == null) return false;

    final stamped = target.copyWith(
      updatedAt: DateTime.now().toIso8601String(),
      updatedBy: actor,
    );
    await store.writeConfig(stamped);
    config = stamped;
    lastKnownGood = null;
    await store.writeLastGood(ServerConfig.blank());
    await logEvent(
      action: 'restore',
      actor: actor,
      summary: 'Restored previous working address ${stamped.effectiveApiBaseUrl}',
      success: true,
    );
    notifyListeners();
    return true;
  }

  /// Appends a redacted line to the local audit trail. Never logs tokens,
  /// passwords or MongoDB connection strings.
  Future<void> logEvent({
    required String action,
    required String actor,
    required String summary,
    bool success = true,
  }) async {
    final entry = ConfigAuditEntry(
      at: DateTime.now(),
      action: action,
      actor: actor,
      summary: ServerConfig.redact(summary),
      success: success,
    );
    final updated = [...audit, entry];
    audit = updated.length > ConfigStore.auditLimit
        ? updated.sublist(updated.length - ConfigStore.auditLimit)
        : updated;
    try {
      await store.writeAudit(audit);
    } catch (error) {
      debugPrint('ConfigManager: could not persist audit entry: $error');
    }
  }

  @override
  void dispose() {
    tester.dispose();
    super.dispose();
  }
}

