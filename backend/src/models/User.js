const mongoose = require('mongoose');

/**
 * Moderation sub-document for a user profile (§9).
 *
 * Stored **on the existing `users` collection** rather than in a separate
 * `profiles` collection, so all 17 existing users keep working and no profile
 * data is duplicated. Mongoose treats a single-nested sub-document as optional
 * by default, which is what makes this safe to add to a populated collection:
 * documents without one simply report `undefined` rather than failing to load.
 */
const profileSchema = new mongoose.Schema(
  {
    // Generated / Pending / Approved / Rejected
    status: {
      type: String,
      enum: ['generated', 'pending', 'approved', 'rejected'],
      default: 'pending',
    },
    headline: { type: String, default: '', maxlength: 160 },
    about: { type: String, default: '', maxlength: 2000 },
    // Free-form key/value pairs for fields that are specific to a business.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Who moderated it, and why it was rejected.
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', maxlength: 500 },
  },
  { _id: false, timestamps: true }
);

const locationSchema = new mongoose.Schema(
  {
    address: { type: String, default: '' },
    locality: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    mobile: {
      type: String,
      required: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'],
    },
    role: {
      type: String,
      enum: ['worker', 'job_creator', 'admin'],
      required: true,
    },
    businessName: { type: String, default: '' }, // for job_creator
    profilePhoto: { type: String, default: '' },
    language: { type: String, enum: ['en', 'hi', 'pa'], default: 'en' },

    // Worker-specific
    skills: [{ type: String }],
    categories: [{ type: String }],
    experienceYears: { type: Number, default: 0 },
    availability: {
      type: [String], // e.g. ['Mon','Tue','Wed']
      default: [],
    },

    location: { type: locationSchema, default: () => ({}) },

    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    totalJobs: { type: Number, default: 0 },
    completedJobs: { type: Number, default: 0 },

    verified: { type: Boolean, default: false },
    blocked: { type: Boolean, default: false },

    // --- Admin panel additions (all nullable/optional, so every existing
    // --- document is unaffected and no migration is required). ---

    // Moderation state for the Profile Management module (§9).
    profile: { type: profileSchema, default: undefined },

    // Admin login. Workers and job creators continue to authenticate with
    // phone + OTP; only admins get a password (§24). `passwordHash` is
    // `select: false` so it can never leak through an ordinary query.
    //
    // `default: undefined` is deliberate. With `default: ''` every document
    // created through OTP registration would persist an empty string, and the
    // unique sparse index below would then reject the second registration
    // ("Duplicate value for field: email"). Leaving the field absent keeps it
    // out of the sparse index entirely.
    email: { type: String, default: undefined, lowercase: true, trim: true, maxlength: 160 },
    passwordHash: { type: String, default: '', select: false },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: '', maxlength: 64 },
    // Set by POST /auth/logout so the Activity Logs page can pair sessions.
    lastLogoutAt: { type: Date, default: null },

    // Drives the "Active / Inactive worker" dashboard cards (§4). Written by
    // `protect`, so it reflects real API activity rather than a guess.
    lastActiveAt: { type: Date, default: null },

    // OTP fields (mock/dev auth)
    otpCode: { type: String, select: false },

    /**
     * HMAC-SHA256 of the current OTP, bound to `mobile`.
     *
     * This is what new codes are stored as. `otpCode` above is the legacy
     * plaintext column, kept only so a code issued by an older build can still
     * be redeemed after a deploy; every newly issued code clears it. Plaintext
     * storage meant a database dump handed out every live login code.
     *
     * `select: false` so it never rides along on an ordinary user query - only
     * the verification path asks for it explicitly.
     */
    otpHash: { type: String, default: null, select: false },

    /**
     * Wrong guesses spent against the current code. Reset whenever a new code
     * is issued. Without it a six-digit code was brute-forceable in roughly a
     * million tries.
     */
    otpAttempts: { type: Number, default: 0, select: false },

    /** Drives the resend cooldown for this number. */
    otpLastSentAt: { type: Date, default: null, select: false },

    /**
     * Which transport actually delivered the current code, e.g. 'startmessaging'.
     *
     * Recorded so the OTP Verification Log can say "this arrived by StartMessaging"
     * rather than a hardcoded 'sms'. Cleared with the code, so it always describes
     * the code the row is about.
     */
    otpChannel: { type: String, default: '', select: false },
    otpExpiresAt: { type: Date, select: false },

    // WhatsApp phone verification (§ WhatsApp OTP).
    //
    // `phoneVerified` is only ever set to true by
    // POST /auth/whatsapp/verify-otp *after* a correct code has been checked.
    // Requesting a code deliberately does not set it, so an unverified account
    // can never be distinguished from a verified one by its own request.
    //
    // Defaults to false so it is never silently true for an account created
    // through the older SMS path.
    phoneVerified: { type: Boolean, default: false },
    phoneVerifiedAt: { type: Date, default: null },
    /** Which channel verified the number: 'whatsapp' | 'sms' | 'firebase'. */
    phoneVerifiedVia: { type: String, enum: ['whatsapp', 'sms', 'firebase'], default: null },
  },
  { timestamps: true }
);

userSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
userSchema.index({ role: 1 });
userSchema.index({ mobile: 1, role: 1 }, { unique: true });
// Sparse: most users have no email at all, so a plain unique index would
// collide. Combined with `default: undefined` on the field, documents without
// an email are simply absent from the index.
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ 'profile.status': 1 });
userSchema.index({ role: 1, blocked: 1, verified: 1 });

module.exports = mongoose.model('User', userSchema);
