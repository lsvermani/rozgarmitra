/**
 * Provider-neutral OTP delivery.
 *
 * The controller asks this module to deliver a code and gets back a uniform
 * result, whichever transport is configured. That keeps Meta-specific and
 * OTP.dev-specific code out of the controller entirely, so switching provider is
 * a one-line environment change rather than a code change.
 *
 * Every branch still receives an OTP that this application generated and hashed -
 * no provider is trusted to own or verify the code.
 */
const delivery = require('../config/otpDelivery');
const otpdev = require('./otpdevService');
const whatsapp = require('./whatsappService');
const msg91Api = require('./msg91ApiService');
const capcom6 = require('./capcom6Service');
// The same client the Admin Panel flow uses, so worker and job-creator logins
// ride one provider account and one set of credentials.
const startMessaging = require('./startmessagingService');

/** Maps provider error codes onto short, user-facing sentences. */
function deliveryMessage(errorCode) {
  switch (errorCode) {
    case 'service_not_configured':
    case 'service_disabled':
      return 'OTP service is not available right now. Please try again later.';
    case 'network_error':
      return 'OTP service is temporarily unavailable. Please try again later.';
    case 'gateway_offline':
      return 'Our SMS gateway is not responding right now. Please try again shortly.';
    case 'enqueue_failed':
      return 'We could not queue your code. Please try again.';

    // --- StartMessaging ---
    // These arrive from startmessagingService, which classifies the HTTP status
    // and the provider's own body. None of them are the user's fault, and none
    // of them reveal anything about the account - an expired or revoked key
    // says exactly what an unreachable network says.
    case 'not_configured':
    case 'unauthorized':
    case 'bad_credentials':
    case 'invalid_request':
    case 'provider_error':
    case 'timeout':
      return 'OTP service is temporarily unavailable. Please try again later.';
    // Split out from the group above on purpose: the number itself is throttled,
    // so "the service is unavailable" is wrong advice. Observed live as HTTP 400
    // with RATE_LIMIT_EXCEEDED, which is why this is decided from the response
    // body and not the status - see startmessagingService.classifyFailure.
    case 'rate_limited':
      return 'Too many codes requested for this number. Please wait a few minutes and try again.';
    case 'invalid_number':
      return 'This number cannot receive the code. Please check it and try again.';

    // --- Meta WhatsApp Cloud API ---
    case '131026':
      return 'This number is not on the WhatsApp allow-list yet. Please try again later.';
    case '131047':
      return 'We could not deliver the code. Please try again later.';
    case '131056':
      return 'Too many messages were sent to this number. Please try again later.';
    case '131009':
      return 'This number is not a valid WhatsApp recipient.';

    // --- OTP.dev (documented error codes) ---
    case '1136':
      return 'OTP service is not available right now. Please try again later.';
    // MSG91's API also uses 201 for a rejected authkey, unlike the widget's 1136.
    case '201':
      return 'OTP service is not available right now. Please try again later.';
    case '1523':
      return 'This number cannot receive the code. Please check it and try again.';
    // Template problems are our misconfiguration, never the user's fault.
    case '1512':
    case '1513':
    case '1515':
    case '1520':
    case '1521':
      return 'OTP service is temporarily unavailable. Please try again later.';
    case '1620':
    case '1621':
    case '1622':
    case '1623':
    case '1624':
    case '1629':
    case '1631':
    case '1632':
    case '1705':
      // Misconfiguration on our side, never the user's fault - do not say so.
      return 'OTP service is temporarily unavailable. Please try again later.';

    default:
      // An unknown code is never echoed back to a user.
      return 'OTP service is temporarily unavailable. Please try again later.';
  }
}

/** Body text sent to the user's handset. Kept here so all providers match. */
function message(otp) {
  return `Your Rozgarmitra verification code is ${otp}. It expires in 5 minutes. Do not share it with anyone.`;
}

/**
 * Delivers `otp` to `e164` using the configured provider.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string }>}
 */
async function send(e164, otp) {
  const { provider, usable } = delivery.getProviderConfig();

  if (!usable) {
    return { ok: false, errorCode: 'service_not_configured' };
  }

  if (provider === 'startmessaging') {
    // Hosted HTTPS API, E.164 numbers, `{{OTP}}` substituted by the provider.
    // `sendOtp` already normalises the code into the configured template, so
    // the body is not assembled here.
    return startMessaging.sendOtp(e164, otp);
  }

  if (provider === 'otpdev') {
    return otpdev.sendOtp(e164, otp);
  }

  if (provider === 'msg91api') {
    // MSG91 server-side Send OTP. The code is generated and verified by this
    // application, so MSG91 is only the delivery channel.
    return msg91Api.sendOtp(e164, otp);
  }

  if (provider === 'whatsapp') {
    return whatsapp.sendWhatsAppOTP(e164, otp);
  }

  if (provider === 'capcom6') {
    // The app runs an HTTP server on the phone; we POST the message to it.
    return capcom6.sendOtp(e164, message(otp));
  }

  if (provider === 'gateway') {
    // Queue for the Android phone holding the SIM.
    //
    // Note the semantics differ from the other providers: this returns as soon as
    // the job is *queued*, not when the carrier accepted it. Whether the phone
    // actually sent the message is learned later via /sms-gateway/report, and is
    // visible on the admin screen. For an OTP that is the right trade-off - the
    // alternative is holding an HTTP request open for as long as a phone takes
    // to poll, which would time out long before it was useful.
    const { enqueue, hasHealthyDevice } = require('./smsGatewayService');
    if (!(await hasHealthyDevice())) {
      // Nobody is polling. Queuing anyway would tell the user "sent" when the
      // code is sitting in a queue that may never drain.
      return { ok: false, errorCode: 'gateway_offline' };
    }
    try {
      const id = await enqueue({ to: e164, body: message(otp), purpose: 'otp' });
      return { ok: true, messageId: id };
    } catch {
      return { ok: false, errorCode: 'enqueue_failed' };
    }
  }

  // demo: nothing is delivered and nothing is charged. The caller decides
  // whether to expose the code (it does so only outside production).
  return { ok: true, messageId: 'demo' };
}

/** Probes the configured provider's credentials. */
async function testConnection() {
  const { provider, ready } = delivery.getProviderConfig();
  if (provider === 'otpdev') return otpdev.testConnection();
  if (provider === 'startmessaging') return startMessaging.testConnection();
  if (provider === 'capcom6') return capcom6.testConnection();
  if (provider === 'msg91api') return msg91Api.checkCredentials();
  if (provider === 'whatsapp') return whatsapp.testConnection();
  return { ok: ready.demo, provider: 'demo' };
}

module.exports = { send, testConnection, deliveryMessage };
