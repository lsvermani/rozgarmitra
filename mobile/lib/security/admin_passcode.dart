import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';

/// Salted, iterated password hashing for the **device recovery passcode** that
/// unlocks Server / Admin Settings when the configured backend is unreachable
/// (the usual "I typed the wrong server address" recovery path).
///
/// * PBKDF2-HMAC-SHA256, per-install random salt, iteration count stored inside
///   the hash string so it can be raised later without invalidating old hashes.
/// * Only the hash is persisted, and only in encrypted storage.
/// * This passcode gates *local* configuration changes. Server-side changes are
///   additionally gated by a real backend admin login (role `admin`).
class AdminPasscode {
  /// Pure-Dart PBKDF2 is CPU bound, so the iteration count is tuned to stay
  /// under ~1 s on a low-end phone while still making offline guessing
  /// expensive. Stored per-hash, so raising it later is backwards compatible.
  static const int defaultIterations = 20000;

  /// Shortest accepted passcode length.
  static const int minLength = 6;

  /// Returns an error message, or `null` when [raw] is acceptable.
  static String? validate(String raw) {
    final value = raw.trim();
    if (value.length < minLength) {
      return 'Use at least $minLength characters.';
    }
    if (value.length > 128) return 'That passcode is too long.';
    if (RegExp(r'^(\d)\1+$').hasMatch(value)) {
      return 'Avoid a passcode made of a single repeated character.';
    }
    return null;
  }

  /// Produces `pbkdf2<iterations>$<saltB64>$<hashB64>`.
  static String hash(String passcode, {int iterations = defaultIterations, Random? random}) {
    final rng = random ?? Random.secure();
    final salt = List<int>.generate(16, (_) => rng.nextInt(256));
    final derived = pbkdf2Sha256(
      utf8.encode(passcode.trim()),
      salt,
      iterations: iterations,
      keyLength: 32,
    );
    return 'pbkdf2$iterations\$${base64.encode(salt)}\$${base64.encode(derived)}';
  }

  /// Constant-time verification of [passcode] against a stored [hash].
  static bool verify(String passcode, String hash) {
    final parts = hash.split(r'$');
    if (parts.length != 3 || !parts[0].startsWith('pbkdf2')) return false;
    final iterations = int.tryParse(parts[0].substring('pbkdf2'.length));
    if (iterations == null || iterations <= 0) return false;

    late final List<int> salt;
    late final List<int> expected;
    try {
      salt = base64.decode(parts[1]);
      expected = base64.decode(parts[2]);
    } catch (_) {
      return false;
    }

    final actual = pbkdf2Sha256(
      utf8.encode(passcode.trim()),
      salt,
      iterations: iterations,
      keyLength: expected.length,
    );
    return _constantTimeEquals(actual, expected);
  }

  /// PBKDF2 (RFC 2898) with HMAC-SHA256 as the pseudo random function.
  static List<int> pbkdf2Sha256(
    List<int> password,
    List<int> salt, {
    required int iterations,
    int keyLength = 32,
  }) {
    final hmac = Hmac(sha256, password);
    const hashLength = 32;
    final blockCount = (keyLength / hashLength).ceil();
    final output = <int>[];

    for (var block = 1; block <= blockCount; block++) {
      final blockIndex = [
        (block >> 24) & 0xff,
        (block >> 16) & 0xff,
        (block >> 8) & 0xff,
        block & 0xff,
      ];
      var u = hmac.convert([...salt, ...blockIndex]).bytes;
      final accumulator = List<int>.from(u);
      for (var i = 1; i < iterations; i++) {
        u = hmac.convert(u).bytes;
        for (var j = 0; j < accumulator.length; j++) {
          accumulator[j] ^= u[j];
        }
      }
      output.addAll(accumulator);
    }
    return output.sublist(0, keyLength);
  }

  /// Compares two byte lists without leaking the position of the mismatch.
  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }
}
