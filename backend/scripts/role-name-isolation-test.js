/**
 * Regression test for the cross-role name leak.
 *
 * /login-rm stored the visitor's name in one shared localStorage key
 * (`rm_pending_name`). /entrywork read it and passed it to send-otp/verify-otp for
 * WHICHEVER role tab was active, and authController did `if (name) user.name = name`.
 * So registering as a worker and then choosing "job creator" stamped the worker's
 * name onto the brand-new job-creator account - and the OTP endpoints could also
 * rename an already-registered account.
 *
 * A mobile can hold one worker AND one job_creator account; each profile is its
 * own, so a name captured for one role must never appear on the other.
 *
 *   node scripts/role-name-isolation-test.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const MOBILE = process.env.LEAK_TEST_MOBILE || '9123456789';

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

// Mirrors admin/src/api/client.js
const sendOtp = (mobile, role, name) =>
  call('POST', '/auth/send-otp', { mobile, role, ...(name ? { name } : {}) });
const verifyOtp = (mobile, otp, role, name) =>
  call('POST', '/auth/verify-otp', { mobile, otp, ...(role ? { role } : {}), ...(name ? { name } : {}) });

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} -> ${extra}`); }
};

(async () => {
  const User = require('../src/models/User');
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({ mobile: MOBILE }); // start from a clean slate
  await mongoose.disconnect();

  console.log(`=== cross-role name isolation (mobile ${MOBILE}) ===\n`);

  console.log('1. register as WORKER with the name typed on /login-rm');
  await sendOtp(MOBILE, 'worker', 'WorkerNameOnly');
  const w = await verifyOtp(MOBILE, '123456', 'worker', 'WorkerNameOnly');
  check('worker account gets the name', w.body.user?.name === 'WorkerNameOnly', JSON.stringify(w.body.user));
  check('worker profile is complete', w.body.user?.profileComplete === true, JSON.stringify(w.body.user?.profileComplete));

  console.log('\n2. same mobile, now the JOB CREATOR tab is selected');
  console.log('   (with the role-scoped store the client now sends NO name here)\n');
  await sendOtp(MOBILE, 'job_creator', '');
  const c = await verifyOtp(MOBILE, '123456', 'job_creator', '');
  check('job_creator did NOT inherit the worker name', c.body.user?.name !== 'WorkerNameOnly', `got ${JSON.stringify(c.body.user?.name)}`);
  check('job_creator has no name yet', !c.body.user?.name, JSON.stringify(c.body.user?.name));
  check('job_creator is asked for its own name (profileComplete false)', c.body.user?.profileComplete === false, JSON.stringify(c.body.user));
  check('job_creator role is correct', c.body.user?.role === 'job_creator', JSON.stringify(c.body.user?.role));

  console.log('\n3. each role names itself, independently');
  const named = await fetch(`${BASE}/users/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.body.token}` },
    body: JSON.stringify({ name: 'Ramesh Events Pvt Ltd' }),
  }).then((r) => r.json());
  check('job_creator can set its own name', named?.user?.name === 'Ramesh Events Pvt Ltd', JSON.stringify(named?.user));
  const backToWorker = await verifyOtp(MOBILE, '123456', 'worker', '');
  check('worker name is unaffected by the creator naming', backToWorker.body.user?.name === 'WorkerNameOnly', JSON.stringify(backToWorker.body.user?.name));

  console.log('\n4. the OTP endpoints cannot rename an existing account');
  await sendOtp(MOBILE, 'worker', 'HijackedName');
  await verifyOtp(MOBILE, '123456', 'worker', 'HijackedName');
  const again = await verifyOtp(MOBILE, '123456', 'worker', 'HijackedName');
  check('worker name survives an OTP attempt to rename it', again.body.user?.name === 'WorkerNameOnly', `got ${JSON.stringify(again.body.user?.name)}`);

  console.log('\n5. both roles are genuinely separate accounts');
  const m2 = require('mongoose');
  await m2.connect(process.env.MONGO_URI);
  const U = require('../src/models/User');
  const both = await U.find({ mobile: MOBILE }).lean();
  check('two accounts exist for this mobile', both.length === 2, `found ${both.length}`);
  const roles = both.map((u) => u.role).sort().join(',');
  check('roles are worker + job_creator', roles === 'job_creator,worker', roles);
  check('accounts have different _ids', new Set(both.map((u) => String(u._id))).size === 2);
  await U.deleteMany({ mobile: MOBILE });
  console.log(`\n  cleanup: removed test accounts for ${MOBILE}`);
  await m2.disconnect();

  // The pre-fix reproduction left an account behind holding the stale name;
    // clear it so the database is not left with cross-role duplicates.
  const STALE = '9123456788';
  const m3 = require('mongoose');
  await m3.connect(process.env.MONGO_URI);
  const U3 = require('../src/models/User');
  const stale = await U3.find({ mobile: STALE }).lean();
  if (stale.length) {
    console.log(`\n  cleanup: removing ${stale.length} leaked account(s) for ${STALE}`);
    stale.forEach((u) => console.log(`    role=${u.role} name=${JSON.stringify(u.name)}`));
    await U3.deleteMany({ mobile: STALE });
  }
  await m3.disconnect();

  console.log(`\n${'='.repeat(54)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(54)}`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 150);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });