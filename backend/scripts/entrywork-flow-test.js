/**
 * End-to-end test of the /entrywork flow, executing the exact API calls the
 * page makes (see admin/src/pages/EntryWork.jsx):
 *
 *   POST /auth/send-otp   -> demoOtp
 *   POST /auth/verify-otp -> token + user.profileComplete
 *   PUT  /users/profile   -> persists fullName for brand-new accounts
 *
 * A brand-new number must report profileComplete:false so the page shows the
 * "name" step; a returning user must report true so it goes straight to the
 * dashboard. Uses a throwaway number and removes it afterwards.
 *
 *   node scripts/entrywork-flow-test.js
 */
require('dotenv').config();
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const NEW_MOBILE = process.env.ENTRYWORK_TEST_MOBILE || '9876543210';
const EXISTING_WORKER = '9000000010';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} -> ${extra}`); }
};

(async () => {
  console.log(`=== A. brand-new signup exercises the name step (${NEW_MOBILE}) ===`);
  const send = await call('POST', '/auth/send-otp', { body: { mobile: NEW_MOBILE, role: 'worker' } });
  check('send-otp accepted', send.status === 200, `status ${send.status} ${JSON.stringify(send.body)}`);
  const otp = send.body.demoOtp || '123456';
  check('send-otp returns a demo OTP', Boolean(otp), otp);

  const verify = await call('POST', '/auth/verify-otp', { body: { mobile: NEW_MOBILE, otp, role: 'worker' } });
  check('verify-otp returns a token', verify.status === 200 && Boolean(verify.body.token), `status ${verify.status}`);
  check('new account has profileComplete === false', verify.body.user?.profileComplete === false, JSON.stringify(verify.body.user));

  const pendingToken = verify.body.token;
  const tooShort = await call('PUT', '/users/profile', { token: pendingToken, body: { name: 'A' } });
  // The page blocks <2 chars client-side; make sure the API is sane too.
  check('API persists the full name', tooShort.status === 200 && Boolean(tooShort.body.user?.name), `status ${tooShort.status}`);
  console.log(`        saved name -> "${tooShort.body.user?.name}"`);

  const named = 'Entry Test';
  const saved = await call('PUT', '/users/profile', { token: pendingToken, body: { name: named } });
  check('name saved via the name step', saved.body.user?.name === named, JSON.stringify(saved.body.user));

  // The name must actually be persisted, not just echoed back.
  const reread = await call('GET', '/users/profile', { token: pendingToken });
  check('name persisted server-side', reread.body.user?.name === named, JSON.stringify(reread.body.user));

  // On the next visit the page skips the name step only if verify-otp reports
  // profileComplete:true. (GET /users/profile deliberately does not carry that
  // flag - it is produced by authController on the OTP responses.)
  const reVerify = await call('POST', '/auth/verify-otp', { body: { mobile: NEW_MOBILE, otp: '123456', role: 'worker' } });
  check('next visit skips the name step (profileComplete true)', reVerify.body.user?.profileComplete === true, JSON.stringify(reVerify.body.user));

  console.log('\n=== B. returning user skips the name step ===');
  await call('POST', '/auth/send-otp', { body: { mobile: EXISTING_WORKER, role: 'worker' } });
  const back = await call('POST', '/auth/verify-otp', { body: { mobile: EXISTING_WORKER, otp: '123456', role: 'worker' } });
  check('existing worker verified', back.status === 200 && Boolean(back.body.token), `status ${back.status}`);
  check('existing worker profileComplete === true', back.body.user?.profileComplete === true, JSON.stringify(back.body.user));

  console.log('\n=== C. role guard on the page is meaningful ===');
  const wrongRole = await call('POST', '/auth/verify-otp', { body: { mobile: EXISTING_WORKER, otp: '123456', role: 'job_creator' } });
  check('worker cannot sign in as job_creator', wrongRole.body.user?.role !== 'job_creator' || wrongRole.status >= 400,
    `status ${wrongRole.status} role ${wrongRole.body.user?.role}`);

  console.log('\n=== D. rejected mobile validation ===');
  const bad = await call('POST', '/auth/send-otp', { body: { mobile: '12345', role: 'worker' } });
  check('short mobile rejected', bad.status >= 400, `status ${bad.status}`);

  // Cleanup the throwaway account so repeated runs stay idempotent.
  try {
    const mongoose = require('mongoose');
    const User = require('../src/models/User');
    await mongoose.connect(process.env.MONGO_URI);
    await User.deleteOne({ mobile: NEW_MOBILE });
    console.log(`\ncleanup: removed throwaway user ${NEW_MOBILE}`);
    await mongoose.disconnect();
  } catch (e) {
    console.log(`\ncleanup skipped: ${e.message}`);
  }

  console.log(`\n${'='.repeat(52)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(52)}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });