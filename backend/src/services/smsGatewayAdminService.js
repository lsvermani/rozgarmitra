/**
 * SMS Gateway adapter for the Admin Panel OTP.
 *
 * Wraps `services/capcom6Service.js` (the client for
 * capcom6/android-sms-gateway) so the admin flow does not have to know which
 * transport is configured, and so every failure collapses into a small set of
 * error codes that map onto user-facing sentences.
 *
 * Two things this deliberately does NOT do:
 *   - It never logs the message body. That body contains the OTP.
 *   - It never returns the raw gateway error text. A 401 from the gateway
 *     carries the username it rejected, which is an authentication detail the
 *     browser must not see.
 *
 * Endpoints come from the project's own source (`WebService.kt` + the bundled
 * `swagger.json`), which distinguishes two deployment modes that do NOT share a
 * path prefix:
 *
 *   LOCAL (the handset's HTTP server, what this project uses - the default)
 *     POST {SMS_GATEWAY_URL}/messages
 *   CLOUD (api.sms-gate.app relay)
 *     POST https://api.sms-gate.app/3rdparty/v1/messages
 *
 * This service only ever appends the leaf path, so `SMS_GATEWAY_URL` must carry
 * any prefix the chosen host needs.
 *
 * Body: { "textMessage": { "text": "..." }, "phoneNumbers": ["..."] }
 * Auth: HTTP Basic. `ScopeAuthorization.kt` grants a Basic-authenticated request
 * every scope, so no token exchange is needed.
 */
const capcom6 = require('./capcom6Service');
const capcom6Config = require('../config/capcom6');
const config = require('../config/adminOtp');
const { maskPhone } = require('../utils/phone');

/**
 * Error code -> the sentence the browser is allowed to see.
 *
 * Every message here is deliberately vague about *why*: distinguishing "gateway
 * offline" from "gateway rejected our password" would tell an unauthenticated
 * caller something about the server's private configuration.
 */
const FRIENDLY_MESSAGES = {
  not_configured: 'Unable to send OTP. Please try again.',
  service_disabled: 'Unable to send OTP. Please try again.',
  gateway_unreachable: 'SMS Gateway is unavailable. Please try again shortly.',
  bad_credentials: 'Unable to send OTP. Please try again.',
  endpoint_not_found: 'Unable to send OTP. Please try again.',
  timeout: 'SMS Gateway timed out. Please try again.',
  send_failed: 'Unable to send OTP. Please try again.',
};

/** Internal error code for a fetch abort, which is usually a timeout. */
function classify(error) {
  if (!error) return 'send_failed';
  if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout';
  return 'gateway_unreachable';
}

/**
 * Sends `body` to `e164` through the Android SMS Gateway.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function send(e164, body) {
  const reason = capcom6Config.unusableReason();
  if (reason) {
    console.warn('[AdminOTP] SMS Gateway not usable:', reason);
    return { ok: false, errorCode: 'not_configured' };
  }

  try {
    const result = await capcom6.sendOtp(e164, body);
    if (result.ok) return { ok: true, messageId: result.messageId || '' };
    return { ok: false, errorCode: result.errorCode || 'send_failed' };
  } catch (error) {
    return { ok: false, errorCode: classify(error) };
  }
}

/**
 * Sends the OTP message to the authorised administrator number.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string, message?: string }>}
 */
async function sendOtpToAdmin(e164, otp) {
  const result = await send(e164, config.renderMessage(otp));
  if (result.ok) return result;
  return { ...result, message: FRIENDLY_MESSAGES[result.errorCode] || FRIENDLY_MESSAGES.send_failed };
}

module.exports = { send, sendOtpToAdmin, FRIENDLY_MESSAGES, maskPhone };