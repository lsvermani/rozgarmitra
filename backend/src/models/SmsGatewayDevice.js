/**
 * A registered Android gateway phone.
 *
 * One device owns one SIM and therefore one sender number. It authenticates with
 * a per-device bearer token that is only ever stored hashed, so a database dump
 * cannot be replayed against the API.
 */
const mongoose = require('mongoose');

const smsGatewayDeviceSchema = new mongoose.Schema(
  {
    /** Stable client-generated id, used in logs to correlate a device. */
    deviceId: { type: String, required: true, unique: true, maxlength: 64 },

    /** Operator-facing label, e.g. "Ramesh's Pixel". */
    name: { type: String, default: '', maxlength: 80 },

    /**
     * The SIM's own number - what recipients see as the sender.
     * Informational only: it is never used to route anything.
     */
    phoneNumber: { type: String, default: '', maxlength: 20 },

    /** SHA-256 of the bearer token. The token itself is shown once, then gone. */
    tokenHash: { type: String, required: true, select: false },

    /**
     * Switched off without deleting, so an audit trail of its past jobs survives.
     * A disabled device cannot claim new work.
     */
    active: { type: Boolean, default: true },

    /** Last successful poll. Surfaced in the admin view as a health signal. */
    lastSeenAt: { type: Date, default: null },

    /**
     * Reported by the phone's heartbeat.
     *
     * A gateway that has lost its SIM is marked inactive, which stops OTPs
     * being queued to a device that physically cannot send them - rather than
     * the user waiting on a message that was never going to leave the phone.
     */
    health: {
      simStatus: { type: String, enum: ['available', 'unavailable', 'unknown'], default: 'unknown' },
      networkStatus: { type: String, enum: ['connected', 'disconnected', 'unknown'], default: 'unknown' },
      appVersion: { type: String, default: '', maxlength: 40 },
      deviceModel: { type: String, default: '', maxlength: 80 },
    },

    /** Rolling counters, updated when a job reaches a terminal state. */
    stats: {
      claimed: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

smsGatewayDeviceSchema.index({ active: 1, lastSeenAt: -1 });

module.exports = mongoose.model('SmsGatewayDevice', smsGatewayDeviceSchema);