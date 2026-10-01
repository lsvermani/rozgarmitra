import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:rozgarmitra/security/admin_passcode.dart';

/// The device recovery passcode is what unlocks Server / Admin Settings when the
/// backend is unreachable, so its hashing must be sound.
void main() {
  // A low iteration count keeps the suite fast; the format is identical to the
  // production count, which is what the round-trip proves.
  const fast = 200;

  test('rejects weak passcodes', () {
    expect(AdminPasscode.validate('12345'), isNotNull);
    expect(AdminPasscode.validate('111111'), isNotNull);
    expect(AdminPasscode.validate('  abc  '), isNotNull);
    expect(AdminPasscode.validate('rozgar123'), isNull);
  });

  test('a hash verifies with the right passcode and fails otherwise', () {
    final hash = AdminPasscode.hash('rozgar123', iterations: fast, random: Random(42));
    expect(hash.startsWith('pbkdf2'), isTrue);
    expect(AdminPasscode.verify('rozgar123', hash), isTrue);
    expect(AdminPasscode.verify('rozgar124', hash), isFalse);
    expect(AdminPasscode.verify('', hash), isFalse);
  });

  test('the same passcode produces different hashes (random salt)', () {
    final a = AdminPasscode.hash('rozgar123', iterations: fast, random: Random(1));
    final b = AdminPasscode.hash('rozgar123', iterations: fast, random: Random(2));
    expect(a, isNot(equals(b)));
    expect(AdminPasscode.verify('rozgar123', a), isTrue);
    expect(AdminPasscode.verify('rozgar123', b), isTrue);
  });

  test('the passcode is never stored in clear text', () {
    final hash = AdminPasscode.hash('rozgar123', iterations: fast, random: Random(7));
    expect(hash.contains('rozgar123'), isFalse);
  });

  test('tampered or malformed hashes are rejected', () {
    final hash = AdminPasscode.hash('rozgar123', iterations: fast, random: Random(3));
    final parts = hash.split(r'$');
    expect(AdminPasscode.verify('rozgar123', 'garbage'), isFalse);
    expect(AdminPasscode.verify('rozgar123', 'pbkdf2\$abc\$def'), isFalse);
    // Flip the stored digest.
    final tampered = '${parts[0]}\$${parts[1]}\$AAAA';
    expect(AdminPasscode.verify('rozgar123', tampered), isFalse);
  });

  test('PBKDF2-HMAC-SHA256 matches RFC 6070-style vector', () {
    // Classic vector: P="password", S="salt", c=1, dkLen=32.
    final derived = AdminPasscode.pbkdf2Sha256(
      'password'.codeUnits,
      'salt'.codeUnits,
      iterations: 1,
      keyLength: 32,
    );
    final hex = derived.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
    expect(hex, '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
  });
}
