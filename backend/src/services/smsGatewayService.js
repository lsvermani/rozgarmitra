/**
 * Android SMS gateway service.
 *
 * The phone is an *at-least-once pull* worker: it polls for queued jobs, claims
 * one at a time with a lease, sends it with the system SMS manager, and reports
 * the outcome.
 *
 * The part that matters is the lease. A naive queue will happily re-send a job
 * whose gateway crashed *after* the carrier already accepted the SMS, and the
 * user ends up with two OTPs. So a claimed job whose lease expires becomes
 * `unknown` - never `queued` again. A duplicate OTP is worse than a user asking
 * for a resend.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');

const SmsJob = require('../models/SmsJob');
const config = require('../config/smsGateway');
const SmsGatewayDevice = require('../models/SmsGatewayDevice');

/** A claimed job must be reported within this window. */
const LEASE_SECONDS = 120;

/** How many jobs one poll may return. Small, so the phone drains quickly. */
const MAX_BATCH = 3;

// ---------------------------------------------------------------------------
// Token handling
// ---------------------------------------------------------------------------

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Constant-time comparison so a token cannot be recovered byte by byte. */
function tokenMatches(candidate, expectedHash) {
  const a = Buffer.from(hashToken(candidate), 'utf8');
  const b = Buffer.from(String(expectedHash), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Body encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

/**
 * Key for sealing message bodies.
 *
 * Falls back to a clearly-marked development value so local work is not blocked,
 * but that fallback is refused outright in production - sealing OTPs with a
 * public key would be worse than not storing them at all.
 */
function encryptionKey() {
  const raw = process.env.SMS_GATEWAY_ENC_KEY;
  if (!raw) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      throw new Error('SMS_GATEWAY_ENC_KEY must be set in production.');
    }
    return crypto.createHash('sha256').update('rozgarmitra-dev-sms-gateway-key').digest();
  }
  // Accept hex or any passphrase; both are stretched to 32 bytes.
  return /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : crypto.createHash('sha256').update(raw).digest();
}

