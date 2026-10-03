/**
 * Android SMS gateway test.
 *
 * Exercises the queue, the device token auth, and - most importantly - the lease
 * behaviour that prevents a crashed gateway from sending a duplicate OTP.
 *
 *   SMS_GATEWAY_TEST=1 node scripts/sms-gateway-test.js
 */
require('dotenv').config();

const mongoose = require('mongoose');

const BASE = `http://localhost:${process.env.PORT || 5000}/api`;
const DEVICE_ID = 'test-device-0001';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` ${detail}` : ''}`);
  }
}

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, raw: text };
}

const section = (t) => console.log(`\n=== ${t} ===`);
(async () => {
  console.log('Android SMS gateway test');
  console.log(`target: ${BASE}\n`);

  const SmsJob = require('../src/models/SmsJob');
  const Device = require('../src/models/SmsGatewayDevice');
  const gateway = require('../src/services/smsGatewayService');
  await mongoose.connect(process.env.MONGO_URI);
  await SmsJob.deleteMany({});
  await Device.deleteMany({ deviceId: DEVICE_ID });

  section('A. Device registration and token auth');
  const bad = await call('POST', '/sms-gateway/register', { deviceId: 'no' });
  check('short deviceId rejected', bad.status === 400, String(bad.status));

  const reg = await call('POST', '/sms-gateway/register', { deviceId: DEVICE_ID, name: 'Test Phone', phoneNumber: '918699142699' });
  check('register 200', reg.status === 200, String(reg.status));
  check('a token is issued', typeof reg.body.token === 'string' && reg.body.token.length > 20);

  const token = reg.body.token;
  const auth = { Authorization: `Bearer ${token}`, 'X-Device-Id': DEVICE_ID };

  const anonPoll = await call('POST', '/sms-gateway/poll', {});
  check('poll without token refused 401', anonPoll.status === 401, String(anonPoll.status));
  const wrongTok = await call('POST', '/sms-gateway/poll', {}, { Authorization: 'Bearer wrong', 'X-Device-Id': DEVICE_ID });
  check('poll with wrong token refused 401', wrongTok.status === 401, String(wrongTok.status));
  const wrongDev = await call('POST', '/sms-gateway/poll', {}, { Authorization: `Bearer ${token}`, 'X-Device-Id': 'other-device' });
  check('token for another device refused', wrongDev.status === 401, String(wrongDev.status));

  const stored = await Device.findOne({ deviceId: DEVICE_ID }).select('+tokenHash');
  check('token is stored hashed, never in clear', stored.tokenHash !== token);
  check('stored hash is sha256 hex', /^[0-9a-f]{64}$/.test(stored.tokenHash));

  section('B. Queueing and claiming');
  const plain = 'Your Rozgarmitra verification code is 483921. Do not share it.';
  const jobId = await gateway.enqueue({ to: '+918699142699', body: plain, purpose: 'otp', forPhone: '918699142699' });

  const raw = await mongoose.connection.db.collection('smsjobs').findOne({ _id: new mongoose.Types.ObjectId(jobId) });
  check('body is NOT stored in clear text', !JSON.stringify(raw).includes('483921'));
  check('body is sealed', /^v1:/.test(raw.bodyCipher || ''));

  const poll = await call('POST', '/sms-gateway/poll', { limit: 3 }, auth);
  check('poll 200', poll.status === 200, String(poll.status));
  check('job was claimed', poll.body.jobs.length === 1, JSON.stringify(poll.body.jobs.length));
  check('claimed job carries the decrypted body', poll.body.jobs[0].body === plain, poll.body.jobs[0].body);
  check('claimed job has the recipient', poll.body.jobs[0].to === '+918699142699');
  check('a backoff hint is returned', typeof poll.body.pollAfterSeconds === 'number');

  const poll2 = await call('POST', '/sms-gateway/poll', {}, auth);
  check('same job is not handed out twice', poll2.body.jobs.length === 0, String(poll2.body.jobs.length));

  section('C. Reporting outcomes');
  const claimedId = poll.body.jobs[0].id;
  const good = await call('POST', '/sms-gateway/report', { jobId: claimedId, status: 'sent', gatewayMessageId: 'android-123' }, auth);
  check('report sent 200', good.status === 200, String(good.status));

  const storedJob = await SmsJob.findById(claimedId);
  check('status persisted', storedJob.status === 'sent', storedJob.status);
  check('android message id persisted', storedJob.gatewayMessageId === 'android-123');

  const delivered = await call('POST', '/sms-gateway/report', { jobId: claimedId, status: 'delivered' }, auth);
  check('can escalate to delivered', delivered.status === 200 && (await SmsJob.findById(claimedId)).status === 'delivered');

  const bogus = await call('POST', '/sms-gateway/report', { jobId: claimedId, status: 'exploded' }, auth);
  check('unknown status refused', bogus.status === 400, String(bogus.status));

  const foreign = await call('POST', '/sms-gateway/report', { jobId: claimedId, status: 'failed' }, { Authorization: 'Bearer wrong', 'X-Device-Id': DEVICE_ID });
  check('report with bad token refused', foreign.status === 401, String(foreign.status));

  section('D. Lease expiry prevents duplicate OTPs');
  const dupId = await gateway.enqueue({ to: '+918699142699', body: plain, purpose: 'otp', forPhone: '9990000001' });
  await call('POST', '/sms-gateway/poll', {}, auth);
  // Simulate the phone crashing after claiming: backdate the lease.
  await SmsJob.updateOne({ _id: new mongoose.Types.ObjectId(dupId) }, { $set: { claimedAt: new Date(Date.now() - 999999) } });

  const swept = await gateway.sweepExpiredLeases();
  check('expired lease swept', swept >= 1, String(swept));
  const stuck = await SmsJob.findById(dupId);
  check('stale job marked unknown, NOT requeued', stuck.status === 'unknown', stuck.status);

  const after = await call('POST', '/sms-gateway/poll', {}, auth);
  check('stale job is not handed out again', !after.body.jobs.some((j) => j.id === dupId));

  section('E. Encryption round-trip');
  const sealed = gateway.seal('secret 123456');
  check('sealed round-trips', gateway.open(sealed) === 'secret 123456');
  check('tampered ciphertext is rejected', (() => {
    // Flip a char in the MIDDLE: the final base64 char carries padding bits, so
    // changing it can leave the decoded bytes identical and the tamper undetected.
    const parts = sealed.split(':');
    parts[3] = parts[3].slice(0, 4) + (parts[3][4] === 'A' ? 'B' : 'A') + parts[3].slice(5);
    try { gateway.open(parts.join(':')); return false; } catch { return true; }
  })());
  check('different ciphertext each time', gateway.seal('same') !== gateway.seal('same'));

  section('F. Health and admin surface');
  const h = await call('GET', '/sms-gateway/health');
  check('health 200', h.status === 200, String(h.status));
  check('health reveals no config', !h.raw.includes('SMS_GATEWAY_ENC_KEY'));

  const anonStats = await call('GET', '/sms-gateway/admin/stats');
  check('anonymous stats refused 401', anonStats.status === 401, String(anonStats.status));

  await SmsJob.deleteMany({});
  await Device.deleteMany({ deviceId: DEVICE_ID });

  console.log('\n======================================================');
  console.log(`RESULT: ${passed} passed, ${failed} failed`);
  console.log('======================================================');
  await mongoose.disconnect();
  process.exit(failed === 0 ? 0 : 1);
})().catch(async (err) => {
  console.error('FATAL', err);
  await mongoose.disconnect();
  process.exit(1);
});

