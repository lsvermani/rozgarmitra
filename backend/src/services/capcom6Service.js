/**
 * capcom6/android-sms-gateway client.
 *
 * Endpoints are taken from the project's published API (docs.sms-gate.app):
 *
 *   send      POST {base}/3rdparty/v1/messages
 *             { "textMessage": { "text": "..." }, "phoneNumbers": ["+91..."] }
 *   register  POST {base}/webhooks   { "id", "url", "event" }
 *
 * Auth is HTTP Basic, which the app still supports.
 *
 * The password is only ever read here and sent as an Authorization header; it is
 * never logged and never returned.
 */
const crypto = require('crypto');
const config = require('../config/capcom6');

const SEND_PATH = '/3rdparty/v1/messages';
const WEBHOOK_PATH = '/webhooks';

/** Basic auth header for the app. */
function authHeader() {
  const cfg = config.getConfig();
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`, 'utf8').toString('base64')}`;
}

/** Parses a response body without throwing on non-JSON. */
async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

/**
 * Sends one SMS to one recipient.
 *
 * @param {string} e164   Recipient, e.g. `+917009800747`.
 * @param {string} body   Message text (the OTP message).
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function sendOtp(e164, body) {
  const cfg = config.getConfig();

  if (!cfg.enabled) return { ok: false, errorCode: 'service_disabled' };
  if (!config.isConfigured()) return { ok: false, errorCode: 'not_configured' };

  const phone = String(e164).replace(/^\+/, '').replace(/\D/g, '');

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${SEND_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        textMessage: { text: String(body) },
        phoneNumbers: [phone],
        simNumber: cfg.simNumber,
        // Only present for multi-device accounts. Local mode with one handset
        // must omit it, so it is added conditionally rather than as `''`.
        ...(cfg.deviceId ? { deviceId: cfg.deviceId } : {}),
      }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch (err) {
    // Phone asleep, off the network, or the app stopped. Never leaks the
    // credentials or the message.
    //
    // An aborted fetch is specifically a timeout, which is worth telling apart
    // from "phone unreachable": the operator's fix is different.
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      return { ok: false, errorCode: 'timeout' };
    }
    return { ok: false, errorCode: 'gateway_unreachable' };
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const error = String((payload && (payload.error || payload.message)) || '');
    if (/auth|credential|401/i.test(error)) return { ok: false, errorCode: 'bad_credentials' };
    // Almost always a wrong host or port rather than a bad request.
    if (/not found|404/i.test(error)) return { ok: false, errorCode: 'endpoint_not_found' };
    return { ok: false, errorCode: 'send_failed' };
  }

  const id =
    (payload && (payload.messageId || payload.id)) ||
    (Array.isArray(payload && payload.messages) && payload.messages[0]
      ? payload.messages[0].messageId
      : '');

  return { ok: true, messageId: id ? String(id) : '' };
}
/**
 * Registers this backend as a webhook receiver on the app.
 *
 * Only meaningful once `CAPCOM6_WEBHOOK_URL` points somewhere the phone can
 * actually reach - the phone dials out, so it needs the backend on an address it
 * can resolve (LAN IP, VPN, or a tunnel).
 *
 * @param {string} event  e.g. 'sms:sent'
 */
async function registerWebhook(event = 'sms:sent') {
  const cfg = config.getConfig();
  if (!config.isConfigured()) return { ok: false, errorCode: 'not_configured' };
  if (!cfg.webhookUrl) return { ok: false, errorCode: 'webhook_url_missing' };

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ id: cfg.webhookId, url: cfg.webhookUrl, event }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    return { ok: false, errorCode: 'gateway_unreachable' };
  }

  const payload = await readJson(response);
  return response.ok
    ? { ok: true, detail: payload }
    : { ok: false, errorCode: 'register_failed' };
}

/**
 * Verifies a webhook signature exactly as the app documents it:
 *   HMAC-SHA256(key = signing key, message = rawBody + X-Timestamp), hex.
 *
 * A missing secret refuses everything. Silently accepting unsigned delivery
 * reports would let anyone mark an OTP as sent without it ever being sent.
 */
function verifyWebhook(rawBody, signature, timestamp) {
  const secret = config.getConfig().webhookSecret;
  if (!secret) return { ok: false, reason: 'Webhook secret not configured.' };
  if (!signature || !timestamp) return { ok: false, reason: 'Missing signature headers.' };

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${rawBody}${timestamp}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature).trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return { ok: false, reason: 'Bad signature.' };

  return crypto.timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: 'Bad signature.' };
}

/** Probes the app without sending anything (used by Test Connection). */
async function testConnection() {
  const cfg = config.getConfig();
  if (!config.isConfigured()) return { ok: false, errorCode: 'not_configured' };

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/`, {
      method: 'GET',
      headers: { Authorization: authHeader(), Accept: 'application/json' },
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    return { ok: false, errorCode: 'gateway_unreachable' };
  }

  // Any HTTP answer proves the app is up; 401/403 proves it is up but our
  // credentials are wrong.
  if (response.status === 401 || response.status === 403) {
    return { ok: false, errorCode: 'bad_credentials' };
  }
  return { ok: true, status: response.status };
}

module.exports = { sendOtp, registerWebhook, verifyWebhook, testConnection };
