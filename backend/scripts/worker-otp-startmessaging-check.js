/**
 * End-to-end check of the WORKER / JOB-CREATOR OTP flow over StartMessaging.
 *
 * Drives the real HTTP endpoints, with StartMessaging replaced by a local stub
 * that speaks the same protocol (POST /otp/send, X-API-Key, E.164 recipient,
 * `variables.otp`). That proves the request this app would put on the wire -
 * shape, headers, payload - without needing a live key or paying for an SMS.
 *
 *   node scripts/worker-otp-startmessaging-check.js
 */
const http = require('http');

let API_BASE = process.env.CHECK_BASE || 'http://127.0.0.1:5000';
const STUB_PORT = parseInt(process.env.STUB_PORT || '8791', 10);
const PHONE = process.env.CHECK_WORKER_PHONE || '9000000042';

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`); }
}

async function call(path, body) {
  const res = await fetch(`${API_BASE}/api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, json };
}

/** Stands in for api.startmessaging.com. Records exactly what it received. */
function startStub() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* keep null */ }
      seen.push({ method: req.method, url: req.url, apiKey: req.headers['x-api-key'], body: parsed });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: { id: `stub-${seen.length}` } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(STUB_PORT, '127.0.0.1', () => resolve({ server, seen }));
  });
}

/** Points the flow under test at the stub, and remembers how to undo it. */
function forceStartmessaging() {
  const saved = {};
  const set = (k, v) => { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  set('OTP_PROVIDER', 'startmessaging');
  set('APP_MODE', 'production'); // real CSPRNG codes, and a real send
  set('STARTMESSAGING_BASE_URL', `http://127.0.0.1:${STUB_PORT}`);
  set('STARTMESSAGING_API_KEY', 'sm_live_stub_key_for_testing');
  set('OTP_PEPPER', 'stub-pepper-do-not-use');
  set('DEMO_OTP', undefined);
  return () => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    });
  };
}

