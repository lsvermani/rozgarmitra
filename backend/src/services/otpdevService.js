/**
 * OTP.dev delivery client (https://api.otp.dev).
 *
 * OTP.dev is a multi-channel aggregator - SMS, WhatsApp, Telegram, Viber, voice
 * and email behind one API. This module only *sends*; verification happens
 * locally in `whatsappOtpService`, so the provider is never asked to check a
 * code. See `config/otpDelivery.js` for why that matters.
 *
 * The API key is read here and nowhere else, and is never logged or returned.
 */
const delivery = require('../config/otpDelivery');

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Sends a caller-supplied OTP.
 *
 * OTP.dev accepts either `code_length` (it generates one) or `code` (we supply
 * one). We always supply it, so the application stays the source of truth for
 * the code and can keep its own hashing, attempt limit and expiry.
 *
 * @param {string} e164   Recipient in E.164, e.g. `+918699142699`.
 * @param {string} otp    Plaintext digits, 4-8 characters.
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function sendOtp(e164, otp) {
  const cfg = delivery.getProviderConfig();

  if (!cfg.usable) {
    return { ok: false, errorCode: 'service_not_configured' };
  }

  const { apiKey, sender, templateId, channel, baseUrl } = cfg.otpdev;

  // OTP.dev requires digits only, beginning with the country code - no `+`,
  // no spaces, no dashes.
  const phone = String(e164).replace(/^\+/, '').replace(/\D/g, '');
  const code = String(otp);

  let response;
  try {
    response = await fetch(`${baseUrl}/v1/verifications`, {
      method: 'POST',
      headers: {
        'X-OTP-Key': apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          channel,
          sender,
          phone,
          template: templateId,
          // `code`, not `code_length`: OTP.dev rejects both together (error
          // 1629), and supplying the code keeps verification on our side.
          code,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network / DNS / timeout. Never echo the key or the code.
    return { ok: false, errorCode: 'network_error' };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    // Their documented error shape is `errors[0].code`. Only the code is kept:
    // the message is free text and is not safe to show a user verbatim.
    const apiError = body && Array.isArray(body.errors) && body.errors[0];
    return {
      ok: false,
      errorCode: apiError && apiError.code ? String(apiError.code) : `http_${response.status}`,
    };
  }

  const entry = body && Array.isArray(body.data) ? body.data[0] : null;
  return {
    ok: true,
    messageId: entry && entry.message_id ? String(entry.message_id) : '',
  };
}

/**
 * Cheap credential probe.
 *
 * OTP.dev exposes no "whoami" endpoint, so a real send is the only truthful
 * check. This deliberately targets a syntactically invalid recipient: OTP.dev
 * rejects it with 1523 (invalid recipient) *after* validating the key, so a
 * 1523 proves the credentials work without delivering a message or spending
 * credit.
 *
 * @returns {Promise<{ ok: boolean, errorCode?: string }>}
 */
async function testConnection() {
  const cfg = delivery.getProviderConfig();
  if (!cfg.ready.otpdev) {
    return { ok: false, errorCode: 'service_not_configured' };
  }

  try {
    const response = await fetch(`${cfg.otpdev.baseUrl}/v1/verifications`, {
      method: 'POST',
      headers: {
        'X-OTP-Key': cfg.otpdev.apiKey,
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          channel: cfg.otpdev.channel,
          sender: cfg.otpdev.sender,
          phone: '1', // invalid on purpose
          template: cfg.otpdev.templateId,
          code: '1',
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const body = await response.json().catch(() => null);
    const apiError = body && Array.isArray(body.errors) && body.errors[0];
    const code = apiError ? String(apiError.code) : '';

    // 1523 = invalid recipient, i.e. the key and template passed validation.
    if (code === '1523' || code === '1524') {
      return { ok: true, validatedBy: 'otpdev' };
    }
    // 1136 = bad key. Anything else still means the request was authorised.
    if (code === '1136') {
      return { ok: false, errorCode: '1136' };
    }
    if (response.ok) return { ok: true, validatedBy: 'otpdev' };
    return { ok: false, errorCode: code || `http_${response.status}` };
  } catch {
    return { ok: false, errorCode: 'network_error' };
  }
}

module.exports = { sendOtp, testConnection };