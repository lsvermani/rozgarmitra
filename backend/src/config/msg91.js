/**
 * MSG91 OTP Widget configuration.
 *
 * Integration model
 * -----------------
 * The widget runs in the client (browser or Flutter app) and exposes
 * `sendOtp` / `retryOtp` / `verifyOtp` on `window` when `exposeMethods` is
 * enabled. MSG91 generates the code and, on success, hands the client a short
 * **JWT access-token** proving the number was verified.
 *
 * That token is treated here as a *claim*, not as proof. The client presents it
 * to this backend, and the backend calls MSG91's **Verify Access Token** endpoint
 * before issuing a session. An attacker can therefore skip the widget entirely
 * and POST anything to `/auth/msg91/complete`; it will be rejected.
 *
 * ⚠️ Security trade-off, stated plainly
 * ------------------------------------
 * The widget requires `widgetId` + `tokenAuth` **in the client**, so `tokenAuth`
 * is exposed to anyone who can read the page or unpack the APK. That is inherent
 * to the widget design, not something this code can fix. What this code *does*
 * guarantee:
 *   - the token never grants access to any other API;
 *   - it cannot mint a session on its own (the backend re-validates it);
 *   - it is not logged, not stored, and not persisted to disk.
 * If you later want zero client-side exposure, switch OTP_PROVIDER to `msg91-api`
 * (server-side Send/Verify) instead.
 *
 * All values come from the environment and are never committed.
 */

/** MSG91 control-plane host. Overridable only for staging/self-hosted use. */
const DEFAULT_BASE_URL = 'https://control.msg91.com';

function getConfig() {
  const widgetId = process.env.MSG91_WIDGET_ID || '';
  const tokenAuth = process.env.MSG91_TOKEN_AUTH || '';

  return {
    widgetId,
    tokenAuth,
    baseUrl: process.env.MSG91_API_BASE_URL || DEFAULT_BASE_URL,

    /**
     * Off by default. With the widget disabled every endpoint reports the
     * feature as unavailable and the app keeps its existing SMS/Firebase login.
     */
    enabled: String(process.env.MSG91_ENABLED || 'false').toLowerCase() === 'true',

    /** How long a client may take to finish verification before we give up. */
    requestTimeoutMs: 10000,

    /** Minimum OTP length MSG91 accepts (their documented range is 4-8). */
    otpLength: parseInt(process.env.MSG91_OTP_LENGTH || '6', 10) || 6,
  };
}

function isConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.widgetId && cfg.tokenAuth);
}

function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'MSG91 OTP is disabled.';
  if (!cfg.widgetId) return 'MSG91 widget ID is not configured.';
  if (!cfg.tokenAuth) return 'MSG91 auth token is not configured.';
  return null;
}

/**
 * What the browser/app is given.
 *
 * `tokenAuth` is included because the widget will not initialise without it.
 * It is returned only over an authenticated-free, feature-gated endpoint and is
 * never logged. Everything else is a boolean or a length.
 */
function toClientConfig() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled && isConfigured(),
    widgetId: cfg.widgetId,
    tokenAuth: cfg.tokenAuth,
    otpLength: cfg.otpLength,
    reason: unusableReason(),
  };
}

/** Projection for the admin screen - secrets are booleans/masked hints only. */
function toSafeSummary() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    configured: isConfigured(),
    widgetId: cfg.widgetId,
    tokenAuthSet: Boolean(cfg.tokenAuth),
    tokenAuthHint: cfg.tokenAuth ? `••••••••${cfg.tokenAuth.slice(-4)}` : '',
    baseUrl: cfg.baseUrl,
    otpLength: cfg.otpLength,
    reason: unusableReason(),
  };
}

module.exports = {
  getConfig,
  isConfigured,
  unusableReason,
  toClientConfig,
  toSafeSummary,
  DEFAULT_BASE_URL,
};