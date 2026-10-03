/**
 * One outstanding Admin Panel OTP for the authorised administrator number.
 *
 * Security properties
 * -------------------
 * - The code is **never stored**. Only `otpHash` (HMAC-SHA256 over a server-side
 *   pepper, see `services/adminOtpService.js`) is persisted, so a database dump
 *   does not hand an attacker a usable admin code. A bare SHA-256 of a six-digit
 *   code is exhaustible in well under a second, which is why the pepper - not
 *   the hash algorithm - is what makes this safe.
 * - `expiresAt` carries a TTL index, so MongoDB removes the document once the
 *   code can no longer be used. No cron, no application timer.
 * - Exactly one live row exists per `phone`: requesting a new code overwrites
 *   the previous one, which satisfies "a new OTP invalidates the previous OTP"
 *   without any extra bookkeeping.
 * - `used` is set on success and `otpHash` is dropped in the same save, so a used
 *   code cannot be replayed from a snapshot taken between verification and expiry.
 *
 * `deliveryStatus` records what the gateway said. Only an error *code* is kept -
 * never a response body, which can echo the message and therefore the code.
 */
const mongoose = require('mongoose');

const adminOtpSchema = new mongoose.Schema(
  {
    /**
     * Bare 10-digit number, e.g. `8699142699`. Matches the `User.mobile` form.
     *
     * No `index: true` here: the unique `{ phone: 1 }` index is declared below
     * with `schema.index()`, and declaring both makes Mongoose warn about a
     * duplicate on every boot.
     */
    phone: {
      type: String,
      required: true,
      match: /^[6-9]\d{9}$/,
    },

    /**
     * HMAC-SHA256 of the code. Plain codes never reach the database.
     *
     * Not `required`: a successful verification clears the digest so the used
     * code cannot be replayed, and a required path would refuse that save.
     * Presence is guaranteed instead by `issue()`, which always writes one, and
     * `check()` treats a missing digest as "cannot verify".
     */
    otpHash: { type: String, default: null, select: false },

    /** Verification failures consumed so far. Reset by a new code. */
    attempts: { type: Number, default: 0 },

    /** Set on success; the row is then useless. */
    used: { type: Boolean, default: false },
    usedAt: { type: Date, default: null },

    expiresAt: { type: Date, required: true },

    /** Drives the resend cooldown and the per-hour abuse limit. */
    lastSentAt: { type: Date, default: Date.now },

    /** 'pending' | 'sent' | 'failed'. */
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending',
    },
    /** Gateway error code only - never the response body (it can echo the OTP). */
    deliveryErrorCode: { type: String, default: '' },
    deliveryMessageId: { type: String, default: '' },
  },
  { timestamps: true },
);

// One live row per phone: a new code replaces the old one outright.
adminOtpSchema.index({ phone: 1 }, { unique: true });

// TTL cleanup. The 600s grace period keeps the row queryable shortly after
// expiry so "OTP has expired" can be reported precisely rather than being
// indistinguishable from "no such OTP".
adminOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 600 });

// Backs the per-number hourly abuse limit.
adminOtpSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AdminOtp', adminOtpSchema);