(async () => {
  require('dotenv').config();
  const restore = forceStartmessaging();
  const { server, seen } = await startStub();

  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  const User = require('../src/models/User');
  const users = mongoose.connection.db.collection('users');

  // Boot a dedicated API in THIS process, so the environment forced above is the
  // one the handlers actually read. Pointing at an already-running server cannot
  // work: its OTP_PROVIDER and APP_MODE come from its own .env, so the test
  // would silently exercise demo mode and never call StartMessaging at all.
  const app = require('../src/app');
  const apiServer = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  API_BASE = `http://127.0.0.1:${apiServer.address().port}`;

  // A fresh account for each role, so "new user" and "returning user" are both
  // genuinely covered rather than assumed.
  for (const role of ['worker', 'job_creator']) await User.deleteMany({ mobile: PHONE, role });

  // The resend cooldown is real and deliberately blocks a second request within
  // OTP_RESEND_SECONDS. Anywhere it is NOT the thing under test, it is cleared,
  // so a correct cooldown does not read as an unrelated failure.
  const clearCooldown = (role) =>
    users.updateOne({ mobile: PHONE, role }, { $set: { otpLastSentAt: null } });

  try {
    for (const role of ['worker', 'job_creator']) {
      console.log(`\n=== ${role}: brand-new number ===`);

      // No `name` is sent here: `isNewUser` is computed as `!user.name` AFTER the
      // name is applied, so passing one would legitimately report false.
      const first = await call('/auth/send-otp', { mobile: PHONE, role });
      check(`${role}: send accepted`, first.status === 200, `status=${first.status} ${JSON.stringify(first.json)}`);
      check(`${role}: account created`, first.json && first.json.isNewUser === true, JSON.stringify(first.json));
      check(`${role}: response hides the code`, !first.json.demoOtp, 'demoOtp leaked outside demo mode');

      const sms = seen[seen.length - 1];
      check(`${role}: StartMessaging was actually called`, Boolean(sms));
      if (sms) {
        check(`${role}: POST /otp/send`, sms.method === 'POST' && sms.url === '/otp/send', `${sms.method} ${sms.url}`);
        check(`${role}: X-API-Key header sent`, Boolean(sms.apiKey), String(sms.apiKey));
        check(`${role}: recipient is E.164`, /^\+91\d{10}$/.test(String(sms.body && sms.body.phoneNumber)), String(sms.body && sms.body.phoneNumber));
        check(`${role}: code sent as variables.otp`, Boolean(sms.body && sms.body.variables && /^\d{6}$/.test(String(sms.body.variables.otp))), JSON.stringify(sms.body && sms.body.variables));
      }

      // The code was on the wire - it must not be in the database.
      const wireCode = sms && sms.body && sms.body.variables && String(sms.body.variables.otp);
      const stored = await users.findOne({ mobile: PHONE, role }, { projection: { otpCode: 1, otpHash: 1, otpAttempts: 1, _id: 0 } });
      check(`${role}: no plaintext code stored`, !stored.otpCode, JSON.stringify(stored));
      check(`${role}: HMAC stored instead`, Boolean(stored.otpHash), JSON.stringify(stored));
      check(`${role}: digest is not the code`, stored.otpHash !== wireCode);
      check(`${role}: attempt counter starts at 0`, Number(stored.otpAttempts) === 0, String(stored.otpAttempts));

      const bad = await call('/auth/verify-otp', { mobile: PHONE, otp: '000000', role });
      check(`${role}: wrong code refused`, bad.status === 400, `status=${bad.status}`);
      const after = await users.findOne({ mobile: PHONE, role }, { projection: { otpAttempts: 1 } });
      check(`${role}: wrong guess counted`, Number(after.otpAttempts) === 1, String(after.otpAttempts));

      const good = await call('/auth/verify-otp', { mobile: PHONE, otp: wireCode, role });
      check(`${role}: correct code signs in`, good.status === 200 && Boolean(good.json.token), `status=${good.status}`);
      const spent = await users.findOne({ mobile: PHONE, role }, { projection: { otpHash: 1, otpCode: 1 } });
      check(`${role}: digest cleared after use`, !spent.otpHash, JSON.stringify(spent));
      check(`${role}: code cannot be replayed`, (await call('/auth/verify-otp', { mobile: PHONE, otp: wireCode, role })).status === 400);

      await clearCooldown(role);
      // "Returning user" is asserted on the ACCOUNT, not on `isNewUser`: that
      // flag means "this profile still has no name", so it stays true forever
      // for a user who never supplied one. What matters is that the existing
      // account is reused rather than duplicated, and that a second sign-in
      // works end to end.
      // which has no `.length` - asserting on it silently compares undefined.
      const beforeList = await users.find({ mobile: PHONE, role }, { projection: { _id: 1 } }).toArray();
      const again = await call('/auth/send-otp', { mobile: PHONE, role });
      const afterList = await users.find({ mobile: PHONE, role }, { projection: { _id: 1 } }).toArray();
      const wire2 = seen[seen.length - 1].body.variables.otp;
      check(`${role}: returning request accepted`, again.status === 200, `status=${again.status} ${JSON.stringify(again.json)}`);
      check(`${role}: no duplicate account created`, afterList.length === 1 && beforeList.length === 1,
        `before=${beforeList.length} after=${afterList.length}`);
      check(`${role}: same account reused`, beforeList.length > 0 && afterList.length > 0
        && String(beforeList[0]._id) === String(afterList[0]._id));
      const second = await call('/auth/verify-otp', { mobile: PHONE, otp: wire2, role });
      check(`${role}: returning user signs in again`, second.status === 200 && Boolean(second.json.token), `status=${second.status}`);
    }
    console.log('\n=== resend cooldown ===');
    await clearCooldown('worker');
    const one = await call('/auth/send-otp', { mobile: PHONE, role: 'worker' });
    const two = await call('/auth/send-otp', { mobile: PHONE, role: 'worker' });
    check('first request allowed', one.status === 200, `status=${one.status}`);
    check('immediate resend refused', two.status === 429, `status=${two.status} ${JSON.stringify(two.json)}`);
    check('refusal carries a countdown', Number(two.json && two.json.retryAfter) > 0, JSON.stringify(two.json));

    console.log('\n=== attempt budget ===');
    const otpService = require('../src/services/otpService');
    await clearCooldown('worker');
    await users.updateOne(
      { mobile: PHONE, role: 'worker' },
      {
        $set: {
          otpHash: otpService.hashOtp('424242', PHONE),
          otpExpiresAt: new Date(Date.now() + 300000),
          otpAttempts: 0,
        },
      },
    );
    let last = null;
    for (let i = 1; i <= 6; i += 1) {
      last = (await call('/auth/verify-otp', { mobile: PHONE, otp: '999999', role: 'worker' })).json;
      if (last && last.errorCode === 'too_many_attempts') break;
    }
    check('brute force is capped', Boolean(last && last.errorCode === 'too_many_attempts'), JSON.stringify(last));
  } finally {
    for (const role of ['worker', 'job_creator']) await User.deleteMany({ mobile: PHONE, role });
    await mongoose.disconnect();
    apiServer.close();
    server.close();
    restore();
  }

  console.log(`\n${'-'.repeat(52)}\nPASS ${passed}   FAIL ${failed}\n${'-'.repeat(52)}`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(1);
});
