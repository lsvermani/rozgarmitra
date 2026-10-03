/**
 * Acceptance test for the admin "edit job" feature (title / category / creator
 * / payment). Runs against the live API and RESTORES every value it changes, so
 * it is safe to re-run.
 *
 *   node scripts/admin-job-edit-test.js
 */
const BASE = process.env.API_BASE || 'http://localhost:5000/api';
const ADMIN_MOBILE = '9999999999';

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

let pass = 0, fail = 0;
const check = (n, ok, extra = '') => { if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} ${extra}`); } };

(async () => {
  await call('POST', '/auth/send-otp', { body: { mobile: ADMIN_MOBILE, role: 'admin' } });
  const login = await call('POST', '/auth/verify-otp', { body: { mobile: ADMIN_MOBILE, otp: '123456', role: 'admin' } });
  const token = login.body.token;
  check('admin session obtained', Boolean(token));
  if (!token) process.exit(1);

  const jobsRes = await call('GET', '/admin/jobs?limit=1', { token });
  const job = jobsRes.body.jobs?.[0];
  check('found a job to edit', Boolean(job));
  if (!job) process.exit(1);

  const original = {
    title: job.title,
    category: job.category,
    creatorId: String(job.creatorId?._id || job.creatorId),
    payment: job.payment,
  };
  console.log(`  (editing "${original.title}" / ${original.category} / ${original.payment})`);
  const restore = () => call('PUT', `/admin/jobs/${job._id}`, { token, body: original });

  const cats = await call('GET', '/categories');
  check('categories endpoint lists options', (cats.body.categories || []).length > 0);
  const creators = await call('GET', '/admin/users?role=job_creator&limit=100', { token });
  check('job creators available for the picker', (creators.body.users || []).length > 0);
  const workers = await call('GET', '/admin/users?role=worker&limit=1', { token });
  const aWorker = workers.body.users?.[0];

  console.log('\n=== authorisation ===');
  const anon = await call('PUT', `/admin/jobs/${job._id}`, { body: { title: 'Hacked' } });
  check('anonymous edit rejected (401)', anon.status === 401, `got ${anon.status}`);
  await call('POST', '/auth/send-otp', { body: { mobile: '9000000010', role: 'worker' } });
  const w = await call('POST', '/auth/verify-otp', { body: { mobile: '9000000010', otp: '123456', role: 'worker' } });
  const wEdit = await call('PUT', `/admin/jobs/${job._id}`, { token: w.body.token, body: { title: 'Hacked' } });
  check('worker cannot edit jobs (403)', wEdit.status === 403, `got ${wEdit.status}`);

  console.log('\n=== validation ===');
  const badTitle = await call('PUT', `/admin/jobs/${job._id}`, { token, body: { title: 'x' } });
  check('1-char title rejected (400)', badTitle.status === 400, `got ${badTitle.status}`);
  const badCat = await call('PUT', `/admin/jobs/${job._id}`, { token, body: { category: 'NotARealCategory' } });
  check('unknown category rejected (400)', badCat.status === 400, `got ${badCat.status}`);
  const badPay = await call('PUT', `/admin/jobs/${job._id}`, { token, body: { payment: -5 } });
  check('negative payment rejected (400)', badPay.status === 400, `got ${badPay.status}`);
  if (aWorker) {
    const badCreator = await call('PUT', `/admin/jobs/${job._id}`, { token, body: { creatorId: aWorker._id } });
    check('worker cannot own a job (400)', badCreator.status === 400, `got ${badCreator.status}`);
  }
  const badId = await call('PUT', '/admin/jobs/not-an-id', { token, body: { title: 'Nope' } });
  check('malformed job id -> 400', badId.status === 400, `got ${badId.status}`);
  const missing = await call('PUT', '/admin/jobs/000000000000000000000000', { token, body: { title: 'Nope' } });
  check('unknown job id -> 404', missing.status === 404, `got ${missing.status}`);
  const empty = await call('PUT', `/admin/jobs/${job._id}`, { token, body: {} });
  check('empty payload rejected (400)', empty.status === 400, `got ${empty.status}`);

  console.log('\n=== happy path: title, category, payment ===');
  const realCat = cats.body.categories.find((c) => c.name !== original.category)?.name || original.category;
  const edited = await call('PUT', `/admin/jobs/${job._id}`, {
    token,
    body: { title: 'Edited Job Title QA', category: realCat, payment: 1234.567 },
  });
  check('edit accepted (200)', edited.status === 200, JSON.stringify(edited.body).slice(0, 160));
  check('title round-trips', edited.body.job?.title === 'Edited Job Title QA', `got ${edited.body.job?.title}`);
  check('category round-trips', edited.body.job?.category === realCat, `got ${edited.body.job?.category}`);
  check('payment rounded to 2dp', edited.body.job?.payment === 1234.57, `got ${edited.body.job?.payment}`);
  check('creator populated in response', Boolean(edited.body.job?.creatorId?._id));
  check('status untouched', edited.body.job?.status === job.status, `got ${edited.body.job?.status}`);
  check('applicationsCount untouched', edited.body.job?.applicationsCount === job.applicationsCount);

  console.log('\n=== happy path: reassign creator ===');
  const otherCreator = creators.body.users.find((u) => String(u._id) !== original.creatorId);
  if (otherCreator) {
    const moved = await call('PUT', `/admin/jobs/${job._id}`, { token, body: { creatorId: otherCreator._id } });
    check('creator reassigned (200)', moved.status === 200, `got ${moved.status}`);
    check('new creator round-trips', String(moved.body.job?.creatorId?._id) === otherCreator._id, `got ${moved.body.job?.creatorId?._id}`);
  } else {
    console.log('  (only one job_creator - skipped)');
  }

  console.log('\n=== restore everything ===');
  const back = await restore();
  check('job restored', back.status === 200, `got ${back.status}`);
  const after = await call('GET', `/admin/jobs?search=${encodeURIComponent(original.title)}`, { token });
  const now = after.body.jobs?.find((j) => j._id === job._id);
  check('title restored', now?.title === original.title, `got "${now?.title}"`);
  check('category restored', now?.category === original.category, `got ${now?.category}`);
  check('payment restored', Number(now?.payment) === Number(original.payment), `got ${now?.payment}`);
  check('creator restored', String(now?.creatorId?._id) === original.creatorId, `got ${now?.creatorId?._id}`);

  console.log(`\n${'='.repeat(54)}`);
  console.log(`RESULT: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(54));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
