/**
 * MSG91 server-side verification.
 *
 * The widget (browser / Flutter) performs the code check and receives a JWT
 * **access-token** on success. This module is the part that makes the flow
 * trustworthy: it asks MSG91 whether that token is genuine.
 *
 * MSG91 documents this as "POST Verify Access Token", described in their example
 * flow as:
 *
 *     Send OTP -> Get reqId
 *     Retry OTP (optional) -> Use reqId
 *     Verify OTP -> Get JWT access-token
 *     Verify access-token -> Get verified user information
 *
 * The endpoint path is therefore configurable (`MSG91_VERIFY_TOKEN_PATH`) rather
 * than hard-coded: MSG91 has moved these paths between API versions, and baking
 * in a guessed URL would turn a config mistake into a silent security failure.
 * The default matches the documented v5 widget route.
 *
 * Nothing here logs the token, the auth key, or MSG91's raw response.
 */
const config = require('../config/msg91');

/** Documented default path for the widget access-token check. */
const DEFAULT_VERIFY_PATH = '/api/v5/otp/{widgetId}/verify/token';

/**
 * Confirms an access-token and returns the identity MSG91 holds for it.
 *
 * @param {string} accessToken JWT returned by the widget on successful verify.
 * @returns {Promise<{ ok: true, identifier?: string } | { ok: false, reason: string }>}
 */
async function verifyAccessToken(accessToken) {
  const cfg = config.getConfig();

  if (!cfg.enabled) {
    return { ok: false, reason: 'MSG91 OTP is disabled.' };
  }
  if (!config.isConfigured()) {
    return { ok: false, reason: 'MSG91 is not configured.' };
  }
  if (!accessToken || typeof accessToken !== 'string' || accessToken.length < 16) {
    return { ok: false, reason: 'Verification token is missing.' };
  }

  const path = (process.env.MSG91_VERIFY_TOKEN_PATH || DEFAULT_VERIFY_PATH)
    .replace('{widgetId}', encodeURIComponent(cfg.widgetId));

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        // MSG91 expects the widget auth token in this header.
        authkey: cfg.tokenAuth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token: accessToken }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    // Network / DNS / timeout. Never leak which side failed.
    return { ok: false, reason: 'Could not confirm the verification. Please try again.' };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return { ok: false, reason: 'Could not confirm the verification. Please try again.' };
  }

  // MSG91 uses two response shapes on these endpoints and both are in the wild:
  //
  //   success -> { "type": "success", "identifier": "...", ... }
  //   failure -> { "status": "fail", "hasError": true, "errors": "...", "code": "401" }
  //
  // Verified against the live API: an invalid credential on this route answers
  // HTTP 401 with the `status`/`hasError` shape, not an HTTP error page. Both
  // shapes are therefore handled explicitly, and anything unrecognised fails
  // closed rather than being read as success.
  if (body && (body.hasError === true || String(body.status || '').toLowerCase() === 'fail')) {
    return { ok: false, reason: 'This verification could not be confirmed. Please request a new OTP.' };
  }

  const type = String((body && (body.type || (body.message && body.message.type))) || '').toLowerCase();
  if (type !== 'success') {
    return { ok: false, reason: 'This verification could not be confirmed. Please request a new OTP.' };
  }

  const identifier =
    (body && (body.identifier || (body.message && body.message.identifier))) || '';

  if (!identifier) {
    // A success with no identity is not something we can tie to a user, so it is
    // treated as a failure rather than trusted.
    return { ok: false, reason: 'This verification could not be confirmed. Please request a new OTP.' };
  }

  return { ok: true, identifier: String(identifier) };
}

/**
 * Checks whether the configured widget credentials are accepted by MSG91.
 *
 * Deliberately makes no billable call: it posts a dummy token to the verify
 * route and reads the verdict.
 *
 *   401 -> credentials rejected (wrong/expired token, or token belongs to a
 *          different widget). Nothing will work until this is fixed.
 *   anything else -> the route answered, so the authkey was accepted and the
 *          token itself was simply not valid - which is the expected result here.
 *
 * This exists because "OTP not working" is otherwise indistinguishable from a
 * dozen other causes, and a 401 from this probe names the culprit exactly.
 */
async function checkCredentials() {
  const cfg = config.getConfig();

  if (!cfg.widgetId || !cfg.tokenAuth) {
    return { ok: false, verdict: 'not_configured', detail: 'widgetId or tokenAuth is missing.' };
  }

  const path = (process.env.MSG91_VERIFY_TOKEN_PATH || DEFAULT_VERIFY_PATH)
    .replace('{widgetId}', encodeURIComponent(cfg.widgetId));

  let response;
  try {
    response = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        authkey: cfg.tokenAuth,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ token: 'credential-probe' }),
      signal: AbortSignal.timeout(cfg.requestTimeoutMs),
    });
  } catch {
    return { ok: false, verdict: 'unreachable', detail: 'Could not reach MSG91. Check network/DNS.' };
  }

  let body = null;
  try { body = await response.json(); } catch { body = null; }

  if (response.status === 401) {
    return {
      ok: false,
      verdict: 'credentials_rejected',
      detail: 'MSG91 rejected the auth token (401). Copy a fresh widgetId + auth token from the panel.',
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      verdict: 'endpoint_not_found',
      detail: `MSG91 has no endpoint at ${path}. Update MSG91_VERIFY_TOKEN_PATH.`,
    };
  }

  // The route answered with anything else: the authkey was accepted, the dummy
  // token simply was not valid. That is the healthy outcome.
  return { ok: true, verdict: 'credentials_accepted', detail: 'MSG91 accepted the credentials.' };
}

module.exports = { verifyAccessToken, checkCredentials, DEFAULT_VERIFY_PATH };