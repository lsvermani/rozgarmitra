/**
 * One SMS waiting to be sent by an Android gateway phone.
 *
 * Why the body is encrypted
 * -------------------------
 * The body contains the OTP. The rest of this project is built so a plaintext
 * code never reaches the database (see `services/whatsappOtpService.js`), and
 * storing `"{code} is your OTP"` in clear here would quietly undo that. The body
 * is therefore sealed with AES-256-GCM using a server key, and is only opened at
 * the moment it is handed to the authenticated gateway.
 *
 * The code still crosses the network to the gateway device in plaintext — that
 * is unavoidable when the phone has to read it to compose the SMS. It travels
 * over HTTPS to an authenticated device you own, and the gateway clears it from
 * memory immediately after sending.
 *
 * Delivery is at-most-once per job by default: a lease is taken when a job is
 * claimed, and if the gateway dies mid-send the job is marked `unknown` rather
 * than requeued. Requeueing would risk sending a second OTP to the user after a
 * crash that happened *after* the first SMS already went out.
 */
const mongoose = require('mongoose');

const smsJobSchema = new mongoose.Schema(
  {
    /** Recipient in E.164. */
    to: { type: String, required: true, maxlength: 20 },

    /**
     * AES-256-GCM sealed message body: `v1:<iv>:<tag>:<ciphertext>`.
     * Never selected implicitly - callers must ask for it explicitly.
     */
    bodyCipher: { type: String, required: true, select: false },

    /**
     * queued -> claimed -> sent -> delivered | failed
     * `unknown` means a lease expired without a report, so the true outcome is
     * genuinely not known and must not be guessed at.
     */
    status: {
      type: String,
      enum: ['queued', 'claimed', 'sent', 'delivered', 'failed', 'unknown'],
      default: 'queued',
      index: true,
    },

    /** Where this job came from, e.g. 'registration'. Never the code itself. */
    purpose: { type: String, default: '', maxlength: 40 },

    /** Phone the OTP was issued to, for correlation with the OTP store. */
    forPhone: { type: String, default: '', maxlength: 20 },

    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },

    claimedBy: { type: String, default: '', maxlength: 64 },
    claimedAt: { type: Date, default: null },

    /** Android's own message id, echoed back for troubleshooting. */
    gatewayMessageId: { type: String, default: '', maxlength: 120 },

    /** Carrier / Android failure reason. Never contains the message body. */
    errorCode: { type: String, default: '', maxlength: 80 },
    errorMessage: { type: String, default: '', maxlength: 200 },

    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// The gateway polls for the oldest queued work.
smsJobSchema.index({ status: 1, createdAt: 1 });

// Purges decrypted bodies shortly after they are no longer needed. Delivery
// records are kept by status/counters; only the sealed text expires.
smsJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 6 });

module.exports = mongoose.model('SmsJob', smsJobSchema);