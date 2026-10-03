/**
 * OTP Service
 * ------------
 * Demo mode (APP_MODE=demo): generates/accepts a fixed DEMO_OTP so the app can
 * be shown without any paid SMS provider. The OTP is also logged to the server
 * console so testers can see it.
 *
 * Production: swap `sendSms` for a real provider (MSG91 / Twilio / Firebase).
 * The rest of the auth flow (generate -> store hashed/plain OTP + expiry ->
 * verify -> issue JWT) stays identical, so switching providers later is a
 * one-file change.
 */

const crypto = require('crypto');

const isDemoMode = () => (process.env.APP_MODE || 'demo') === 'demo';

const delivery = require('../config/otpDelivery');
const deliveryService = require('./otpDeliveryService');

/**
 * HMAC pepper for worker / job-creator codes.
 *
 * Separate from `ADMIN_OTP_PEPPER` on purpose: two flows, two independent
 * secrets, so leaking one does not weaken the other. The development fallback
 * mirrors the admin module's - a fixed default is only ever safe because
 * production is expected to set the variable.
 */
function pepper() {
  return process.env.OTP_PEPPER || 'rozgarmitra-development-only-user-otp-pepper';
}

/**
 * Cryptographically secure numeric code.
 *
 * `randomInt` is uniform and rejection-samples, so every code is equally
 * likely. Returned as a string so a leading zero survives.
 *
 * This used to be `Math.floor(100000 + Math.random() * 900000)`. `Math.random()`
 * is a PRNG: predictable from a handful of observed outputs, so a six-digit code
 * drawn from it is guessable. It is no longer used here.
 */
function generateOtp(length = 6) {
  if (isDemoMode()) {
    return process.env.DEMO_OTP || '123456';
  }
  const size = Math.max(4, Math.min(8, Number(length) || 6));
  const lower = 10 ** (size - 1);
  const upper = 10 ** size;
  return String(crypto.randomInt(lower, upper));
}

/** Keyed digest of a code, bound to the number it was sent to. */
function hashOtp(otp, mobile) {
  return crypto
    .createHmac('sha256', pepper())
    .update(`${String(mobile)}:${String(otp)}`)
    .digest('hex');
}

/** Constant-time comparison of two equal-length hex digests. */
function safeEqualHex(a, b) {
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/** Verifies a submitted code against a stored digest. */
function verifyHash(otp, mobile, storedHash) {
  if (!storedHash) return false;
  return safeEqualHex(hashOtp(otp, mobile), storedHash);
}

/**
 * Sends the OTP through whichever provider `OTP_PROVIDER` selects.
 *
 * Delegates to `otpDeliveryService` rather than keeping its own switch, so the
 * original `/api/auth/send-otp` and the newer `/api/auth/whatsapp/send-otp` share
 * one code path. Before this, the legacy `SMS_PROVIDER` switch here meant the
 * canonical endpoint silently ignored the Android-SIM gateway - the single most
 * likely way for this feature to look broken when it was working fine.
 *
 * Demo mode is still honoured first: it is what makes the existing test suites
 * and the seeded demo logins work with no provider configured at all.
 */
async function sendSms(mobile, otp) {
  if (isDemoMode()) {
    console.log(`[DEMO OTP] Mobile: ${mobile} | OTP: ${otp} (auto-accepted in demo mode)`);
    return { success: true, provider: 'demo' };
  }

  const { normalisePhone } = require('../utils/phone');
  const phone = normalisePhone(mobile);

  if (!phone.ok) {
    return { success: false, errorCode: 'invalid_number' };
  }

  const result = await deliveryService.send(phone.e164, otp);
  return { success: Boolean(result.ok), provider: delivery.getProviderConfig().provider, ...result };
}

function getOtpExpiry() {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
  return new Date(Date.now() + minutes * 60 * 1000);
}

/** Wrong guesses a single code may absorb before it is destroyed. */
function getMaxAttempts() {
  const n = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/** Seconds a number must wait between requests. */
function getResendSeconds() {
  const n = parseInt(process.env.OTP_RESEND_SECONDS || '60', 10);
  return Number.isFinite(n) && n > 0 ? n : 60;
}

/**
 * Verifies a submitted code.
 *
 * Prefers the stored HMAC. The plaintext fallback exists only so a code issued by
 * the *previous* version of this service, moments before a deploy, can still be
 * redeemed - otherwise upgrading would strand whoever was mid-login. Any newly
 * issued code writes `otpHash` and clears `otpCode`.
 *
 * @returns {{ ok: boolean, code: string }}
 *   `code` is a machine reason, so the caller can map it to a sentence and to the
 *   audit trail without this module knowing anything about HTTP.
 */
function verifyOtp(user, submittedOtp) {
  const submitted = String(submittedOtp || '').trim();

  if (!user || !user.otpExpiresAt) return { ok: false, code: 'no_otp' };

  const maxAttempts = getMaxAttempts();
  if (Number(user.otpAttempts || 0) >= maxAttempts) {
    return { ok: false, code: 'too_many_attempts' };
  }
  if (new Date() > user.otpExpiresAt) return { ok: false, code: 'otp_expired' };

  if (user.otpHash) {
    const ok = verifyHash(submitted, user.mobile, user.otpHash);
    return { ok, code: ok ? 'ok' : 'invalid_otp' };
  }

  // Legacy plaintext code, still inside its window.
  if (user.otpCode && user.otpCode === submitted) return { ok: true, code: 'ok' };

  return { ok: false, code: 'invalid_otp' };
}

module.exports = {
  isDemoMode,
  generateOtp,
  hashOtp,
  verifyHash,
  sendSms,
  getOtpExpiry,
  getMaxAttempts,
  getResendSeconds,
  verifyOtp,
};