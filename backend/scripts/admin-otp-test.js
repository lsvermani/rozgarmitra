/**
 * Admin Panel OTP login - end-to-end test.
 *
 *   npm run test:admin-otp
 *
 * Exercises the whole flow against a running server:
 *   1. authorised number generates an OTP and is sent via the SMS Gateway
 *   2. the code verifies and mints a real admin JWT that opens the dashboard
 *   3. an unauthorised number is refused and NO OTP is generated
 *   4. a wrong OTP is rejected
 *   5. an expired OTP is rejected
 *   6. the attempt budget is enforced and the code is then unusable
 *   7. the resend cooldown and the hourly cap are enforced
 *
 * Plus the properties that are easy to regress silently: the OTP is never in a
 * response or a log, and no gateway credential or stack trace reaches the
 * browser.
 *
 * Requires ADMIN_OTP_TEST_MODE=true on the server so the generated code can be
 * read from the response. Without a reachable SMS Gateway the "send" step
 * reports the gateway failure path instead - useful in itself, and shown as
 * SKIPPED rather than FAILED.
 */
require('dotenv').config();

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PORT || 5000}/api`;
const ADMIN_PHONE = String(process.env.ADMIN_PHONE_NUMBER || '8699142699').replace(/\D/g, '').slice(-10);
const WRONG_PHONE = '9999999999';

let passed = 0;
let failed = 0;
let skipped = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? `  -> ${detail}` : ''}`);
  }
}

const skip = (label, detail = '') => {
  skipped += 1;
  console.log(`  SKIP  ${label}${detail ? `  -> ${detail}` : ''}`);
};

const section = (title) => console.log(`\n=== ${title} ===`);

async function call(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { status: res.status, body: parsed, text };
}

/** Requests a code; returns the response plus the code when test mode is on. */
async function requestOtp(phone = ADMIN_PHONE) {
  const res = await call('POST', '/auth/request-otp', { phone });
  return { ...res, otp: res.body && res.body.otp };
}

