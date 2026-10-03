/**
 * WhatsApp Business Cloud API configuration.
 *
 * Every value is read from the environment and nothing is ever defaulted to a
 * secret. This module is the ONLY place that touches the Meta credentials, and
 * it deliberately has no logging: `toSafeSummary()` is what the admin settings
 * screen is allowed to see, and it reports booleans rather than values.
 *
 * Nothing here is ever sent to a client. See docs/WHATSAPP_OTP.md for the full
 * Meta setup and the list of values that must be supplied.
 */

/**
 * Meta's currently-supported Cloud API version, used when the env omits one.
 *
 * v23.0 is the version used in Meta's own current Cloud API examples. Pinning an
 * older default is not free: Graph versions are retired on a schedule, and a
 * retired version starts failing every call. Override with
 * WHATSAPP_API_VERSION if you need to pin.
 */
const DEFAULT_API_VERSION = 'v23.0';

/**
 * Test mode is only honoured outside production.
 *
 * In test mode the OTP is returned to the *calling test/admin client* so the
 * automated suite can complete a verification without a real WhatsApp account.
 * It is refused outright when NODE_ENV=production so a stray env value cannot
 * ever leak a real OTP to a real user.
 */
function isTestMode() {
  const requested = String(process.env.WHATSAPP_TEST_MODE || '').toLowerCase() === 'true';
  if (!requested) return false;
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    console.warn('[WhatsApp] WHATSAPP_TEST_MODE is set but ignored because NODE_ENV=production.');
    return false;
  }
  return true;
}

/** Credentials present and non-empty. Never returns the secret itself. */
function hasCredentials() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID,
  );
}

/** Read an integer env var, falling back when unset or unparseable. */
function intEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  const enabled = String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';
  const configured = hasCredentials();

  return {
    enabled,
    configured,

    /** Service is usable: switched on *and* credentials actually present. */
    active: enabled && configured,

    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '',
    apiVersion: process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION,

    templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || '',
    languageCode: process.env.WHATSAPP_OTP_LANGUAGE_CODE || 'en',

    otpLength: intEnv('OTP_LENGTH', 6),
    otpExpiryMinutes: intEnv('OTP_EXPIRY_MINUTES', 5),
    otpMaxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
    otpResendSeconds: intEnv('OTP_RESEND_SECONDS', 60),

    /** Abuse protection: how many OTPs one number may request in a window. */
    perPhoneHourlyLimit: intEnv('OTP_PER_PHONE_HOURLY_LIMIT', 5),
    perIpHourlyLimit: intEnv('OTP_PER_IP_HOURLY_LIMIT', 30),

    testMode: isTestMode(),
  };
}

/**
 * A projection safe to return over the API.
 *
 * `accessToken` is reduced to a boolean and masked to a short tail so an
 * operator can tell *which* token is loaded without the value ever being read
 * back out of the database or the network.
 */
function toSafeSummary() {
  const cfg = getConfig();
  const token = cfg.accessToken;
  return {
    enabled: cfg.enabled,
    configured: cfg.configured,
    active: cfg.active,
    testMode: cfg.testMode,
    accessTokenSet: Boolean(token),
    // Only ever the last 4 characters, enough to tell two tokens apart.
    accessTokenHint: token ? `••••••••${token.slice(-4)}` : '',
    phoneNumberIdSet: Boolean(cfg.phoneNumberId),
    phoneNumberId: cfg.phoneNumberId,
    businessAccountIdSet: Boolean(cfg.businessAccountId),
    apiVersion: cfg.apiVersion,
    templateName: cfg.templateName,
    languageCode: cfg.languageCode,
    otpLength: cfg.otpLength,
    otpExpiryMinutes: cfg.otpExpiryMinutes,
    otpMaxAttempts: cfg.otpMaxAttempts,
    otpResendSeconds: cfg.otpResendSeconds,
    perPhoneHourlyLimit: cfg.perPhoneHourlyLimit,
    perIpHourlyLimit: cfg.perIpHourlyLimit,
  };
}

/** Human-readable reason the service cannot be used, or null when it can. */
function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'WhatsApp OTP is disabled.';
  if (!cfg.configured) {
    return 'WhatsApp OTP is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.';
  }
  if (!cfg.templateName) {
    return 'WhatsApp OTP template name is not set (WHATSAPP_OTP_TEMPLATE_NAME).';
  }
  return null;
}

module.exports = {
  getConfig,
  toSafeSummary,
  unusableReason,
  hasCredentials,
  isTestMode,
  DEFAULT_API_VERSION,
};