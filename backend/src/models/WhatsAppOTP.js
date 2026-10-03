/**
 * One outstanding WhatsApp OTP for one phone number.
 *
 * Design notes
 * ------------
 * - The code is **never stored**. Only `otpHash` (HMAC-SHA256, see
 *   services/whatsappOtpService.js) is persisted, so a database dump does not
 *   hand an attacker the codes. Verification recomputes the hash and compares in
 *   constant time.
 * - `expiresAt` carries a TTL index, so MongoDB deletes the document once the
 *   code can no longer be used. Cleanup needs no cron and no application timer.
 * - Exactly one live row is kept per (phone, purpose): requesting a new code
 *   overwrites the previous one, which both matches "the newest code wins" and
 *   stops a stale code remaining usable alongside a fresh one.
 *
 * `deliveryStatus` records what the WhatsApp API said. Only the provider's
 * error *code* is kept - never the response body, which can echo the message
 * body and therefore the OTP.
 */
const mongoose = require('mongoose');

const whatsappOtpSchema = new mongoose.Schema(
  {
    /** E.164, e.g. `+918699142699` - the form the Cloud API expects. */
    phone: {
      type: String,
      required: true,
      match: /^\+[1-9]\d{7,14}$/,
      index: true,
    },

    /**
     * The bare 10-digit Indian number, when there is one. Lets the auth flow
     * resolve the matching `User` document without re-deriving it.
     */
    national: { type: String, default: '' },

    /**
     * HMAC-SHA256 of the code. Plain codes never reach the database.
     *
     * Not `required`: on a successful verification the digest is cleared so the
     * used code cannot be replayed from a database snapshot taken before expiry,
     * and a required path would refuse that save. Presence is guaranteed instead
     * by `issue()`, which always writes one, and `check()` treats a missing
     * digest as "cannot verify".
     */
    otpHash: { type: String, default: null, select: false },

    /** What the code authorises: 'registration' | 'login' | 'phone_change'. */
    purpose: {
      type: String,
      enum: ['registration', 'login', 'phone_change'],
      default: 'registration',
    },

    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },

    /** Drives the resend cooldown and the per-hour abuse limit. */
    lastSentAt: { type: Date, default: Date.now },

    /** 'pending' | 'sent' | 'failed'. */
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    /** Provider error code only - never the response body (it can echo the OTP). */
    deliveryErrorCode: { type: String, default: '' },
    deliveryMessageId: { type: String, default: '' },
  },
  { timestamps: true },
);

// One live row per (phone, purpose): a new code replaces the old one outright.
whatsappOtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

// TTL cleanup. MongoDB removes the document at `expiresAt`. `expireAfterSeconds: 0`
// means "expire when this timestamp has passed". The grace period keeps the row
// queryable briefly after expiry so "OTP has expired" can be reported precisely
// rather than looking like "no such OTP".
whatsappOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

// Backs the per-number hourly abuse limit.
whatsappOtpSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WhatsAppOTP', whatsappOtpSchema);