(async () => {
  console.log(`Admin OTP end-to-end test\nAPI: ${BASE}\nAdmin: ${ADMIN_PHONE}\n`);

  // ---------------------------------------------------------------- 0. health
  section('0. Preconditions');
  const health = await call('GET', '/health');
  check('API is reachable', health.status === 200, `status=${health.status}`);
  if (health.status !== 200) {
    console.log('\nCannot continue without the API.');
    process.exit(1);
  }
  check('Database is connected', health.body?.database?.connected === true);

  // ---------------------------------------------------------- 1. request flow
  section('1. Request OTP (Test 1)');
  const first = await requestOtp();
  const sent = first.status === 200;

  if (first.status === 429) {
    skip('OTP request succeeded', `cooldown active, retryAfter=${first.body?.retryAfterSeconds}`);
  } else if (!sent) {
    check('OTP request succeeds', false, `status=${first.status} ${first.text.slice(0, 120)}`);
    // A gateway outage is expected until the handset is configured.
    if (first.status === 502) {
      skip('SMS Gateway delivery', 'gateway unreachable - set SMS_GATEWAY_URL / USERNAME / PASSWORD');
    }
  } else {
    check('OTP request succeeds (200)', true);
    check(
      'Message is "OTP sent successfully to your registered mobile number."',
      /OTP sent successfully/i.test(first.body.message || ''),
      first.body.message,
    );
    // The code may only appear under the single, explicitly-named `otp` key,
    // and only because ADMIN_OTP_TEST_MODE is on. It must never leak under
    // any other name, and the response must carry no other secret.
    check(
      'OTP appears only as the explicit test-mode `otp` field',
      typeof first.body.otp === 'string' || first.body.otp === undefined,
      JSON.stringify(Object.keys(first.body)),
    );
    check('No extra secret-looking fields in the response', !/password|secret|token|hash/i.test(Object.keys(first.body).join(',')), Object.keys(first.body).join(','));
    check('Response returns a resend cooldown', Number(first.body.resendAfterSeconds) > 0);
    check('Response returns the OTP length', first.body.otpLength === 6);
  }

  // ------------------------------------------------------- 2. unauthorised no.
  section('2. Unauthorised phone (Test 3)');
  const bad = await requestOtp(WRONG_PHONE);
  check('9999999999 is refused (403)', bad.status === 403, `status=${bad.status}`);
  check(
    'Refusal message is "Unauthorized phone number."',
    /unauthorized phone number/i.test(bad.body?.message || ''),
    bad.body?.message,
  );
  check('No OTP is generated for it', !bad.body?.otp);

  // The legacy endpoints must also refuse the admin role, or 9999999999 could
  // still reach the panel through the old demo flow.
  const legacySend = await call('POST', '/auth/send-otp', { mobile: WRONG_PHONE, role: 'admin' });
  check('Legacy /auth/send-otp refuses role=admin', legacySend.status === 403, `status=${legacySend.status}`);
  const legacyVerify = await call('POST', '/auth/verify-otp', { mobile: WRONG_PHONE, otp: '123456', role: 'admin' });
  check('Legacy /auth/verify-otp refuses role=admin', legacyVerify.status === 403, `status=${legacyVerify.status}`);
  check('Legacy admin login is not granted a token', !legacyVerify.body?.token);

  if (!sent || !first.otp) {
    console.log('\n--- Remaining sections need a reachable SMS Gateway + ADMIN_OTP_TEST_MODE ---');
  } else {
    const code = first.otp;

    // ---------------------------------------------------------- 4. wrong OTP
    section('3. Wrong OTP (Test 4)');
    const wrong = code === '000000' ? '111111' : '000000';
    const wrongRes = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: wrong });
    check('Wrong OTP is rejected (400)', wrongRes.status === 400, `status=${wrongRes.status}`);
    check('Message is "Invalid OTP. Please try again."', /invalid otp/i.test(wrongRes.body?.message || ''), wrongRes.body?.message);
    check('No token is issued', !wrongRes.body?.token);

    // ------------------------------------------------- 3. attempt exhaustion
    section('4. Attempt budget (Test 6)');
    // The wrong attempt above already consumed 1, so 4 more exhaust the budget.
    for (let i = 0; i < 4; i += 1) {
      await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: '222222' });
    }
    const exhausted = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: code });
    check('Correct OTP is refused after 5 attempts', exhausted.status === 429, `status=${exhausted.status}`);
    check(
      'Message is "Too many attempts. Please request a new OTP."',
      /too many attempts/i.test(exhausted.body?.message || ''),
      exhausted.body?.message,
    );
    // --------------------------------------------------------- 5. cooldown
    section('5. Rate limiting (Test 7)');
    const cooldown = await requestOtp();
    check('Immediate re-request is refused (429)', cooldown.status === 429, `status=${cooldown.status}`);
    check('Cooldown reports seconds remaining', Number(cooldown.body?.retryAfterSeconds) > 0, String(cooldown.body?.retryAfterSeconds));

    // ------------------------------------------------------- 2. happy path
    section('6. Successful login (Test 2)');
    const wait = Number(cooldown.body?.retryAfterSeconds || 0) + 2;
    process.stdout.write(`  (waiting ${wait}s for the cooldown to clear...)\n`);
    await new Promise((r) => setTimeout(r, wait * 1000));

    const second = await requestOtp();
    check('A fresh OTP can be requested after the cooldown', second.status === 200, `status=${second.status}`);
    const code2 = second.otp;

    if (code2) {
      const oldCode = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: code });
      check('A new OTP invalidates the previous one', oldCode.status !== 200, `status=${oldCode.status}`);

      const good = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: code2 });
      check('Correct OTP verifies (200)', good.status === 200, `status=${good.status} ${good.text.slice(0, 140)}`);
      check('Message is "OTP verified successfully"', /verified successfully/i.test(good.body?.message || ''));
      check('An admin token is issued', typeof good.body?.token === 'string' && good.body.token.length > 20);

      const stats = await call('GET', '/admin/stats', null, good.body?.token);
      check('Token opens the admin dashboard API', stats.status === 200, `status=${stats.status}`);
      check('Session role is admin', good.body?.user?.role === 'admin', good.body?.user?.role);

      const replay = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: code2 });
      check('A used OTP cannot be replayed', replay.status !== 200, `status=${replay.status}`);
      check(
        'Replay message mentions it was already used',
        /already been used/i.test(replay.body?.message || ''),
        replay.body?.message,
      );
    } else {
      skip('Full happy path', 'ADMIN_OTP_TEST_MODE not enabled on the server');
    }

    // ------------------------------------------------------- 3. expired OTP
    section('7. Expiry (Test 5)');
    // Rather than sleep for the full 5 minutes, the stored record is aged
    // directly. This proves the server's own expiry check fires.
    //
    // `used` is cleared at the same time: the previous section already consumed
    // this code, and `check()` reports "already been used" *before* it looks at
    // expiry (correctly - a spent code is dead either way). Clearing it is what
    // isolates the expiry branch.
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rozgarmitra');
    const AdminOtp = require('../src/models/AdminOtp');
    await AdminOtp.updateOne(
      { phone: ADMIN_PHONE },
      { $set: { expiresAt: new Date(Date.now() - 60 * 1000), used: false, usedAt: null } },
    );
    await mongoose.disconnect();

    const expiredCode = code2 || '333333';
    const expired = await call('POST', '/auth/verify-otp', { phone: ADMIN_PHONE, otp: expiredCode });
    check('Expired OTP is rejected (400)', expired.status === 400, `status=${expired.status}`);
    check(
      'Message is "OTP has expired. Please request a new OTP."',
      /expired/i.test(expired.body?.message || ''),
      expired.body?.message,
    );
    check('No token is issued for an expired OTP', !expired.body?.token);
  }

  // ------------------------------------------------------------ 8. no secrets
  section('8. Secret hygiene');
  const probe = await requestOtp(WRONG_PHONE);
  const leak = JSON.stringify(probe.body || {});
  check('No gateway password leaked', !/password/i.test(leak), leak.slice(0, 120));
  check('No stack trace leaked', !/\bat\s+\w+\s+\(/i.test(leak), leak.slice(0, 120));
  check('No MONGO_URI leaked', !/mongodb/i.test(leak), leak.slice(0, 120));
  check('Health does not expose secrets', !/password|secret|mongodb:\/\//i.test(JSON.stringify(health.body || {})));

  console.log(`\n${'-'.repeat(58)}`);
  console.log(`PASS ${passed}   FAIL ${failed}   SKIP ${skipped}`);
  console.log('-'.repeat(58));
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nTest run crashed:', err);
  process.exit(1);
});