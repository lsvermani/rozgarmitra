const mongoose = require('mongoose');

/**
 * One OTP verification attempt, for any role.
 *
 * Why a separate collection rather than reusing `ActivityLog`
 * -------------------------------------------------------
 * `ActivityLog` answers "what did an administrator do?". This answers a narrower
 * and much more security-relevant question: **who proved possession of a phone
 * number, when, and did it succeed?** That spans every sign-in path - worker,
 * job creator and admin - so it cannot live inside the admin-only trail, and it
 * needs columns (channel, outcome reason, attempts consumed) that would only bloat
 * the general log.
 *
 * Privacy, deliberately enforced
 * ------------------------------
 * - The code itself is **never** stored. Not plaintext, not hashed - the point
 *   of a verification record is the audit, and keeping a copy of the secret would
 *   defeat the reason the admin flow hashes it in the first place.
 * - The phone number is stored **masked** (`+918699****2699`). An audit trail is
 *   read by people who are not the account holder; the full number lives on the
 *   `User` document, which is access-controlled, and `userId` links the two.
 * - IP and user agent are kept because "from where" is the question an
 *   investigation actually asks, and both are already stored by `ActivityLog`.
 */
const otpVerificationSchema = new mongoose.Schema(
  {
    /** Who verified. Null for an attempt against a number with no account. */
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '', maxlength: 120 },

    /** 'worker' | 'job_creator' | 'admin' | 'super_admin' | 'unknown'. */
    role: { type: String, default: 'unknown', maxlength: 40, index: true },

    /** Masked, e.g. `+918699****2699`. Never the full number. */
    phoneMasked: { type: String, default: '', maxlength: 32 },

    /** Which transport delivered the code: 'sms' | 'whatsapp' | 'startmessaging' | 'capcom6'. */
    channel: { type: String, default: 'sms', maxlength: 40, index: true },

    /** Why the code was wanted: 'login' | 'registration' | 'phone_change'. */
    purpose: { type: String, default: 'login', maxlength: 40, index: true },

    /** 'success' | 'failed'. A wrong guess is as interesting as a good one. */
    outcome: {
      type: String,
      enum: ['success', 'failed'],
      required: true,
      index: true,
    },

    /**
     * Machine-readable reason for a failure: invalid_otp, otp_expired,
     * too_many_attempts, no_otp, otp_used, unauthorized, blocked...
     * Empty on success.
     */
    reason: { type: String, default: '', maxlength: 60, index: true },

    /** How many wrong guesses had already been spent on this code. */
    attemptsUsed: { type: Number, default: null },

    /** Coarse device/browser label, e.g. 'Chrome · Windows'. */
    platform: { type: String, default: '', maxlength: 80 },

    ip: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },

    /** Exactly when the verification was attempted. */
    verifiedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

// Default listing: newest first, which is what the admin table renders.
otpVerificationSchema.index({ verifiedAt: -1 });
otpVerificationSchema.index({ role: 1, verifiedAt: -1 });
otpVerificationSchema.index({ outcome: 1, verifiedAt: -1 });
otpVerificationSchema.index({ channel: 1, verifiedAt: -1 });

module.exports = mongoose.model('OtpVerification', otpVerificationSchema);