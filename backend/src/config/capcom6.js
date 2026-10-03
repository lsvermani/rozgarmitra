/**
 * capcom6/android-sms-gateway (a.k.a. SMS Gateway for Android) configuration.
 *
 * How this differs from the pull-based gateway
 * ---------------------------------------------
 * The app in `gateway_app/` *polls* this backend: the phone dials out, so nothing
 * has to reach the phone. capcom6 inverts that - the app runs an HTTP **server**
 * on the device, so the backend has to connect *to* it at `<phone-ip>:8080`.
 *
 * Consequences worth being explicit about:
 *   - The backend and the phone must share a network (LAN/VPN).
 *   - No public IP, port forwarding or router change is needed - the connection
 *     originates from the backend and stays on the local network.
 *   - **Local mode only.** Their cloud relay (api.sms-gate.app) would relay every
 *     message - OTP codes included - through a third party, so it is deliberately
 *     not wired up here. Set the base URL explicitly if you want it anyway.
 *
 * Delivery receipts arrive asynchronously as signed webhooks, handled by
 * `controllers/capcom6WebhookController.js`.
 */

function getConfig() {
  return {
    enabled: String(process.env.CAPCOM6_ENABLED || 'false').toLowerCase() === 'true',

    /**
     * Base URL of the app's HTTP server.
     *
     * `SMS_GATEWAY_URL` is the documented name; `CAPCOM6_BASE_URL` is kept as an
     * alias so existing deployments do not break. The documented name wins when
     * both are set.
     *
     * Defaults to localhost, which is what an emulator sees (`10.0.2.2`). On a
     * real handset this must be the phone's LAN address.
     */
    baseUrl:
      process.env.SMS_GATEWAY_URL || process.env.CAPCOM6_BASE_URL || 'http://127.0.0.1:8080',

    /**
     * Basic-auth credentials as configured inside the app.
     * `SMS_GATEWAY_USERNAME` / `SMS_GATEWAY_PASSWORD` are the documented names;
     * `CAPCOM6_USERNAME` / `CAPCOM6_PASSWORD` remain supported as aliases.
     */
    username: process.env.SMS_GATEWAY_USERNAME || process.env.CAPCOM6_USERNAME || '',
    password: process.env.SMS_GATEWAY_PASSWORD || process.env.CAPCOM6_PASSWORD || '',

    /**
     * Optional device id, for accounts with more than one handset enrolled.
     * Omitted from the request body when blank, which is what local mode wants -
     * with one device there is nothing to disambiguate.
     */
    deviceId: process.env.SMS_GATEWAY_DEVICE_ID || '',

    /** SIM slot to use when the handset has more than one. */
    simNumber: parseInt(process.env.SMS_GATEWAY_SIM_NUMBER || process.env.CAPCOM6_SIM_NUMBER || '1', 10) || 1,

    /** Webhook HMAC signing key (Settings -> Webhooks -> Signing Key in the app). */
    webhookSecret: process.env.CAPCOM6_WEBHOOK_SECRET || '',

    /** Public URL the app posts receipts to. Must be reachable from the phone. */
    webhookUrl: process.env.CAPCOM6_WEBHOOK_URL || '',

    /** Optional: pin an id so re-registering does not duplicate the webhook. */
    webhookId: process.env.CAPCOM6_WEBHOOK_ID || 'rozgarmitra-otp',

    requestTimeoutMs:
      parseInt(process.env.SMS_GATEWAY_TIMEOUT_MS || process.env.CAPCOM6_TIMEOUT_MS || '10000', 10) || 10000,
  };
}

function isConfigured() {
  const cfg = getConfig();
  return Boolean(cfg.username && cfg.password);
}

function unusableReason() {
  const cfg = getConfig();
  if (!cfg.enabled) return 'capcom6 SMS gateway is disabled. Set CAPCOM6_ENABLED=true.';
  if (!cfg.username || !cfg.password) {
    return 'capcom6 is not configured. Set SMS_GATEWAY_USERNAME and SMS_GATEWAY_PASSWORD.';
  }
  return null;
}

/** Admin projection. The password and webhook secret are never returned. */
function toSafeSummary() {
  const cfg = getConfig();
  return {
    enabled: cfg.enabled,
    configured: isConfigured(),
    baseUrl: cfg.baseUrl,
    username: cfg.username ? `${cfg.username.slice(0, 2)}•••` : '',
    passwordSet: Boolean(cfg.password),
    simNumber: cfg.simNumber,
    webhookUrl: cfg.webhookUrl,
    webhookSecretSet: Boolean(cfg.webhookSecret),
    reason: unusableReason(),
  };
}

module.exports = { getConfig, isConfigured, unusableReason, toSafeSummary };