/**
 * SMS gateway configuration.
 *
 * Two ways a gateway can authenticate, and both are supported:
 *
 *   1. Per-device token (preferred). The phone registers once and is issued a
 *      random token, stored only as a SHA-256 hash. Rotating one phone's
 *      credential does not disturb any other.
 *
 *   2. Shared secret (`SMS_GATEWAY_ID` + `SMS_GATEWAY_SECRET`). One credential
 *      for a single-gateway deployment, as specified. Simpler to operate, but
 *      rotating it takes every gateway offline at once, so it is only accepted
 *      when exactly one gateway exists.
 *
 * Nothing here is ever defaulted to a real value and nothing is logged.
 */

function intEnv(name, fallback) {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getConfig() {
  const sharedId = process.env.SMS_GATEWAY_ID || '';
  const sharedSecret = process.env.SMS_GATEWAY_SECRET || '';

  return {
    enabled: String(process.env.SMS_GATEWAY_ENABLED || 'false').toLowerCase() === 'true',

    /** Shared-secret credentials, when configured. */
    sharedId,
    sharedSecret,
    sharedAuth: Boolean(sharedId && sharedSecret),

    /**
     * The SIM's own number. Informational only: it is displayed in the admin
     * view so an operator can confirm which SIM is the gateway. It is never
     * used to route a message and is never treated as an OTP recipient.
     */
    phoneNumber: process.env.SMS_GATEWAY_PHONE_NUMBER || '',

    /** How often the phone should poll for work (ms). */
    pollInterval: intEnv('SMS_GATEWAY_POLL_INTERVAL', 5000),

    /** How often the phone should send a heartbeat (ms). */
    heartbeatInterval: intEnv('SMS_GATEWAY_HEARTBEAT_INTERVAL', 30000),

    /**
     * A claimed job with no result within this window becomes `unknown`
     * (never requeued - see services/smsGatewayService.js).
     */
    jobTimeoutMs: intEnv('SMS_GATEWAY_JOB_TIMEOUT', 60000) * 1000,

    /** OTP policy, shared with the other providers. */
    otpEnabled: String(process.env.OTP_ENABLED || 'true').toLowerCase() === 'true',
    otpLength: intEnv('OTP_LENGTH', 6),
    otpExpiryMinutes: intEnv('OTP_EXPIRY_MINUTES', 5),
    otpMaxAttempts: intEnv('OTP_MAX_ATTEMPTS', 5),
    otpResendSeconds: intEnv('OTP_RESEND_SECONDS', 60),

    /**
     * The SMS body. `{{OTP}}` is substituted just before sending; the template
     * itself never reaches the database, only the sealed body does.
     */
    messageTemplate:
      process.env.OTP_MESSAGE_TEMPLATE ||
      'Your verification code is {{OTP}}. It is valid for 5 minutes. Do not share this code with anyone.',
  };
}

/**
 * Renders the configured template.
 *
 * Every occurrence of `{{OTP}}` is replaced, and a stray `{{otp}}` is honoured
 * too so a lower-case placeholder does not leak the literal text to a handset.
 */
function renderMessage(otp) {
  const template = getConfig().messageTemplate;
  const rendered = template.replace(/\{\{\s*OTP\s*\}\}/gi, String(otp));
  // A template with no placeholder would send a message with no code in it.
  return rendered.includes(String(otp)) ? rendered : `${rendered} ${otp}`;
}

/** Admin-facing projection. The secret is never returned. */
function toSafeSummary() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    sharedAuth: cfg.sharedAuth,
    gatewayId: cfg.sharedId,
    secretSet: Boolean(cfg.sharedSecret),
    secretHint: cfg.sharedSecret ? `••••••••${cfg.sharedSecret.slice(-4)}` : '',
    phoneNumber: cfg.phoneNumber,
    pollInterval: cfg.pollInterval,
    heartbeatInterval: cfg.heartbeatInterval,
    jobTimeoutSeconds: cfg.jobTimeoutMs / 1000,
    otpEnabled: cfg.otpEnabled,
    otpLength: cfg.otpLength,
    otpExpiryMinutes: cfg.otpExpiryMinutes,
    otpMaxAttempts: cfg.otpMaxAttempts,
    otpResendSeconds: cfg.otpResendSeconds,
    messageTemplate: cfg.messageTemplate,
  };
}

module.exports = { getConfig, renderMessage, toSafeSummary };