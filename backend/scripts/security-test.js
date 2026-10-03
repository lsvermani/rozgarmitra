/**
 * Security regression tests for the two access-control holes found during the
 * architecture audit, plus a re-run of the core auth suite.
 *
 *   node scripts/security-test.js
 *
 * Run with the API up. Safe to re-run.
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_MOBILE = '9999999999';
const WORKER_MOBILE = '9000000010';
const CREATOR_MOBILE = '9000000020';

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function login(mobile, role) {
  await call('POST', '/auth/send-otp', { body: { mobile, role } });
  const r = await call('POST', '/auth/verify-otp', { body: { mobile, otp: '123456', role } });
  return r.body.token;
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
}

(async () => {
  console.log('\n=== Fix 1: GET /ratings/:userId now requires authentication ===');

  const anon = await call('GET', '/ratings/000000000000000000000000');
  check('Anonymous request is rejected (401)', anon.status === 401, `got ${anon.status}`);
  check('Rejection leaks no rating data', !anon.body.ratings);

  const adminToken = await login(ADMIN_MOBILE, 'admin');
  check('Admin session obtained', Boolean(adminToken));

  const authed = await call('GET', '/ratings/000000000000000000000000', { token: adminToken });
  check('Authenticated request is allowed (200)', authed.status === 200, `got ${authed.status} ${JSON.stringify(authed.body)}`);
  check('Response shape unchanged', Array.isArray(authed.body.ratings) && typeof authed.body.count === 'number');

  const badId = await call('GET', '/ratings/not-a-valid-id', { token: adminToken });
  check('Malformed id returns 400 not 500', badId.status === 400, `got ${badId.status}`);

  console.log('\n=== Fix 2: POST /reports/block/:userId rejects admins ===');

  const adminBlock = await call('POST', `/reports/block/${WORKER_MOBILE}`, { token: adminToken });
  check('Admin cannot use the end-user block route (403)', adminBlock.status === 403, `got ${adminBlock.status}`);

  const workerToken = await login(WORKER_MOBILE, 'worker');
  const creatorToken = await login(CREATOR_MOBILE, 'job_creator');
  check('Worker session obtained', Boolean(workerToken));
  check('Creator session obtained', Boolean(creatorToken));

  // The Android app's block button must keep working.
  const me = await call('GET', '/users/profile', { token: workerToken });
  const workerId = me.body.user?._id;
  check('Worker resolved own id', Boolean(workerId));

  if (workerId) {
    const creatorBlock = await call('POST', `/reports/block/${workerId}`, { token: creatorToken });
    check('Job creator CAN still block a worker (200)', creatorBlock.status === 200, `got ${creatorBlock.status} ${JSON.stringify(creatorBlock.body)}`);

    const selfBlock = await call('POST', `/reports/block/${workerId}`, { token: workerToken });
    check('Blocking yourself is rejected (400)', selfBlock.status === 400, `got ${selfBlock.status}`);
  }

  const anonBlock = await call('POST', `/reports/block/${WORKER_MOBILE}`);
  check('Anonymous block rejected (401)', anonBlock.status === 401, `got ${anonBlock.status}`);

  console.log('\n=== Regression: everything else still behaves ===');
  const jobs = await call('GET', '/jobs?limit=2');
  check('GET /jobs still public', jobs.status === 200 && (jobs.body.total || 0) >= 20, `total=${jobs.body.total}`);

  const health = await call('GET', '/health/db');
  check('GET /health/db still 200', health.status === 200);

  const offers = await call('GET', '/offers/my', { token: workerToken });
  check('Worker offers route still works', offers.status === 200, `got ${offers.status}`);

  const offersJob = await call('GET', '/offers/job/000000000000000000000000', { token: adminToken });
  check('Admin can still read job offers', offersJob.status === 200 || offersJob.status === 404, `got ${offersJob.status}`);

  const reports = await call('GET', '/admin/reports', { token: adminToken });
  check('Admin reports list still works', reports.status === 200, `got ${reports.status}`);

  const stats = await call('GET', '/admin/stats', { token: adminToken });
  check('Admin stats still works', stats.status === 200 && (stats.body.stats?.totalUsers || 0) >= 16);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SECURITY RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(60));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