function seal(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

function open(sealed) {
  const parts = String(sealed || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed sealed body.');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
// ---------------------------------------------------------------------------
// Device registration
// ---------------------------------------------------------------------------

/**
 * Registers a gateway device and returns its bearer token **once**.
 *
 * The token is stored only as a SHA-256 hash, so it cannot be recovered from the
 * database afterwards. If the device loses it, register again to get a new one.
 */
async function registerDevice({ deviceId, name, phoneNumber }) {
  const token = crypto.randomBytes(32).toString('base64url');
  await SmsGatewayDevice.findOneAndUpdate(
    { deviceId },
    {
      $set: {
        name: String(name || '').slice(0, 80),
        phoneNumber: String(phoneNumber || '').slice(0, 20),
        tokenHash: hashToken(token),
        active: true,
        lastSeenAt: new Date(),
      },
      // Re-registering clears the counters: it is a fresh trust relationship.
      $setOnInsert: { stats: { claimed: 0, sent: 0, delivered: 0, failed: 0 } },
    },
    { upsert: true, new: true },
  );
  return { deviceId, token };
}

/**
 * Resolves a bearer token to its device.
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function authenticateDevice(deviceId, token) {
  if (!deviceId || !token) return null;
  const device = await SmsGatewayDevice.findOne({ deviceId }).select('+tokenHash');
  if (!device) return null;
  if (!tokenMatches(token, device.tokenHash)) return null;
  return device;
}

/**
 * Authenticates against the shared SMS_GATEWAY_ID / SMS_GATEWAY_SECRET pair.
 *
 * Used when the phone has no device token of its own - the single-gateway
 * deployment described in the brief. Rotating it takes every gateway offline
 * at once, which is why the per-device token above is the default path.
 */
async function authenticateShared(deviceId, secret) {
  const cfg = config.getConfig();
  if (!cfg.sharedAuth) return null;
  // Constant-time compare of the presented secret against the configured one.
  if (!tokenMatches(secret || "", hashToken(cfg.sharedSecret))) return null;
  // The presented id must match too, so one holder cannot act as another.
  if (cfg.sharedId && deviceId !== cfg.sharedId) return null;

  return SmsGatewayDevice.findOneAndUpdate(
    { deviceId },
    {
      $set: { active: true, lastSeenAt: new Date() },
      $setOnInsert: {
        name: "shared-secret gateway",
        phoneNumber: cfg.phoneNumber || "",
        tokenHash: hashToken(cfg.sharedSecret),
        stats: { claimed: 0, sent: 0, delivered: 0, failed: 0 },
      },
    },
    { upsert: true, new: true },
  );
}

/**
 * Records a heartbeat: proves the app is alive and carrying a usable SIM.
 *
 * SIM/network status is stored so the admin panel can answer "can this
 * gateway send right now?" without waiting for a job to fail. A gateway that
 * reports no SIM is marked inactive immediately, which stops OTPs being
 * queued to a phone that physically cannot send them.
 */
async function recordHeartbeat(device, { simStatus, networkStatus, appVersion, deviceModel }) {
  const sim = ["available", "unavailable", "unknown"].includes(simStatus) ? simStatus : "unknown";
  const net = ["connected", "disconnected", "unknown"].includes(networkStatus) ? networkStatus : "unknown";

  await SmsGatewayDevice.updateOne(
    { _id: device._id },
    {
      $set: {
        lastSeenAt: new Date(),
        "health.simStatus": sim,
        "health.networkStatus": net,
        "health.appVersion": String(appVersion || "").slice(0, 40),
        "health.deviceModel": String(deviceModel || "").slice(0, 80),
      },
    },
  );

  if (sim === "unavailable" || net === "disconnected") {
    await SmsGatewayDevice.updateOne({ _id: device._id }, { $set: { active: false } });
  } else if (net === "connected" && sim === "available") {
    await SmsGatewayDevice.updateOne({ _id: device._id }, { $set: { active: true } });
  }

  return { ok: true, simStatus: sim, networkStatus: net };
}

/** Health snapshot per device, for the admin view. */
async function deviceHealth() {
  const devices = await SmsGatewayDevice.find({}).lean();
  return devices.map((d) => ({
    deviceId: d.deviceId,
    name: d.name,
    phoneNumber: d.phoneNumber,
    active: d.active,
    lastHeartbeat: d.lastSeenAt,
    simStatus: (d.health && d.health.simStatus) || "unknown",
    networkStatus: (d.health && d.health.networkStatus) || "unknown",
    appVersion: (d.health && d.health.appVersion) || "",
    deviceModel: (d.health && d.health.deviceModel) || "",
    stats: d.stats || {},
  }));
}

// ---------------------------------------------------------------------------
// Queueing
// ---------------------------------------------------------------------------

/** True when at least one active device has checked in recently. */
async function hasHealthyDevice() {
  const cutoff = new Date(Date.now() - 5 * 60 * 1000);
  return (await SmsGatewayDevice.countDocuments({ active: true, lastSeenAt: { $gte: cutoff } })) > 0;
}

/**
 * Queues an SMS for the gateway to send.
 *
 * Returns the job id. The OTP itself is only ever inside the sealed body.
 */
async function enqueue({ to, body, purpose = '', forPhone = '' }) {
  const job = await SmsJob.create({
    to,
    bodyCipher: seal(body),
    purpose: String(purpose).slice(0, 40),
    forPhone: String(forPhone).slice(0, 20),
    status: 'queued',
  });
  return String(job._id);
}

// ---------------------------------------------------------------------------
// Claiming (the lease)
// ---------------------------------------------------------------------------

/**
 * Hands queued jobs to a device, taking a lease on each.
 *
 * `findOneAndUpdate` with `status: 'queued'` is what makes this safe with more
 * than one phone: two devices polling simultaneously cannot both win the same
 * document, because the update is atomic on the filter.
 */
async function claimJobs(device, limit = MAX_BATCH) {
  const take = Math.max(1, Math.min(MAX_BATCH, Number(limit) || MAX_BATCH));
  const jobs = [];

  for (let i = 0; i < take; i += 1) {
    const job = await SmsJob.findOneAndUpdate(
      { status: 'queued' },
      {
        $set: {
          status: 'claimed',
          claimedBy: device.deviceId,
          claimedAt: new Date(),
        },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    ).select('+bodyCipher');

    if (!job) break;

    let body;
    try {
      body = open(job.bodyCipher);
    } catch {
      // A body that will not decrypt is unusable; fail it rather than looping.
      await SmsJob.updateOne(
        { _id: job._id },
        { $set: { status: 'failed', errorCode: 'decrypt_failed', completedAt: new Date() } },
      );
      continue;
    }

    jobs.push({
      id: String(job._id),
      to: job.to,
      body,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
    });
  }

  if (jobs.length) {
    await SmsGatewayDevice.updateOne(
      { _id: device._id },
      { $set: { lastSeenAt: new Date() }, $inc: { 'stats.claimed': jobs.length } },
    );
  } else {
    await SmsGatewayDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date() } });
  }

  return jobs;
}

/**
 * Records what the phone actually did.
 *
 * @param {'sent'|'delivered'|'failed'} status
 */
async function reportResult(device, { jobId, status, gatewayMessageId, errorCode, errorMessage }) {
  const job = await SmsJob.findOne({ _id: jobId, claimedBy: device.deviceId });
  // A report for a job this device does not own is ignored rather than trusted.
  if (!job) return { ok: false, reason: 'Unknown or unclaimed job.' };

  const now = new Date();
  const terminal = ['sent', 'delivered', 'failed'];

  if (!terminal.includes(status)) {
    return { ok: false, reason: 'Unsupported status.' };
  }

  job.status = status;
  job.gatewayMessageId = String(gatewayMessageId || '').slice(0, 120);
  job.errorCode = String(errorCode || '').slice(0, 80);
  job.errorMessage = String(errorMessage || '').slice(0, 200);
  job.completedAt = now;
  await job.save();

  const field = status === 'delivered' ? 'delivered' : status;
  await SmsGatewayDevice.updateOne({ _id: device._id }, { $inc: { [`stats.${field}`]: 1 } });

  return { ok: true, status };
}

/**
 * Sweeps jobs whose lease expired without a report.
 *
 * These become `unknown`, never `queued`. If the SMS actually went out, the user
 * has a valid OTP; if it did not, they simply request another. Either way the
 * safe outcome is to not send a duplicate automatically.
 */
async function sweepExpiredLeases() {
  const cutoff = new Date(Date.now() - LEASE_SECONDS * 1000);
  const result = await SmsJob.updateMany(
    { status: 'claimed', claimedAt: { $lte: cutoff } },
    { $set: { status: 'unknown', errorCode: 'lease_expired', completedAt: new Date() } },
  );
  return result.modifiedCount || 0;
}

/** Counts for the admin view. Never includes message bodies. */
async function stats() {
  const [queued, claimed, sent, delivered, failed, unknown, devices] = await Promise.all([
    SmsJob.countDocuments({ status: 'queued' }),
    SmsJob.countDocuments({ status: 'claimed' }),
    SmsJob.countDocuments({ status: 'sent' }),
    SmsJob.countDocuments({ status: 'delivered' }),
    SmsJob.countDocuments({ status: 'failed' }),
    SmsJob.countDocuments({ status: 'unknown' }),
    SmsGatewayDevice.countDocuments({ active: true }),
  ]);
  return { queued, claimed, sent, delivered, failed, unknown, devices };
}

module.exports = {
  registerDevice,
  authenticateShared,
  recordHeartbeat,
  deviceHealth,
  authenticateDevice,
  enqueue,
  claimJobs,
  reportResult,
  sweepExpiredLeases,
  hasHealthyDevice,
  stats,
  seal,
  open,
  hashToken,
  tokenMatches,
  LEASE_SECONDS,
  MAX_BATCH,
};

