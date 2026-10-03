/**
 * MSG91 server-side OTP API configuration.
 *
 * This is the *other* MSG91 integration from `config/msg91.js`:
 *
 *   config/msg91.js      -> the OTP **widget**, which runs in the browser/app
 *                          and therefore needs its tokenAuth in the client.
 *   config/msg91Api.js   -> the **server-side** Send/Verify APIs, where the
 *                          authkey never leaves the backend.
 *
 * Prefer this one. The widget forces `tokenAuth` into the APK; this does not.
 *
 * As with the other providers, the application generates the OTP itself and
 * verifies it locally, so MSG91 is used purely for *delivery*. MSG91's own
 * verify endpoint is `GET /v1/.../verify?code=...`, which puts the code in a URL
 * and therefore into access logs - avoided by never calling it.
 */

/** Values that must come from the MSG91 panel. */
function getConfig() {
  return {
    authkey: process.env.MSG91_API_AUTHKEY || '',
    /** OTP template UUID from MSG91 → OTP → Templates. */
    templateId: process.env.MSG91_API_TEMPLATE_ID || '',
    /** Sender id users see. Must be registered with the carrier. */
    sender: process.env.MSG91_API_SENDER || 'MSG91',

    enabled: String(process.env.MSG91_API_ENABLED || 'false').toLowerCase() === 'true',

    /**
     * Fixed so a stray environment variable cannot redirect the authkey to an
     * attacker-controlled host. Overridable only via MSG91_API_BASE_URL for
     * staging.
     */
    baseUrl: process.env.MSG91_API_BASE_URL || 'https://control.msg91.com',

    requestTimeoutMs: 10000,

    otpLength: parseInt(process.env.MSG91_OTP_LENGTH || '6', 10) || 6,
  };
}

function isConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.authkey && cfg.templateId);
}

function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'MSG91 OTP API is disabled.';
  if (!cfg.authkey) return 'MSG91 API authkey is not configured.';
  if (!cfg.templateId) return 'MSG91 OTP template ID is not configured.';
  return null;
}

/** Admin-facing projection. The authkey is never returned. */
function toSafeSummary() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    configured: isConfigured(),
    authkeySet: Boolean(cfg.authkey),
    // Last 4 only, so an operator can tell two keys apart without reading one.
    authkeyHint: cfg.authkey ? `••••••••${cfg.authkey.slice(-4)}` : '',
    templateId: cfg.templateId,
    sender: cfg.sender,
    baseUrl: cfg.baseUrl,
    otpLength: cfg.otpLength,
    reason: unusableReason(),
  };
}

module.exports = { getConfig, isConfigured, unusableReason, toSafeSummary };