/**
 * OTP Service
 * ------------
 * Demo mode (APP_MODE=demo): generates/accepts a fixed DEMO_OTP so the app can
 * be shown without any paid SMS provider. The OTP is also logged to the server
 * console so testers can see it.
 *
 * Production: swap `sendSms` for a real provider (MSG91 / Twilio / Firebase).
 * The rest of the auth flow (generate -> store hashed/plain OTP + expiry ->
 * verify -> issue JWT) stays identical, so switching providers later is a
 * one-file change.
 */

const isDemoMode = () => (process.env.APP_MODE || 'demo') === 'demo';

const delivery = require('../config/otpDelivery');
const deliveryService = require('./otpDeliveryService');

function generateOtp() {
  if (isDemoMode()) {
    return process.env.DEMO_OTP || '123456';
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Sends the OTP through whichever provider `OTP_PROVIDER` selects.
 *
 * Delegates to `otpDeliveryService` rather than keeping its own switch, so the
 * original `/api/auth/send-otp` and the newer `/api/auth/whatsapp/send-otp` share
 * one code path. Before this, the legacy `SMS_PROVIDER` switch here meant the
 * canonical endpoint silently ignored the Android-SIM gateway - the single most
 * likely way for this feature to look broken when it was working fine.
 *
 * Demo mode is still honoured first: it is what makes the existing test suites
 * and the seeded demo logins work with no provider configured at all.
 */
async function sendSms(mobile, otp) {
  if (isDemoMode()) {
    console.log(`[DEMO OTP] Mobile: ${mobile} | OTP: ${otp} (auto-accepted in demo mode)`);
    return { success: true, provider: 'demo' };
  }

  const { normalisePhone } = require('../utils/phone');
  const phone = normalisePhone(mobile);

  if (!phone.ok) {
    return { success: false, errorCode: 'invalid_number' };
  }

  const result = await deliveryService.send(phone.e164, otp);
  return { success: Boolean(result.ok), provider: delivery.getProviderConfig().provider, ...result };
}

function getOtpExpiry() {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || '5', 10);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function verifyOtp(user, submittedOtp) {
  if (isDemoMode() && submittedOtp === (process.env.DEMO_OTP || '123456')) {
    return true; // demo shortcut always works
  }
  if (!user.otpCode || !user.otpExpiresAt) return false;
  if (new Date() > user.otpExpiresAt) return false;
  return user.otpCode === submittedOtp;
}

module.exports = { isDemoMode, generateOtp, sendSms, getOtpExpiry, verifyOtp };

