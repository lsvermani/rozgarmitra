/**
 * Admin Panel OTP: generation, hashing, issuing and verification.
 *
 * Mirrors the hardened design already proven in `services/whatsappOtpService.js`,
 * but with admin-specific policy: a single hard-coded allow-list number, a
 * short-lived code, and a strict attempt budget.
 *
 * Why this is separate from `services/otpService.js`
 * -------------------------------------------------
 * That module backs the worker / job-creator flow and stores codes in **plain
 * text** on the User document, with a demo mode that accepts a fixed code. Both
 * are fine for a demo login and unacceptable for the panel that can block users,
 * edit jobs and read the activity trail - so the admin flow gets its own store
 * instead of inheriting the weaker one.
 *
 * Security properties
 * -------------------
 * - Codes come from `crypto.randomInt` (CSPRNG). `Math.random()` is a PRNG: its
 *   output is predictable from a few observed values, and six digits drawn from
 *   it is guessable. `Math.random()` is never used here.
 * - Only an HMAC-SHA256 digest is stored. The pepper lives in the environment, so
 *   a stolen database dump cannot be attacked offline without it too.
 * - Comparison uses `crypto.timingSafeEqual` so a wrong code cannot be recovered
 *   a byte at a time from response timings.
 * - The code is returned to the caller **once**, to be sent over SMS, and is
 *   never written to a log.
 */
const crypto = require('crypto');

const AdminOtp = require('../models/AdminOtp');
const config = require('../config/adminOtp');

/**
 * Cryptographically secure numeric code.
 *
 * `randomInt` is uniform and rejection-samples, so every code is equally likely.
 * Kept as a string so a leading zero survives.
 */
function generateOtp(length = config.getConfig().otpLength) {
  const size = Math.max(4, Math.min(8, Number(length) || 6));
  const lower = 10 ** (size - 1);
  const upper = 10 ** size;
  return String(crypto.randomInt(lower, upper));
}

/** Deterministic keyed digest of a code, bound to the phone it was sent to. */
function hashOtp(otp, phone) {
  return crypto
    .createHmac('sha256', config.pepper())
    .update(`${String(phone)}:${String(otp)}`)
    .digest('hex');
}

/** Constant-time comparison of two equal-length hex digests. */
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

/** Only the allow-listed administrator number may start a login. */
function isAuthorised(phone) {
  const cfg = config.getConfig();
  const national = config.toNational(phone);
  if (!cfg.adminPhone || !national) return false;
  return national === cfg.adminPhone;
}

/**
 * Replaces any outstanding code for this phone with a new one.
 *
 * A single `findOneAndUpdate` with `upsert` means there is never a window in
 * which two codes are simultaneously valid, and it is atomic against two
 * concurrent requests - the later write wins and the earlier code is dead.
 *
 * @returns {string} the plaintext code; the caller sends it and must not store it.
 */
