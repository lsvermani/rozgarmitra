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

function generateOtp() {
  if (isDemoMode()) {
    return process.env.DEMO_OTP || '123456';
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Sends the OTP via SMS. In demo mode this just logs to console.
 * In production mode, plug in MSG91/Twilio/Firebase here.
 */
async function sendSms(mobile, otp) {
  if (isDemoMode()) {
    console.log(`[DEMO OTP] Mobile: ${mobile} | OTP: ${otp} (auto-accepted in demo mode)`);
    return { success: true, provider: 'demo' };
  }

  const provider = process.env.SMS_PROVIDER;
  switch (provider) {
    case 'msg91':
      // TODO: integrate MSG91 SDK/API using MSG91_API_KEY, MSG91_SENDER_ID
      throw new Error('MSG91 integration not configured yet.');
    case 'twilio':
      // TODO: integrate Twilio using TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
      throw new Error('Twilio integration not configured yet.');
    case 'firebase':
      // TODO: integrate Firebase Phone Auth verification flow
      throw new Error('Firebase integration not configured yet.');
    default:
      throw new Error('No SMS provider configured. Set APP_MODE=demo for development.');
  }
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
