/**
 * Phone-number normalisation.
 *
 * The whole codebase stores mobiles as a bare 10-digit Indian string
 * (`User.mobile`, matched by `/^[6-9]\d{9}$/`). Those are the values the WhatsApp
 * Cloud API *cannot* use - it requires E.164, e.g. `+918699142699`.
 *
 * So: normalise to E.164 for talking to WhatsApp, and strip back to the stored
 * 10-digit form for looking a user up. Keeping the canonical form in one place
 * means a number that reaches WhatsApp is always the same number the account is
 * registered against.
 *
 * Indian numbers are validated the same way the rest of the app already does
 * (10 digits starting 6-9), so this module adds no new rule that could reject a
 * number the existing sign-up flow would have accepted.
 */

/** Country used when the caller supplies a bare local number. */
const DEFAULT_COUNTRY_CODE = '91';

/** E.164 allows at most 15 digits including the country code. */
const MAX_E164_DIGITS = 15;

/** Shortest plausible E.164 value (country code + subscriber number). */
const MIN_E164_DIGITS = 8;

/**
 * Normalises user input into E.164.
 *
 * Accepts the shapes a real user types: `8699142699`, `+91 86991 42699`,
 * `0918699142699`, `91-8699-142-699`.
 *
 * @returns {{ ok: true, e164: string, national: string } | { ok: false, reason: string }}
 */
function normalisePhone(input) {
  if (input === undefined || input === null) {
    return { ok: false, reason: 'Phone number is required.' };
  }

  // Keep digits and a leading +; everything else (spaces, dashes, brackets) is
  // presentation and is discarded.
  const raw = String(input).trim();
  if (!raw) return { ok: false, reason: 'Phone number is required.' };

  const hasPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (!digits) return { ok: false, reason: 'Invalid phone number.' };

  // A leading 0 is a trunk prefix in India, never part of the subscriber number.
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);

  // Without a leading '+' we cannot infer a country code, so the only shapes that
  // are safe to accept are the ones this app already understands: a bare Indian
  // 10-digit number, or that number already carrying the `91` country code
  // (`918699142699` - two code digits plus ten subscriber digits = 12).
  // Anything else (a 9-digit fragment, say) is rejected rather than being turned
  // into a number with a guessed country code - `+869914269` is not a real
  // destination, and silently messaging it would be worse than an error.
  if (!hasPlus) {
    const isBareIndian = digits.length === 10;
    const isIndianWithCode =
      digits.length === 2 + 10 && digits.startsWith(DEFAULT_COUNTRY_CODE);

    if (!isBareIndian && !isIndianWithCode) {
      return { ok: false, reason: 'Enter a valid 10-digit Indian mobile number, or use the +<country><number> format.' };
    }

    digits = isBareIndian ? DEFAULT_COUNTRY_CODE + digits : digits;
  }

  if (digits.length < MIN_E164_DIGITS || digits.length > MAX_E164_DIGITS) {
    return { ok: false, reason: 'Invalid phone number.' };
  }

  const e164 = `+${digits}`;

  // When the number is Indian, hold it to the exact rule the rest of the app
  // uses so a WhatsApp-verified number is always a usable account number.
  if (e164.startsWith(`+${DEFAULT_COUNTRY_CODE}`) && digits.length === 12) {
    const national = digits.slice(2);
    if (!/^[6-9]\d{9}$/.test(national)) {
      return { ok: false, reason: 'Enter a valid 10-digit Indian mobile number.' };
    }
    return { ok: true, e164, national };
  }

  return { ok: true, e164, national: digits };
}

/**
 * E.164 -> the bare 10-digit form stored on `User.mobile`.
 * Returns null when the number is not Indian, because there is no `User.mobile`
 * value that could match it.
 */
function toNationalNumber(e164) {
  const match = /^\+91([6-9]\d{9})$/.exec(String(e164 || '').trim());
  return match ? match[1] : null;
}

/** Masks a number for logs: `+918699142699` -> `+91869****2699`. */
function maskPhone(e164) {
  const value = String(e164 || '');
  if (value.length <= 6) return value;
  const head = value.slice(0, value.length - 6);
  return `${head}****${value.slice(-4)}`;
}

module.exports = { normalisePhone, toNationalNumber, maskPhone, DEFAULT_COUNTRY_CODE };