import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Minimal key/value contract so the configuration layer can be unit-tested
/// without a platform channel (see [InMemoryKeyValueStore]).
abstract class KeyValueStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);

  /// True when values are encrypted at rest (Android Keystore backed).
  bool get isEncrypted;

  /// Short description of the backing implementation, shown in the UI.
  String get backendLabel;
}

/// In-memory store used by widget/unit tests.
class InMemoryKeyValueStore implements KeyValueStore {
  InMemoryKeyValueStore([Map<String, String>? seed]) : _values = {...?seed};

  final Map<String, String> _values;

  @override
  bool get isEncrypted => false;

  @override
  String get backendLabel => 'in-memory (test)';

  @override
  Future<String?> read(String key) async => _values[key];

  @override
  Future<void> write(String key, String value) async => _values[key] = value;

  @override
  Future<void> delete(String key) async => _values.remove(key);
}

/// Encrypted storage: **flutter_secure_storage** (Android Keystore RSA-OAEP +
/// AES-GCM, macOS/iOS Keychain, DPAPI on Windows).
///
/// If the platform implementation is unavailable (a desktop/web runtime without
/// the plugin, or a Keystore failure on a rooted/broken device) the store
/// transparently degrades to `shared_preferences` so the app stays usable, and
/// reports [isEncrypted] == false so the Admin Settings page can warn about it.
/// Android devices ship a working Keystore, so this fallback is not expected in
/// production.
class SecureKeyValueStore implements KeyValueStore {
  SecureKeyValueStore({FlutterSecureStorage? secureStorage})
      : _secure = secureStorage ??
            const FlutterSecureStorage(
              aOptions: AndroidOptions(),
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
            );

  final FlutterSecureStorage _secure;

  /// Once the platform channel has failed we stay on the fallback for the rest
  /// of the process instead of retrying (and throwing) on every read/write.
  static bool _secureLayerHealthy = true;

  @override
  bool get isEncrypted => _secureLayerHealthy;

  @override
  String get backendLabel =>
      _secureLayerHealthy ? 'encrypted device key-value store' : 'app private storage (unencrypted fallback)';

  @override
  Future<String?> read(String key) async {
    if (_secureLayerHealthy) {
      try {
        return await _secure.read(key: key);
      } catch (error) {
        _degrade('read', error);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_fallbackKey(key));
  }

  @override
  Future<void> write(String key, String value) async {
    if (_secureLayerHealthy) {
      try {
        await _secure.write(key: key, value: value);
        return;
      } catch (error) {
        _degrade('write', error);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_fallbackKey(key), value);
  }

  @override
  Future<void> delete(String key) async {
    if (_secureLayerHealthy) {
      try {
        await _secure.delete(key: key);
      } catch (error) {
        _degrade('delete', error);
      }
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_fallbackKey(key));
  }

  static String _fallbackKey(String key) => '$key.fallback';

  void _degrade(String operation, Object error) {
    _secureLayerHealthy = false;
    debugPrint(
      'SecureKeyValueStore: encrypted storage unavailable on this platform '
      '($operation failed: $error). Falling back to app-private preferences.',
    );
  }
}
