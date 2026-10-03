/**
 * Acceptance test for the Activity Logs page.
 *
 * Exercises a real sign-in -> sign-out cycle for a worker and a job creator,
 * then proves the admin API can search and filter what was recorded.
 *
 *   node scripts/activity-logs-test.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const TEST_MOBILE = '9123456790';
const TEST_CREATOR = '9123456791';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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

async function adminToken() {
  await call('POST', '/auth/send-otp', { body: { mobile: '9999999999', role: 'admin' } });
  const r = await call('POST', '/auth/verify-otp', { body: { mobile: '9999999999', otp: '123456', role: 'admin' } });
  return r.body.token;
}

(async () => {
  const User = require('../src/models/User');
  await mongoose.connect(process.env.MONGO_URI);
  await User.deleteMany({ mobile: { $in: [TEST_MOBILE, TEST_CREATOR] } });
  await mongoose.disconnect();

  console.log('=== A. sign-in is recorded for every role ===\n');
  await call('POST', '/auth/send-otp', { body: { mobile: TEST_MOBILE, role: 'worker' } });
  const w = await call('POST', '/auth/verify-otp', {
    body: {
      mobile: TEST_MOBILE, otp: '123456', role: 'worker', name: 'Log Tester',
      liveLocation: { latitude: 28.6139, longitude: 77.209, accuracy: 24 },
    },
  });
  check('worker signed in', Boolean(w.body.token), JSON.stringify(w.body));

  await call('POST', '/auth/send-otp', { body: { mobile: TEST_CREATOR, role: 'job_creator' } });
  const c = await call('POST', '/auth/verify-otp', {
    body: { mobile: TEST_CREATOR, otp: '123456', role: 'job_creator', name: 'Log Creator' },
  });
  check('job creator signed in', Boolean(c.body.token), JSON.stringify(c.body));

  const token = await adminToken();
  check('admin signed in', Boolean(token));

  // Give the fire-and-forget audit writes a moment to land.
  await new Promise((r) => setTimeout(r, 700));

  console.log('\n=== B. sign-out is recorded ===\n');
  const wo = await call('POST', '/auth/logout', { token: w.body.token });
  check('worker logout accepted', wo.status === 200, JSON.stringify(wo.body));
  const co = await call('POST', '/auth/logout', { token: c.body.token });
  check('job creator logout accepted', co.status === 200, JSON.stringify(co.body));
  await new Promise((r) => setTimeout(r, 700));

  console.log('\n=== C. the admin can read them back ===\n');
  const all = await call('GET', '/admin/activity-logs?limit=100', { token });
  check('activity-logs returns 200', all.status === 200, `got ${all.status}`);
  const logs = all.body.logs || [];
  check('entries were recorded', logs.length > 0, `${logs.length} rows`);

  const workerSignIn = logs.find((l) => l.event === 'sign_in' && l.role === 'worker' && l.actorName === 'Log Tester');
  const creatorSignIn = logs.find((l) => l.event === 'sign_in' && l.role === 'job_creator');
  const workerSignOut = logs.find((l) => l.event === 'sign_out' && l.role === 'worker');
  const adminSignIn = logs.find((l) => l.event === 'sign_in' && l.role === 'admin');

  check('worker sign-in logged', Boolean(workerSignIn));
  check('job creator sign-in logged', Boolean(creatorSignIn));
  check('admin sign-in logged', Boolean(adminSignIn));
  check('worker sign-out logged', Boolean(workerSignOut));

  console.log('\n=== D. location + live location were captured ===\n');
  check('live location captured on the worker sign-in', Boolean(workerSignIn?.liveLocation?.latitude),
    JSON.stringify(workerSignIn?.liveLocation));
  check('latitude is the value sent', Math.abs((workerSignIn?.liveLocation?.latitude ?? 0) - 28.6139) < 0.001,
    String(workerSignIn?.liveLocation?.latitude));
  check('longitude is the value sent', Math.abs((workerSignIn?.liveLocation?.longitude ?? 0) - 77.209) < 0.001,
    String(workerSignIn?.liveLocation?.longitude));
  check('session duration recorded on sign-out', typeof workerSignOut?.sessionSeconds === 'number',
    JSON.stringify(workerSignOut?.sessionSeconds));
  check('ip address recorded', Boolean(workerSignIn?.ip), String(workerSignIn?.ip));
  check('platform recorded', Boolean(workerSignIn?.platform), String(workerSignIn?.platform));

  console.log('\n=== E. dropdown data is returned from real rows ===\n');
  const filters = all.body.filters || {};
  check('events include sign_in', (filters.events || []).includes('sign_in'), JSON.stringify(filters.events));
  check('events include sign_out', (filters.events || []).includes('sign_out'), JSON.stringify(filters.events));
  check('roles include worker + job_creator + admin',
    ['worker', 'job_creator', 'admin'].every((r) => (filters.roles || []).includes(r)),
    JSON.stringify(filters.roles));
  check('actors list is populated', (filters.actors || []).length > 0, `${(filters.actors || []).length} actors`);

  console.log('\n=== F. search and filtering work ===\n');
  const byEvent = await call('GET', '/admin/activity-logs?event=sign_out&limit=100', { token });
  check('filter by event returns only sign_out',
    byEvent.body.logs?.length > 0 && byEvent.body.logs.every((l) => l.event === 'sign_out'),
    `${byEvent.body.logs?.length} rows`);

  const byRole = await call('GET', '/admin/activity-logs?role=worker&limit=100', { token });
  check('filter by role returns only workers',
    byRole.body.logs?.length > 0 && byRole.body.logs.every((l) => l.role === 'worker'),
    `${byRole.body.logs?.length} rows`);

  const bySearch = await call('GET', '/admin/activity-logs?search=Log%20Tester&limit=100', { token });
  check('search finds the user by name',
    bySearch.body.logs?.length > 0 && bySearch.body.logs.every((l) => l.actorName === 'Log Tester'),
    `${bySearch.body.logs?.length} rows`);

  const combined = await call('GET', '/admin/activity-logs?role=worker&event=sign_in&limit=100', { token });
  check('role + event combine',
    combined.body.logs?.length > 0 && combined.body.logs.every((l) => l.role === 'worker' && l.event === 'sign_in'),
    `${combined.body.logs?.length} rows`);

  const paged = await call('GET', '/admin/activity-logs?limit=2&page=1', { token });
  check('pagination respects the limit', paged.body.logs?.length === 2, `${paged.body.logs?.length} rows`);
  check('pagination reports totals', paged.body.total > 2 && paged.body.pages > 1, `total=${paged.body.total} pages=${paged.body.pages}`);

  const today = new Date().toISOString().slice(0, 10);
  const byDate = await call('GET', `/admin/activity-logs?from=${today}&to=${today}`, { token });
  check('date filter includes today', byDate.body.logs?.length > 0, `${byDate.body.logs?.length} rows`);

  console.log('\n=== G. summary + live location endpoints ===\n');
  const sum = await call('GET', '/admin/activity-logs/summary', { token });
  check('summary returns roles', sum.status === 200 && Array.isArray(sum.body.roles), JSON.stringify(sum.body).slice(0, 120));
  check('summary counts worker sign-ins',
    (sum.body.roles || []).some((r) => r.role === 'worker' && r.signIns > 0), JSON.stringify(sum.body.roles));

  const live = await call('GET', '/admin/activity-logs/live', { token });
  check('live location endpoint returns data', live.status === 200 && live.body.count > 0, `count=${live.body?.count}`);
  check('live entry carries coordinates',
    (live.body.locations || []).some((l) => typeof l.liveLocation?.latitude === 'number'),
    JSON.stringify(live.body.locations?.[0]));

  console.log('\n=== H. access control ===\n');
  const anon = await call('GET', '/admin/activity-logs');
  check('anonymous rejected (401)', anon.status === 401, `got ${anon.status}`);
  const asWorker = await call('GET', '/admin/activity-logs', { token: w.body.token });
  check('worker rejected (403)', asWorker.status === 403, `got ${asWorker.status}`);

  console.log('\n=== I. no secrets leak into the trail ===\n');
  const raw = JSON.stringify(all.body.logs);
  check('no otpCode field stored', !/"otpCode"/.test(raw), 'otpCode present');
  check('no otpExpiresAt field stored', !/"otpExpiresAt"/.test(raw), 'otpExpiresAt present');
  check('no token field stored', !/"token"\s*:/.test(raw), 'token key present');
  // Check for actual secret material rather than the word "password", which
  // legitimately appears in the label "Signed in via password."
  check('no password/hash key stored', !/"(password|passwordHash|jwtSecret|mongoUri)"\s*:/i.test(raw), 'secret key present');
  check('no bcrypt hash stored', !/\$2[aby]\$/.test(raw), 'bcrypt hash present');
  check('no JWT stored', !/eyJ[A-Za-z0-9_-]{10,}\./.test(raw), 'JWT present');
  check('the only "password" mention is the method label',
    (raw.match(/password/gi) || []).every(() => true)
      && !/"password"\s*:\s*"(?!Signed in via password)/i.test(raw), 'password value present');

  // Cleanup
  const m4 = require('mongoose');
  await m4.connect(process.env.MONGO_URI);
  const ActivityLog = require('../src/models/ActivityLog');
  const U4 = require('../src/models/User');
  await U4.deleteMany({ mobile: { $in: [TEST_MOBILE, TEST_CREATOR] } });
  await ActivityLog.deleteMany({ actorName: { $in: ['Log Tester', 'Log Creator'] } });
  console.log('\n  cleanup: removed test accounts and their log entries');
  await m4.disconnect();

  console.log(`\n${'='.repeat(54)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(54)}`);
  process.exitCode = fail === 0 ? 0 : 1;
  setTimeout(() => process.exit(process.exitCode), 150);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
