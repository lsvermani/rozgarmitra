/**
 * Delivery transport for the Admin Panel OTP.
 *
 * Chooses between the two channels this project supports, so the controller
 * never has to know which one is configured:
 *
 *   startmessaging  hosted HTTPS API. No handset, no LAN, works anywhere.
 *   capcom6         the Android SMS Gateway app on a phone holding the SIM.
 *   gateway         the pull-based Flutter gateway already in the repo.
 *
 * Selected with `ADMIN_OTP_PROVIDER`. Whichever is chosen, the OTP itself is
 * generated, hashed and verified here - a provider is only ever a pipe.
 *
 * Every branch returns the same shape, and no branch ever returns a raw
 * provider error, so the controller cannot accidentally leak one.
 */
const startMessaging = require('./startmessagingService');
const smsGateway = require('./smsGatewayAdminService');
const config = require('../config/adminOtp');

/** Transports the admin flow understands. */
const ADMIN_SMS_PROVIDERS = Object.freeze(['startmessaging', 'capcom6', 'gateway']);

/** Which transport is selected. Falls back to `startmessaging`. */
function provider() {
  const requested = String(process.env.ADMIN_OTP_PROVIDER || '').toLowerCase();
  return ADMIN_SMS_PROVIDERS.includes(requested) ? requested : 'startmessaging';
}

/**
 * Sends `otp` to `e164`.
 *
 * @returns {Promise<{ ok: boolean, messageId?: string, errorCode?: string, message?: string }>}
 */
async function sendOtpToAdmin(e164, otp) {
  switch (provider()) {
    case 'capcom6':
      return smsGateway.sendOtpToAdmin(e164, otp);

    case 'gateway': {
      // Queues for the pull-based Flutter gateway already in this repo. Its
      // semantics differ: this returns once the job is *queued*, not once the
      // carrier accepted it.
      const { enqueue, hasHealthyDevice } = require('./smsGatewayService');
      if (!(await hasHealthyDevice())) {
        return {
          ok: false,
          errorCode: 'gateway_offline',
          message: 'Our SMS gateway is not responding right now. Please try again shortly.',
        };
      }
      try {
        const id = await enqueue({ to: e164, body: config.renderMessage(otp), purpose: 'admin_otp' });
        return { ok: true, messageId: id };
      } catch {
        return {
          ok: false,
          errorCode: 'enqueue_failed',
          message: 'Unable to send OTP. Please try again.',
        };
      }
    }

    default:
      return startMessaging.sendOtp(e164, otp);
  }
}

/** Admin-facing summary. Never includes a credential. */
function toSafeSummary() {
  return {
    provider: provider(),
    startmessaging: require('../config/startmessaging').toSafeSummary(),
    capcom6: require('../config/capcom6').toSafeSummary(),
  };
}

module.exports = { sendOtpToAdmin, provider, toSafeSummary, ADMIN_SMS_PROVIDERS };