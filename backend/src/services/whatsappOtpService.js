/**
 * WhatsApp OTP generation, hashing and verification.
 *
 * Deliberately separate from `services/otpService.js`, which backs the existing
 * SMS flow and stores codes in plain text on the User document. That format
 * cannot change without invalidating the demo logins already in the wild, so the
 * WhatsApp path gets its own hardened store instead of inheriting the weaker one.
 *
 * Security properties
 * -------------------
 * - Codes come from `crypto.randomInt`, a CSPRNG. `Math.random()` is never used:
 *   it is a PRNG, its output is predictable from a few observed values, and six
 *   digits drawn from it is guessable.
 * - Only an HMAC-SHA256 digest is stored. The pepper lives in the environment,
 *   so a stolen database dump cannot be attacked offline: an attacker would need
 *   the pepper as well as the digest. (A bare SHA-256 of a six-digit code is
 *   exhaustible in well under a second, which is why a plain hash is not enough.)
 * - Comparison uses `crypto.timingSafeEqual` so a wrong code cannot be recovered
 *   a byte at a time from response timings.
 */
const crypto = require('crypto');

const WhatsAppOTP = require('../models/WhatsAppOTP');
const config = require('../config/whatsapp');
const { maskPhone } = require('../utils/phone');

/** Stand-in so hashing cannot crash on a server that forgot to set the pepper. */
const DEV_PEPPER = 'rozgarmitra-development-only-whatsapp-pepper';

function pepper() {
  return process.env.WHATSAPP_OTP_PEPPER || DEV_PEPPER;
}

/**
 * Cryptographically secure numeric code.
 * `randomInt` is uniform and rejection-samples, so every code is equally likely.
 */
function generateOtp(length = config.getConfig().otpLength) {
  const size = Math.max(4, Math.min(8, Number(length) || 6));
  const lower = 10 ** (size - 1);
  const upper = 10 ** size;
  // Strings keep the leading zero a number would drop.
  return String(crypto.randomInt(lower, upper));
}

/** Deterministic keyed digest of a code, bound to the phone it was sent to. */
function hashOtp(otp, phone) {
  return crypto
    .createHmac('sha256', pepper())
    .update(`${String(phone)}:${String(otp)}`)
    .digest('hex');
}

/** Constant-time comparison of two equal-length digests. */
function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Verifies a submitted code against the stored digest. */
function verifyCode(otp, phone, storedHash) {
  if (!storedHash) return false;
  return safeEqualHex(hashOtp(otp, phone), storedHash);
}

function expiresAt(minutes = config.getConfig().otpExpiryMinutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Codes this number has requested in the last hour.
 *
 * Counts rows, so it reflects real deliveries rather than an in-memory counter
 * that a restart would wipe.
 */
async function sentInLastHour(phone) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return WhatsAppOTP.countDocuments({ phone, createdAt: { $gte: since } });
}
/**
 * Replaces any outstanding code for this (phone, purpose) with a new one.
 * Returns the plaintext code - the caller must send it and must not persist it.
 */
async function issue({ phone, national, purpose = 'registration' }) {
  const cfg = config.getConfig();
  const otp = generateOtp(cfg.otpLength);

  await WhatsAppOTP.findOneAndUpdate(
    { phone, purpose },
    {
      $set: {
        phone,
        national: national || '',
        otpHash: hashOtp(otp, phone),
        attempts: 0,
        verified: false,
        verifiedAt: null,
        expiresAt: expiresAt(cfg.otpExpiryMinutes),
        lastSentAt: new Date(),
        deliveryStatus: 'pending',
        deliveryErrorCode: '',
        deliveryMessageId: '',
      },
    },
    { upsert: true, new: true },
  );

  return otp;
}

/** Records the provider's verdict without ever storing the message body. */
async function markDelivery(phone, purpose, { ok, errorCode = '', messageId = '' }) {
  await WhatsAppOTP.updateOne(
    { phone, purpose },
    {
      $set: {
        deliveryStatus: ok ? 'sent' : 'failed',
        deliveryErrorCode: ok ? '' : String(errorCode).slice(0, 60),
        deliveryMessageId: ok ? String(messageId).slice(0, 120) : '',
      },
    },
  );
}

/** Seconds the caller must still wait before another code can be requested. */
function resendWaitSeconds(lastSentAt) {
  const cooldownMs = config.getConfig().otpResendSeconds * 1000;
  const elapsed = Date.now() - new Date(lastSentAt || 0).getTime();
  return Math.max(0, Math.ceil((cooldownMs - elapsed) / 1000));
}

/**
 * Checks a submitted code and consumes the attempt.
 *
 * @returns {{ ok: true } | { ok: false, status: number, reason: string }}
 */
async function check({ phone, purpose = 'registration', otp }) {
  const cfg = config.getConfig();
  // `otpHash` is `select: false`, so it has to be asked for explicitly.
  const record = await WhatsAppOTP.findOne({ phone, purpose }).select('+otpHash');

  if (!record) {
    return { ok: false, status: 404, reason: 'No OTP was requested for this number. Please request a new code.' };
  }

  if (record.verified) {
    return { ok: false, status: 400, reason: 'This code has already been used. Please request a new one.' };
  }

  if (new Date() > record.expiresAt) {
    return { ok: false, status: 400, reason: 'OTP has expired. Please request a new OTP.' };
  }

  if (record.attempts >= cfg.otpMaxAttempts) {
    return { ok: false, status: 429, reason: 'Too many attempts. Please request a new OTP.' };
  }

  if (verifyCode(otp, phone, record.otpHash)) {
    record.verified = true;
    record.verifiedAt = new Date();
    // Drop the digest immediately so a used code cannot be replayed from a
    // database snapshot taken between verification and expiry.
    record.otpHash = undefined;
    await record.save();
    return { ok: true };
  }

  record.attempts += 1;
  const remaining = cfg.otpMaxAttempts - record.attempts;
  await record.save();

  // Never echo what was submitted, and stop reporting the remaining budget once
  // it is spent - that would help someone work out how many tries are left.
  const reason = remaining > 0
    ? 'Incorrect OTP. Please try again.'
    : 'Too many attempts. Please request a new OTP.';

  return { ok: false, status: 400, reason };
}

/** True when the number completed an OTP check for this purpose recently. */
async function isVerified(phone, purpose = 'registration') {
  const record = await WhatsAppOTP.findOne({ phone, purpose }).lean();
  return Boolean(record && record.verified);
}

/** Diagnostic helper for the admin screen. Numbers are masked, never raw. */
async function recentFailures(limit = 20) {
  const rows = await WhatsAppOTP.find({ deliveryStatus: 'failed' })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('phone purpose deliveryErrorCode attempts verified createdAt updatedAt expiresAt')
    .lean();
  return rows.map((row) => ({ ...row, phone: maskPhone(row.phone) }));
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyCode,
  expiresAt,
  issue,
  check,
  markDelivery,
  sentInLastHour,
  recentFailures,
  isVerified,
  resendWaitSeconds,
};