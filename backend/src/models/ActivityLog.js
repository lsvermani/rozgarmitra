const mongoose = require('mongoose');

/**
 * Central audit trail for every administrative action (§14).
 *
 * Deliberately stores only non-sensitive data. Passwords, tokens, OTPs, JWT
 * secrets and MongoDB connection strings never reach this collection: every
 * value passes through `utils/redact.js` inside `services/auditService.js`
 * before it is persisted, and secret-looking keys are replaced with
 * `[redacted]`.
 *
 * This complements — and does not replace — the narrower `ConfigAuditLog`
 * model, which records Android-side server-address changes.
 */
const activityLogSchema = new mongoose.Schema(
  {
    // Who acted. `userId` is null only for system/bootstrapping entries.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: '', maxlength: 120 },
    role: { type: String, default: 'unknown', maxlength: 40 },

    // What happened: 'worker.block', 'settings.update', 'database.test' ...
    action: { type: String, required: true, maxlength: 80, index: true },
    // Coarse grouping for the Activity Logs screen: users / jobs / profiles ...
    module: { type: String, required: true, maxlength: 40, index: true },
    // The affected record, when there is one.
    recordId: { type: String, default: '', maxlength: 64 },
    recordLabel: { type: String, default: '', maxlength: 200 },

    // Only the fields that changed, each already redacted.
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },

    // ---- Sign-in / sign-out specifics (§Activity logs page) ----------------
    // Narrower than `module`: 'sign_in' | 'sign_out' | 'live_location' ...
    // Drives the "type" dropdown without having to parse `action`.
    event: { type: String, default: '', maxlength: 40, index: true },

    // The user's saved profile place at the moment of the event.
    location: {
      address: { type: String, default: '' },
      locality: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },

    // Coordinates reported by the device at the time of the event, when the
    // client volunteered them. Deliberately separate from `location`: a profile
    // place is entered by hand, this one is machine-observed.
    //
    // `precision` records how the point was obtained - 'gps' for a real device
    // fix, 'city' for one geolocated from an IP address. Without it an
    // administrator cannot tell a genuine position from a city-level guess.
    liveLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
      precision: { type: String, enum: ['gps', 'city'], default: null },
      // The place those coordinates fall in, resolved at the same moment.
      // Bare coordinates are close to useless to an administrator scanning the
      // trail, so the city/state/country travel with the point. Empty means the
      // geocoder could not name the place - never a stand-in name.
      city: { type: String, default: '', maxlength: 120 },
      state: { type: String, default: '', maxlength: 120 },
      country: { type: String, default: '', maxlength: 120 },
      capturedAt: { type: Date, default: null },
    },

    // Rough device/browser description, e.g. 'Chrome · Windows'.
    platform: { type: String, default: '', maxlength: 80 },

    // Seconds between this sign-in and its matching sign-out (filled in on logout).
    sessionSeconds: { type: Number, default: null },

    ip: { type: String, default: '', maxlength: 64 },
    userAgent: { type: String, default: '', maxlength: 300 },
    // 'success' | 'denied' | 'error'
    result: {
      type: String,
      enum: ['success', 'denied', 'error'],
      default: 'success',
      index: true,
    },
    message: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// Default listing: newest first, which is what the admin table renders.
activityLogSchema.index({ createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
// Backs the Activity Logs page: filter by type/role then page through time.
activityLogSchema.index({ event: 1, createdAt: -1 });
activityLogSchema.index({ role: 1, createdAt: -1 });
activityLogSchema.index({ result: 1, createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
