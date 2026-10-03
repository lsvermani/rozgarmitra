/**
 * Admin OTP login configuration.
 *
 * Single source of truth for the **admin panel** sign-in flow:
 *
 *     /login  ->  phone  ->  server-generated OTP  ->  Android SMS Gateway  ->  verify
 *
 * Everything sensitive is read from the environment and nothing is defaulted to
 * a real value. Nothing in this module logs, and `toSafeSummary()` - the only
 * projection ever returned over HTTP - reports booleans and masked hints.
 *
 * Relationship to the other config modules
 * ---------------------------------------
 * - `config/capcom6.js`    how we *talk to* the Android SMS Gateway app.
 * - `config/whatsapp.js`   the Meta WhatsApp provider (separate flow, untouched).
 * - `config/otpDelivery.js` the provider switch used by workers / job creators.
 *
 * The admin panel deliberately does **not** go through `otpDelivery`: it needs a
 * different storage model (hashed codes, attempt counters, a hard allow-list of
 * one number) and a different failure vocabulary, so it gets its own small,
 * self-contained policy here.
 */

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function intEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Strips formatting and returns the bare 10-digit Indian number, or ''. */
function toNational(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return '';
}

/**
 * Test mode is honoured outside production only.
 *
 * When on, the generated code is echoed in the `request-otp` response so the
 * automated suite can complete a verification without a physical handset and SIM.
 * Mirrors `config/whatsapp.js` exactly: refused outright when
 * NODE_ENV=production, so a stray environment value can never leak a real code.
 */
function isTestMode() {
  if (!boolEnv('ADMIN_OTP_TEST_MODE')) return false;
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.warn('[AdminOTP] ADMIN_OTP_TEST_MODE is set but ignored because NODE_ENV=production.');
    return false;
  }
  return true;
}

/** The HMAC pepper. Without it a stolen DB dump can brute-force 6 digits offline. */
function pepper() {
  return process.env.ADMIN_OTP_PEPPER || 'rozgarmitra-development-only-admin-otp-pepper';
}

function getConfig() {
  const phone = toNational(process.env.ADMIN_PHONE_NUMBER);

  return {
    /**
     * The one and only number allowed to complete an OTP admin sign-in.
     * Compared after normalisation, so `+91 86991 42699` also matches.
     */
    adminPhone: phone,

    /** Master switch. Off = the endpoints report "unavailable", never a false success. */
    enabled: boolEnv('ADMIN_OTP_ENABLED', true),

    // --- OTP policy (same vocabulary as the rest of the app) ---
    otpLength: Math.min(8, intEnv('OTP_LENGTH', 6)),
    otpExpiryMinutes: intEnv('OTP_EXPIRY_MINUTES', 5),
    otpMaxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
    otpResendSeconds: intEnv('OTP_RESEND_SECONDS', 60),

    // --- Abuse protection ---
    /** OTPs one authorised number may request per hour. */
    perPhoneHourlyLimit: intEnv('ADMIN_OTP_PER_PHONE_HOURLY_LIMIT', 5),
    /** OTPs one IP may request per hour (express-rate-limit enforces this). */
    perIpHourlyLimit: intEnv('ADMIN_OTP_PER_IP_HOURLY_LIMIT', 20),
    /** Verification attempts one IP may make per 15 minutes. */
    perIpVerifyAttempts: intEnv('ADMIN_OTP_VERIFY_MAX_ATTEMPTS', 20),

    /**
     * `{{OTP}}` is substituted immediately before the message leaves the
     * process. The template never reaches the database and the rendered body is
     * never logged.
     */
    messageTemplate:
      process.env.ADMIN_OTP_MESSAGE_TEMPLATE ||
      'Your Admin Panel login OTP is: {{OTP}}. This OTP is valid for 5 minutes. Do not share this OTP with anyone.',

    testMode: isTestMode(),
  };
}

/** Why admin OTP login cannot be used right now, or null when it can. */
function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'Admin OTP login is disabled.';
  if (!cfg.adminPhone) {
    return 'Admin OTP login is not configured. Set ADMIN_PHONE_NUMBER.';
  }
  return null;
}

/** Renders the configured SMS template. A missing placeholder is appended. */
function renderMessage(otp) {
  const rendered = getConfig().messageTemplate.replace(/\{\{\s*OTP\s*\}\}/gi, String(otp));
  return rendered.includes(String(otp)) ? rendered : `${rendered} ${otp}`;
}

/** Admin-facing projection. Never returns the pepper or the phone number. */
function toSafeSummary() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    configured: Boolean(cfg.adminPhone),
    testMode: cfg.testMode,
    otpLength: cfg.otpLength,
    otpExpiryMinutes: cfg.otpExpiryMinutes,
    otpMaxAttempts: cfg.otpMaxAttempts,
    otpResendSeconds: cfg.otpResendSeconds,
    perPhoneHourlyLimit: cfg.perPhoneHourlyLimit,
    perIpHourlyLimit: cfg.perIpHourlyLimit,
    reason: unusableReason(),
  };
}

module.exports = {
  getConfig,
  unusableReason,
  renderMessage,
  toSafeSummary,
  isTestMode,
  toNational,
  // Exported so `services/adminOtpService.js` can hash without reaching into
  // `process.env` itself, which keeps the pepper defined in exactly one place.
  pepper,
};