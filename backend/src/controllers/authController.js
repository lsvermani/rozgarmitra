const User = require('../models/User');
const otpService = require('../services/otpService');
const { signToken } = require('../utils/token');
const admin = require('firebase-admin');

function getFirebaseAuth() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      throw new Error('Firebase authentication is not configured on the server.');
    }
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
  }
  return admin.auth();
}

// POST /api/auth/send-otp
// body: { mobile, role }  role required only on first registration
async function sendOtp(req, res, next) {
  try {
    const { mobile, role, name } = req.body;

    const lookup = role ? { mobile, role } : { mobile };
    let user = await User.findOne(lookup);

    if (!user) {
      if (!role || !['worker', 'job_creator'].includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'New number detected. Please provide role: "worker" or "job_creator".',
        });
      }
      user = await User.create({ mobile, role, ...(name ? { name: name.trim() } : {}) });
    }

    if (name) user.name = name.trim();
    const otp = otpService.generateOtp();
    user.otpCode = otp;
    user.otpExpiresAt = otpService.getOtpExpiry();
    await user.save();

    await otpService.sendSms(mobile, otp);

    const payload = {
      success: true,
      message: 'OTP sent successfully.',
      isNewUser: !user.name,
    };

    // Only ever expose the OTP in the API response when running in demo mode,
    // so the frontend can auto-fill it for easy demos. Never do this in production.
    if (otpService.isDemoMode()) {
      payload.demoOtp = otp;
    }

    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/verify-otp
// body: { mobile, otp }
async function verifyOtp(req, res, next) {
  try {
    const { mobile, otp, role, name } = req.body;

    const user = await User.findOne(role ? { mobile, role } : { mobile }).select('+otpCode +otpExpiresAt');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found. Please send OTP first.' });
    }
    if (user.blocked) {
      return res.status(403).json({ success: false, message: 'This account has been blocked.' });
    }

    const valid = otpService.verifyOtp(user, otp);
    if (!valid) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
    }

    user.otpCode = undefined;
    user.otpExpiresAt = undefined;
    if (name) user.name = name.trim();
    await user.save();

    const token = signToken(user);

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      token,
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        profileComplete: Boolean(user.name),
        language: user.language,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function firebaseAuth(req, res, next) {
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(req.body.idToken);
    const mobile = decoded.phone_number?.replace(/^\+91/, '');
    if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'A valid Indian phone number is required.' });
    }

    let user = await User.findOne(req.body.role ? { mobile, role: req.body.role } : { mobile });
    if (!user) {
      if (!req.body.role) {
        return res.status(400).json({ success: false, message: 'New number detected. Please provide a role.' });
      }
      user = await User.create({ mobile, role: req.body.role });
    }
    if (user.blocked) return res.status(403).json({ success: false, message: 'This account has been blocked.' });

    res.json({
      success: true,
      token: signToken(user),
      user: {
        id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        profileComplete: Boolean(user.name),
        language: user.language,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { sendOtp, verifyOtp, firebaseAuth };
