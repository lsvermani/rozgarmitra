const mongoose = require('mongoose');

/**
 * Server-side audit trail for API address / environment changes made by an
 * administrator from the Android app (Server / Admin Settings).
 *
 * Deliberately stores only non-sensitive data. Tokens, OTPs, passwords, JWT
 * secrets and MongoDB connection strings are never accepted by the controller
 * that writes here.
 */
const configAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['save', 'test', 'reset', 'restore', 'unlock', 'denied'],
      required: true,
    },
    // Non-sensitive label, e.g. "admin-otp:******9999" or "device-admin".
    actor: { type: String, required: true, maxlength: 120 },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Redacted, human-readable description (URLs have credentials stripped).
    summary: { type: String, required: true, maxlength: 500 },
    environment: {
      type: String,
      enum: ['development', 'testing', 'production', 'unknown'],
      default: 'unknown',
    },
    // Origin the device switched to, with any credentials stripped out.
    apiBaseUrl: { type: String, default: '', maxlength: 300 },
    // "android" | "web" | "unknown"
    platform: { type: String, default: 'unknown', maxlength: 40 },
    // App/build version reported by the client (e.g. "1.1.0+2").
    appVersion: { type: String, default: '', maxlength: 40 },
  },
  { timestamps: true }
);

configAuditLogSchema.index({ createdAt: -1 });
configAuditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('ConfigAuditLog', configAuditLogSchema);
