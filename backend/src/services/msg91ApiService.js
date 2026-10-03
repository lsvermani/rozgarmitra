/**
 * MSG91 server-side OTP delivery.
 *
 * Uses the documented `POST /api/v5/otp/{templateId}` send endpoint. Only
 * delivery happens here: this application generated the code and verifies it
 * locally against its hashed store, so MSG91 is never asked to check a code.
 *
 * That keeps the attempt limit, expiry and cooldown under our control, and keeps
 * the code out of URLs (MSG91's verify endpoint is a GET with `?code=`, which
 * leaks into logs).
 *
 * Response shapes vary between MSG91 endpoints, and both are handled explicitly
 * rather than trusted: `{ "type": "success" }` and
 * `{ "status": "fail", "hasError": true, "errors": "...", "code": "..." }`.
 * Anything unrecognised fails closed.
 */
const config = require('../config/msg91Api');

/** Builds the send endpoint for the configured template. */
function sendEndpoint() {
  const cfg = config.getConfig();
  if (!cfg.templateId) throw new Error('MSG91_API_TEMPLATE_ID is not configured.');
  return `${cfg.baseUrl}/api/v5/otp/${encodeURIComponent(cfg.templateId)}`;
}

/**
 * Sends a caller-supplied OTP to `e164`.
 *
 * MSG91 accepts either `code_length` (it generates one) or `code` (we supply
 * one). We supply it - see the module comment.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function sendOtp(e164, otp) {
  const cfg = config.getConfig();

  if (!cfg.enabled) return { ok: false, errorCode: 'service_disabled' };
  if (!config.isConfigured()) return { ok: false, errorCode: 'not_configured' };

  // MSG91 wants digits with the country code and no `+`.
  const mobile = String(e164).replace(/^\+/, '').replace(/\D/g, '');
  const code = String(otp);

  let response;
  try {
    response = await fetch(sendEndpoint(), {
      method: 'POST',
      headers: {
        authkey: cfg.authkey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        // Both spellings are sent: MSG91's older flow API reads `OTP`, the
        // v5 template API reads `otp`. Sending both is accepted and avoids
        // guessing which one this account is provisioned for.
        OTP: code,
        otp: code,
        mobile,
        sender: cfg.sender,
      }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    return { ok: false, errorCode: 'network_error' };
  }

  let body = null;
  try { body = await response.json(); } catch { body = null; }

  // Explicit failure shape first, so a 200 carrying an error is never a pass.
  if (body && (body.hasError === true || String(body.type || '').toLowerCase() === 'error')) {
    return {
      ok: false,
      errorCode: body.code ? String(body.code) : (response.ok ? 'send_failed' : `http_${response.status}`),
    };
  }

  const type = String((body && body.type) || '').toLowerCase();
  if (!response.ok || (type && type !== 'success')) {
    return { ok: false, errorCode: `http_${response.status}` };
  }

  // Some deployments answer with a bare `{}` and HTTP 200 on success, so an
  // absent type is only accepted when the transport itself succeeded.
  if (type && type !== 'success') {
    return { ok: false, errorCode: 'send_failed' };
  }

  const messageId = body && (body.message_id || body.request_id || body.type);
  return { ok: true, messageId: messageId ? String(messageId) : '' };
}

/**
 * Probes the credentials without sending a message.
 *
 * Posts a deliberately invalid template id: MSG91 authenticates first and then
 * rejects the template with 1512/1513. Seeing either proves the authkey is
 * accepted, and costs nothing.
 *
 * @returns {Promise<{ ok: boolean, errorCode?: string }>}
 */
async function checkCredentials() {
  const cfg = config.getConfig();
  if (!cfg.authkey) return { ok: false, errorCode: 'not_configured' };

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}/api/v5/otp/00000000-0000-0000-0000-000000000000`, {
      method: 'POST',
      headers: {
        authkey: cfg.authkey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ mobile: '918699142699', OTP: '123456' }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    return { ok: false, errorCode: 'network_error' };
  }

  let body = null;
  try { body = await response.json(); } catch { body = null; }
  const code = body && body.code ? String(body.code) : '';

  // 1512 invalid template id / 1513 template not found => key was accepted.
  if (code === '1512' || code === '1513') return { ok: true, validatedBy: 'msg91' };
  // 201 / 1136 => the key itself was rejected.
  if (code === '201' || code === '1136' || response.status === 401) {
    return { ok: false, errorCode: code || 'credentials_rejected' };
  }
  if (response.ok) return { ok: true, validatedBy: 'msg91' };
  return { ok: false, errorCode: code || `http_${response.status}` };
}

module.exports = { sendOtp, checkCredentials };