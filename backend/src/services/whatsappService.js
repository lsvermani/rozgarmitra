/**
 * WhatsApp Business Cloud API client (official Meta Graph API).
 *
 * This is the **only** module permitted to talk to Meta. Controllers call the
 * exported helpers; the access token is read from the environment here and
 * never travels anywhere else - not to a controller, not to a log, not to a
 * client.
 *
 * Transport notes
 * ---------------
 * - HTTPS only. There is no override to change the host, so a misconfigured
 *   environment cannot redirect the token to an attacker-controlled endpoint.
 * - Every call has a hard timeout, so a hung Meta request cannot pin an Express
 *   worker until the client gives up.
 * - Errors are mapped to the provider's `error.code` and a generic message. The
 *   raw response body is deliberately discarded: Meta echoes the message body in
 *   some failures, and the message body contains the OTP.
 */
const config = require('../config/whatsapp');
const { maskPhone } = require('../utils/phone');

/** Graph API host. Not overridable, on purpose. */
const GRAPH_HOST = 'https://graph.facebook.com';

/** A Meta call must not outlive the client's patience. */
const REQUEST_TIMEOUT_MS = 10000;

/** Builds the endpoint for a phone-number-scoped path. */
function endpoint(path) {
  const cfg = config.getConfig();
  if (!cfg.phoneNumberId) throw new Error('WHATSAPP_PHONE_NUMBER_ID is not configured.');
  return `${GRAPH_HOST}/${cfg.apiVersion}/${cfg.phoneNumberId}${path}`;
}

/**
 * POSTs to the Graph API and normalises the outcome.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function post(path, payload) {
  const cfg = config.getConfig();

  let response;
  try {
    response = await fetch(endpoint(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Network / DNS / timeout. The token is never part of this message.
    return { ok: false, errorCode: 'network_error' };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    // `error.code` is a stable identifier; the human-readable `message` and
    // `error_data.details` are dropped on purpose - they can echo the template
    // body, which contains the OTP.
    const errorCode = body && body.error && body.error.code
      ? String(body.error.code)
      : `http_${response.status}`;
    return { ok: false, errorCode };
  }

  const messageId = body && body.messages && body.messages[0] && body.messages[0].id;
  return { ok: true, messageId: messageId ? String(messageId) : '' };
}

/**
 * Sends the OTP through an approved WhatsApp **authentication template**.
 *
 * Authentication templates are the only sanctioned way to deliver a code: Meta
 * restricts free-form template messages and enforces a single `{{1}}` parameter
 * for the code. A plain `type: "text"` body is deliberately not supported here -
 * it would be rejected outside the 24-hour customer-service window, and relying
 * on it would make delivery intermittent.
 *
 * @param {string} phone E.164 recipient, e.g. `+918699142699`.
 * @param {string} otp   The plaintext code. Never logged, never returned.
 */
async function sendWhatsAppOTP(phone, otp) {
  const cfg = config.getConfig();

  // Test mode is checked BEFORE the credential check on purpose: the suite has to
  // be able to exercise the whole flow with no Meta account at all. Returning
  // early also guarantees no real message is ever sent from a test run.
  if (cfg.testMode) {
    return { ok: true, messageId: 'test-mode' };
  }

  if (!cfg.active) {
    return { ok: false, errorCode: 'service_disabled' };
  }

  return post('/messages', {
    messaging_product: 'whatsapp',
    recipient_type: 'INDIVIDUAL',
    to: phone,
    type: 'template',
    template: {
      name: cfg.templateName,
      language: { code: cfg.languageCode },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: String(otp) }],
        },
      ],
    },
  });
}

/**
 * Verifies the credentials by reading the sender number's own profile.
 *
 * A GET is used deliberately: it proves the token is valid and the phone number
 * ID exists without consuming message quota or messaging anyone.
 */
async function testConnection() {
  const cfg = config.getConfig();

  if (!cfg.configured) {
    return { ok: false, errorCode: 'not_configured' };
  }

  let response;
  try {
    response = await fetch(endpoint(''), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, errorCode: 'network_error' };
  }

  if (!response.ok) {
    return { ok: false, errorCode: `http_${response.status}` };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  return {
    ok: true,
    // Only non-sensitive identity fields are surfaced.
    displayPhoneNumber: body && body.display_phone_number ? maskPhone(body.display_phone_number) : '',
    verifiedName: body && body.verified_name ? String(body.verified_name) : '',
  };
}

module.exports = { sendWhatsAppOTP, testConnection };