async function issue(phone) {
  const cfg = config.getConfig();
  const national = config.toNational(phone);
  const otp = generateOtp(cfg.otpLength);
  const now = new Date();

  await AdminOtp.findOneAndUpdate(
    { phone: national },
    {
      $set: {
        otpHash: hashOtp(otp, national),
        attempts: 0,
        used: false,
        usedAt: null,
        expiresAt: new Date(now.getTime() + cfg.otpExpiryMinutes * 60 * 1000),
        lastSentAt: now,
        deliveryStatus: 'pending',
        deliveryErrorCode: '',
        deliveryMessageId: '',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return otp;
}

/** Records what the SMS gateway said, without ever storing the message body. */
async function markDelivery(phone, { ok, errorCode = '', messageId = '' }) {
  await AdminOtp.updateOne(
    { phone: config.toNational(phone) },
    {
      $set: {
        deliveryStatus: ok ? 'sent' : 'failed',
        deliveryErrorCode: String(errorCode).slice(0, 60),
        deliveryMessageId: String(messageId).slice(0, 120),
      },
    },
  );
}

/** Seconds the caller must still wait before another code can be requested. */
function resendWaitSeconds(lastSentAt) {
  const cfg = config.getConfig();
  const elapsed = Date.now() - new Date(lastSentAt || 0).getTime();
  return Math.max(0, Math.ceil((cfg.otpResendSeconds * 1000 - elapsed) / 1000));
}

/** Codes this number has requested in the last hour. Counts rows, so it survives a restart. */
async function sentInLastHour(phone) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  return AdminOtp.countDocuments({
    phone: config.toNational(phone),
    createdAt: { $gte: since },
  });
}

  /**
 * Checks a submitted code and consumes one attempt.
 *
 * Order matters: cheap, non-mutating checks first, and each failure gives the
 * user a distinct, actionable sentence.
 *
 * @returns {{ ok: true } | { ok: false, status: number, code: string, reason: string }}
 */
async function check({ phone, otp }) {
  const cfg = config.getConfig();
  const national = config.toNational(phone);

  // `otpHash` is `select: false`, so it must be asked for explicitly.
  const record = await AdminOtp.findOne({ phone: national }).select('+otpHash');

  if (!record) {
    return {
      ok: false,
      status: 400,
      code: 'no_otp',
      reason: 'No OTP was requested. Please request a new OTP.',
    };
  }

  if (record.used) {
    return {
      ok: false,
      status: 400,
      code: 'otp_used',
      reason: 'This OTP has already been used. Please request a new OTP.',
    };
  }

  if (new Date() > record.expiresAt) {
    return {
      ok: false,
      status: 400,
      code: 'otp_expired',
      reason: 'OTP has expired. Please request a new OTP.',
    };
  }

  // Checked before the digest so a spent budget cannot be probed further, and so
  // the user is told to request a new code rather than to keep guessing.
  if (record.attempts >= cfg.otpMaxAttempts) {
    return {
      ok: false,
      status: 429,
      code: 'too_many_attempts',
      reason: 'Too many attempts. Please request a new OTP.',
    };
  }

  if (verifyCode(otp, national, record.otpHash)) {
    record.used = true;
    record.usedAt = new Date();
    // Drop the digest immediately so a used code cannot be replayed from a
    // database snapshot taken between verification and expiry.
    record.otpHash = null;
    await record.save();
    return { ok: true };
  }

  record.attempts += 1;
  const remaining = cfg.otpMaxAttempts - record.attempts;
  await record.save();

  // Never echo what was submitted, and stop reporting the remaining budget once
  // it is spent - that would help someone work out how many tries are left.
  return {
    ok: false,
    status: remaining > 0 ? 400 : 429,
    code: remaining > 0 ? 'invalid_otp' : 'too_many_attempts',
    reason:
      remaining > 0
        ? 'Invalid OTP. Please try again.'
        : 'Too many attempts. Please request a new OTP.',
  };
}

/** Diagnostic view for the admin panel. Phone is masked, never raw. */
async function status(phone) {
  const national = config.toNational(phone);
  const record = await AdminOtp.findOne({ phone: national }).lean();
  const cfg = config.getConfig();

  if (!record) {
    return {
      exists: false,
      resendWaitSeconds: 0,
      sentInLastHour: await sentInLastHour(national),
    };
  }

  return {
    exists: true,
    used: record.used,
    expired: new Date() > record.expiresAt,
    attemptsRemaining: Math.max(0, cfg.otpMaxAttempts - (record.attempts || 0)),
    resendWaitSeconds: resendWaitSeconds(record.lastSentAt),
    deliveryStatus: record.deliveryStatus,
    sentInLastHour: await sentInLastHour(national),
  };
}

module.exports = {
  generateOtp,
  hashOtp,
  verifyCode,
  isAuthorised,
  issue,
  check,
  markDelivery,
  sentInLastHour,
  resendWaitSeconds,
  status,
};
