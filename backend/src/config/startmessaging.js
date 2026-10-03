/**
 * StartMessaging configuration.
 *
 * Delivery channel for the Admin Panel OTP. Chosen with
 * `ADMIN_OTP_PROVIDER=startmessaging`.
 *
 * How this differs from the SMS Gateway
 * -------------------------------------
 * The Android gateway requires a handset on the same network. StartMessaging is
 * a hosted HTTPS API, so no phone, no LAN, and nothing to keep alive - at the
 * cost of sending the code through a third party.
 *
 * What the API does NOT do
 * ------------------------
 * It does not generate the code. `variables.otp` is a value **we** produce and
 * verify locally, so the trust boundary stays exactly where it was with the
 * Android gateway: we own generation, hashing, expiry and the attempt budget,
 * and the provider is only a pipe. See `services/adminOtpService.js`.
 *
 * Auth is `X-API-Key`, not Basic. Nothing here is defaulted to a real value,
 * nothing is logged, and `toSafeSummary()` - the only projection ever returned
 * over HTTP - reports booleans and a masked hint.
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

function getConfig() {
  const apiKey = process.env.STARTMESSAGING_API_KEY || '';

  return {
    /**
     * Master switch for this transport. The service is usable only when this is
     * true AND a key is present, so a half-configured deployment fails loudly
     * instead of silently reporting "sent" while sending nothing.
     */
    enabled: boolEnv('STARTMESSAGING_ENABLED', true),
    configured: Boolean(apiKey),

    /**
     * Pinned by default. The value is not user input and there is no reason for
     * it to be redirectable at runtime, so allowing an arbitrary base URL would
     * only create a way to exfiltrate the API key.
     */
    baseUrl: process.env.STARTMESSAGING_BASE_URL || 'https://api.startmessaging.com',

    apiKey,
    /** 12 live, 15 test. Stored so the hint is meaningful, never the key. */
    apiMode: String(process.env.STARTMESSAGING_API_MODE || (apiKey.startsWith('sm_live_') ? 'live' : 'test')),

    /**
     * Optional approved template. When set, the message body comes from the
     * dashboard template; when blank, the provider renders its default SMS from
     * the variables alone.
     */
    templateId: process.env.STARTMESSAGING_TEMPLATE_ID || '',

    /** Optional `{{appName}}` placeholder in the template. */
    appName: process.env.STARTMESSAGING_APP_NAME || 'RozgarMitra',

    requestTimeoutMs: intEnv('STARTMESSAGING_TIMEOUT_MS', 10000),
  };
}

/** Human-readable reason the channel cannot be used, or null when it can. */
function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'StartMessaging is disabled. Set STARTMESSAGING_ENABLED=true.';
  if (!cfg.configured) return 'StartMessaging is not configured. Set STARTMESSAGING_API_KEY.';
  return null;
}

/** Admin projection. Never returns the key itself. */
function toSafeSummary() {
  const cfg = getConfig();
  const key = cfg.apiKey;
  return {
    enabled: cfg.enabled,
    configured: cfg.configured,
    usable: Boolean(cfg.enabled && cfg.configured),
    apiMode: cfg.apiMode,
    apiKeySet: Boolean(key),
    apiKeyHint: key ? `••••••••${key.slice(-4)}` : '',
    baseUrl: cfg.baseUrl,
    templateId: cfg.templateId,
    templateIdSet: Boolean(cfg.templateId),
    appName: cfg.appName,
    reason: unusableReason(),
  };
}

module.exports = { getConfig, unusableReason, toSafeSummary };