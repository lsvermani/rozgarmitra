/**
 * OTP delivery provider selection.
 *
 * Three transports are supported behind one interface:
 *
 *   otpdev    - OTP.dev, a multi-channel aggregator (SMS / WhatsApp / Telegram /
 *               Viber / voice / email). Costs money per delivered message.
 *   whatsapp  - Meta WhatsApp Business Cloud API. Costs money per conversation.
 *   demo      - no delivery at all; the code is only in the response. Development.
 *
 * Regardless of provider, the application always generates the code itself
 * (see `services/whatsappOtpService.js`) and stores only an HMAC of it. That is a
 * deliberate security choice and applies to OTP.dev too:
 *
 *   - OTP.dev's own verify endpoint is `GET /v1/verifications?code=...`, which
 *     puts the code in a URL. URLs end up in access logs, proxy logs and browser
 *     history. Sending the code in a request body and checking it locally avoids
 *     that entirely.
 *   - We keep our own attempt limit, expiry and cooldown instead of trusting a
 *     remote service to enforce them.
 *   - The code never has to leave the server to be checked.
 *
 * OTP.dev supports a caller-supplied `code` for this exact reason (see their
 * docs: supply either `code` or `code_length`, not both).
 */

/** Providers that can actually deliver a message. */
const DELIVERY_PROVIDERS = Object.freeze(['otpdev', 'msg91api', 'whatsapp', 'gateway', 'capcom6', 'demo']);

function boolEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function getProviderConfig() {
  const requested = String(process.env.OTP_PROVIDER || '').toLowerCase();
  const provider = DELIVERY_PROVIDERS.includes(requested) ? requested : 'demo';

  const otpdev = {
    apiKey: process.env.OTPDEV_API_KEY || '',
    sender: process.env.OTPDEV_SENDER || 'OTP.dev',
    templateId: process.env.OTPDEV_TEMPLATE_ID || '',
    channel: String(process.env.OTPDEV_CHANNEL || 'sms').toLowerCase(),
    /**
     * Fixed so the Graph/OTP.dev host cannot be pointed somewhere else by a
     * stray environment variable.
     */
    baseUrl: 'https://api.otp.dev',
  };

  const whatsapp = {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    templateName: process.env.WHATSAPP_OTP_TEMPLATE_NAME || '',
    languageCode: process.env.WHATSAPP_OTP_LANGUAGE_CODE || 'en',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
  };

  const ready = {
    otpdev: Boolean(otpdev.apiKey && otpdev.templateId),
    // MSG91 server-side API. Configured here (rather than in its own module)
    // so the provider table stays a single, comparable list.
    msg91api: Boolean(process.env.MSG91_API_AUTHKEY && process.env.MSG91_API_TEMPLATE_ID),
    whatsapp: Boolean(whatsapp.accessToken && whatsapp.phoneNumberId && whatsapp.templateName),
    // The gateway has no static credential: a phone registers its own token, or
    // uses the shared secret. It is therefore "configured" whenever the feature
    // is switched on, and its real health is a *runtime* question answered by
    // `hasHealthyDevice()` at the moment a message is queued.
    //
    // This used to be hardcoded to `null`, which made `usable` false and caused
    // every send to be refused with `service_not_configured` - while the caller
    // ignored that and reported success anyway.
    gateway: String(process.env.SMS_GATEWAY_ENABLED || 'false').toLowerCase() === 'true',
    // capcom6 SMS Gateway for Android: no build step required, the app is
    // installed from a release APK. Credentials come from its in-app settings.
    capcom6: String(process.env.CAPCOM6_ENABLED || 'false').toLowerCase() === 'true'
      && Boolean(process.env.CAPCOM6_USERNAME && process.env.CAPCOM6_PASSWORD),
    // Demo is always usable; it is the local-development default.
    demo: true,
  };

  return {
    provider,
    ready,
    usable: Boolean(ready[provider]),
    otpdev,
    whatsapp,
  };
}

/** Why the selected provider cannot deliver, or null when it can. */
function unusableReason() {
  const cfg = getProviderConfig();
  if (cfg.usable) return null;

  if (cfg.provider === 'otpdev') {
    if (!cfg.otpdev.apiKey) return 'OTP.dev is not configured. Set OTPDEV_API_KEY.';
    if (!cfg.otpdev.templateId) return 'OTP.dev is not configured. Set OTPDEV_TEMPLATE_ID.';
    return 'OTP.dev is not configured.';
  }

  if (cfg.provider === 'whatsapp') {
    if (!cfg.whatsapp.accessToken || !cfg.whatsapp.phoneNumberId) {
      return 'WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.';
    }
    return 'WhatsApp is not configured. Set WHATSAPP_OTP_TEMPLATE_NAME.';
  }

  return 'OTP delivery is unavailable.';
}

/**
 * Projection safe to return over the API. Secrets are reported as booleans and
 * a masked hint - never returned in full.
 */
function toSafeSummary() {
  const cfg = getProviderConfig();
  return {
    provider: cfg.provider,
    usable: cfg.usable,
    reason: unusableReason(),
    otpdev: {
      configured: cfg.ready.otpdev,
      apiKeySet: Boolean(cfg.otpdev.apiKey),
      apiKeyHint: cfg.otpdev.apiKey ? `â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢${cfg.otpdev.apiKey.slice(-4)}` : '',
      sender: cfg.otpdev.sender,
      channel: cfg.otpdev.channel,
      templateIdSet: Boolean(cfg.otpdev.templateId),
      templateId: cfg.otpdev.templateId,
    },
    whatsapp: {
      configured: cfg.ready.whatsapp,
      accessTokenSet: Boolean(cfg.whatsapp.accessToken),
      accessTokenHint: cfg.whatsapp.accessToken ? `â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢${cfg.whatsapp.accessToken.slice(-4)}` : '',
      phoneNumberIdSet: Boolean(cfg.whatsapp.phoneNumberId),
      phoneNumberId: cfg.whatsapp.phoneNumberId,
      templateName: cfg.whatsapp.templateName,
      languageCode: cfg.whatsapp.languageCode,
      apiVersion: cfg.whatsapp.apiVersion,
    },
  };
}

module.exports = { getProviderConfig, unusableReason, toSafeSummary, DELIVERY_PROVIDERS };
