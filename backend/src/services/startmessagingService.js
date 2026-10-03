/**
 * StartMessaging client for the Admin Panel OTP.
 *
 * API (per the vendor reference):
 *
 *   POST /otp/send
 *        X-API-Key: <key>
 *        { "phoneNumber": "+91...", "templateId": "...", "variables": { "otp": "123456" } }
 *      -> message id, tracked afterwards with
 *   GET  /messages/:id   -> initiated | queued | sent | delivered | failed
 *
 * The code in `variables.otp` is one this application generated; the provider
 * never sees our database and we never trust it to verify anything.
 *
 * Two deliberate omissions:
 *   - The message body is never logged. It contains the OTP.
 *   - The provider's raw error body is never returned to the browser. It can
 *     echo the request - including `variables.otp` - and it names the key that
 *     was rejected. Every failure is collapsed into an internal code first.
 */
const config = require('../config/startmessaging');

const SEND_PATH = '/otp/send';

/** Error code -> the sentence the browser is allowed to see. */
const FRIENDLY_MESSAGES = {
  not_configured: 'Unable to send OTP. Please try again.',
  service_disabled: 'Unable to send OTP. Please try again.',
  invalid_number: 'This number cannot receive the code. Please check it and try again.',
  invalid_request: 'Unable to send OTP. Please try again.',
  bad_credentials: 'Unable to send OTP. Please try again.',
  rate_limited: 'Too many OTP requests. Please try again later.',
  timeout: 'SMS service timed out. Please try again.',
  unreachable: 'SMS service is unavailable. Please try again shortly.',
  send_failed: 'Unable to send OTP. Please try again.',
};

/** X-API-Key header. The key is only ever read here and sent as a header. */
function authHeader() {
  return { 'X-API-Key': config.getConfig().apiKey };
}

/** Parses a response body without throwing on non-JSON. */
async function readJson(res) {
  try { return await res.json(); } catch { return null; }
}

/**
 * Maps an HTTP status onto an internal code.
 *
 * The response body is deliberately not inspected: providers in this family
 * echo the request on a validation failure, which would put the OTP into a log
 * or an error message.
 */
function classifyStatus(status) {
  if (status === 400 || status === 422) return 'invalid_request';
  if (status === 401 || status === 403) return 'bad_credentials';
  if (status === 404) return 'invalid_request';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'send_failed';
  return 'send_failed';
}

/** Pulls a message id out of the several shapes providers return. */
function extractMessageId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.id,
    payload.messageId,
    payload.message_id,
    payload._id,
    payload.data && (payload.data.id || payload.data.messageId),
  ];
  for (const value of candidates) {
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).slice(0, 120);
    }
  }
  return '';
}

/** Aborted fetch means a timeout, which is worth telling apart from offline. */
function classifyError(err) {
  return err && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'unreachable';
}
/**
 * Sends one OTP SMS.
 *
 * @param {string} e164 Recipient in E.164, e.g. `+918699142699`.
 * @param {string} otp  The code this application generated.
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string, message?: string }>}
 */
async function sendOtp(e164, otp) {
  const cfg = config.getConfig();

  const reason = config.unusableReason();
  if (reason) {
    console.warn('[StartMessaging] not usable:', reason);
    return { ok: false, errorCode: 'not_configured', message: FRIENDLY_MESSAGES.not_configured };
  }

  // Guarded here as well as in the controller: this is the last point before
  // the wire, and a malformed recipient should never be paid for.
  const phone = String(e164 || '').trim();
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    return { ok: false, errorCode: 'invalid_number', message: FRIENDLY_MESSAGES.invalid_number };
  }

  const variables = { otp: String(otp) };
  if (cfg.appName) variables.appName = cfg.appName;

  const body = {
    phoneNumber: phone,
    variables,
    ...(cfg.templateId ? { templateId: cfg.templateId } : {}),
  };

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${SEND_PATH}`, {
      method: 'POST',
      headers: {
        ...authHeader(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch (err) {
    const errorCode = classifyError(err);
    return { ok: false, errorCode, message: FRIENDLY_MESSAGES[errorCode] };
  }

  const payload = await readJson(response);

  if (!response.ok) {
    const errorCode = classifyStatus(response.status);
    // Neither the key nor the response body is logged.
    console.warn(`[StartMessaging] send failed: status=${response.status} code=${errorCode}`);
    return { ok: false, errorCode, message: FRIENDLY_MESSAGES[errorCode] };
  }

  return { ok: true, messageId: extractMessageId(payload) };
}

/**
 * Delivery status for a sent message.
 *
 * Optional: the OTP flow does not gate on it (a "sent" receipt can arrive after
 * the code already reached the handset), but it backs admin diagnostics.
 *
 * @returns {Promise<{ ok: boolean, state?: string, errorCode?: string }>}
 */
async function checkStatus(messageId) {
  const cfg = config.getConfig();
  if (config.unusableReason()) return { ok: false, errorCode: 'not_configured' };

  const id = String(messageId || '').trim().slice(0, 120);
  if (!id) return { ok: false, errorCode: 'invalid_request' };

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/messages/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { ...authHeader(), Accept: 'application/json' },
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch (err) {
    return { ok: false, errorCode: classifyError(err) };
  }

  const payload = await readJson(response);
  if (!response.ok) return { ok: false, errorCode: classifyStatus(response.status) };

  // Verified against the live API: the message is wrapped in a `data`
  // envelope, so the status lives at `data.status`, not at the top level.
  const body = (payload && payload.data) || payload || {};
  const state = String(body.status || body.state || '').toLowerCase();
  return { ok: true, state };
}

module.exports = { sendOtp, checkStatus, FRIENDLY_MESSAGES, extractMessageId };