/**
 * Deep verification of the /admin/applications table.
 *
 * Reads the Jobs and Users collections directly from MongoDB (the source of
 * truth) and cross-checks EVERY application against them, then compares that
 * to what GET /applications actually returns, so the admin table can be shown
 * to display real data for every row - not just a spot check.
 *
 *   node scripts/verify-applications-deep.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const BASE = process.env.API_BASE || 'http://localhost:5000/api';

const Application = require('../src/models/Application');
const Job = require('../src/models/Job');
const User = require('../src/models/User');

let pass = 0, fail = 0;
const notes = [];
const check = (n, ok, extra = '') => {
  if (ok) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n} -> ${extra}`); }
};
const note = (s) => notes.push(s);

async function call(path, token, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json() };
}

// Mirrors the page's own rendering rule so we verify what is actually displayed.
const placeLabel = (l) => {
  if (!l) return null;
  const parts = [l.locality, l.city, l.state].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(', ');
  return l.address || null;
};

async function adminToken() {
  await call('/auth/send-otp', null, { method: 'POST', body: { mobile: '9999999999', role: 'admin' } });
  const login = await call('/auth/verify-otp', null, { method: 'POST', body: { mobile: '9999999999', otp: '123456', role: 'admin' } });
  if (!login.body.token) throw new Error(`admin login failed: ${JSON.stringify(login.body)}`);
  return login.body.token;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // ---- 1. Source of truth straight from Mongo -----------------------------
  const apps = await Application.find({}).lean();
  const jobIds = apps.map((a) => a.jobId).filter(Boolean).map(String);
  const workerIds = apps.map((a) => a.workerId).filter(Boolean).map(String);
  const distinctJobs = new Set(jobIds).size;
  const distinctWorkers = new Set(workerIds).size;

  const jobs = await Job.find({ _id: { $in: jobIds } }).lean();
  const creators = await User.find({ _id: { $in: jobs.map((j) => j.creatorId).filter(Boolean).map(String) } }).lean();
  const workers = await User.find({ _id: { $in: workerIds } }).lean();

  const jobById = new Map(jobs.map((j) => [String(j._id), j]));
  const userById = new Map([...creators, ...workers].map((u) => [String(u._id), u]));

  console.log('=== 1. referential integrity (every application, from Mongo) ===');
  console.log(`  applications: ${apps.length}  distinct jobs: ${distinctJobs}  distinct workers: ${distinctWorkers}\n`);

  const missingJob = apps.filter((a) => !jobById.has(String(a.jobId)));
  const missingWorker = apps.filter((a) => !userById.has(String(a.workerId)));
  const missingCreator = apps.filter((a) => {
    const job = jobById.get(String(a.jobId));
    return job && !userById.has(String(job.creatorId));
  });

  check('every application points at a real job', missingJob.length === 0, `${missingJob.length} orphaned`);
  check('every application points at a real worker', missingWorker.length === 0, `${missingWorker.length} orphaned`);
  check('every job points at a real creator', missingCreator.length === 0, `${missingCreator.length} orphaned`);
  missingJob.forEach((a) => note(`  orphaned job    : application ${a._id} -> jobId ${a.jobId}`));
  missingWorker.forEach((a) => note(`  orphaned worker : application ${a._id} -> workerId ${a.workerId}`));

  // ---- 2. Field completeness in the database ------------------------------
  console.log('\n=== 2. field completeness (what each column can actually show) ===\n');
  const noTitle = jobs.filter((j) => !j.title);
  const noWorkerName = apps.filter((a) => !userById.get(String(a.workerId))?.name);
  const noCreatorLabel = apps.filter((a) => {
    const job = jobById.get(String(a.jobId));
    const c = job ? userById.get(String(job.creatorId)) : null;
    return job && !(c?.businessName || c?.name);
  });
  const noCreatorMobile = apps.filter((a) => {
    const job = jobById.get(String(a.jobId));
    const c = job ? userById.get(String(job.creatorId)) : null;
    return job && !c?.mobile;
  });
  const noPlace = apps.filter((a) => !placeLabel(jobById.get(String(a.jobId))?.location));
  const noAppliedAt = apps.filter((a) => !a.appliedAt);
  const noStatus = apps.filter((a) => !a.status);

  check(`all jobs have a title (${jobs.length - noTitle.length}/${jobs.length})`, noTitle.length === 0, `${noTitle.length} missing`);
  check(`all workers have a name (${apps.length - noWorkerName.length}/${apps.length})`, noWorkerName.length === 0, `${noWorkerName.length} missing`);
  check('all creators have a name or businessName', noCreatorLabel.length === 0, `${noCreatorLabel.length} missing`);
  check('all creators have a mobile', noCreatorMobile.length === 0, `${noCreatorMobile.length} missing`);
  check(`every job yields a displayable location (${apps.length - noPlace.length}/${apps.length})`, noPlace.length === 0, `${noPlace.length} missing`);
  check(`all applications have appliedAt (${apps.length - noAppliedAt.length}/${apps.length})`, noAppliedAt.length === 0, `${noAppliedAt.length} missing`);
  check(`all applications have a status (${apps.length - noStatus.length}/${apps.length})`, noStatus.length === 0, `${noStatus.length} missing`);

  const cityEmpty = jobs.filter((j) => !j.location?.city).length;
  const localityEmpty = jobs.filter((j) => !j.location?.locality).length;
  console.log(`\n  jobs with empty location.city    : ${cityEmpty}/${jobs.length}`);
  console.log(`  jobs with empty location.locality : ${localityEmpty}/${jobs.length}`);
  if (cityEmpty) console.log('  -> city is often blank; the page falls back to locality/address');

  const drift = apps.filter((a) => a.appliedAt && a.createdAt
    && Math.abs(new Date(a.appliedAt) - new Date(a.createdAt)) > 60000);
  console.log(`  applications where appliedAt differs from createdAt by >1min: ${drift.length}`);
  drift.slice(0, 5).forEach((a) => note(`  appliedAt ${a.appliedAt} vs createdAt ${a.createdAt} (app ${a._id})`));

  // ---- 3. Compare the live API against that truth --------------------------
  console.log('\n=== 3. API response vs database truth (every row) ===\n');
  const token = await adminToken();
  const apiRes = await call('/applications', token);
  const apiApps = apiRes.body.applications || [];
  check(`API returns every application (${apiApps.length}/${apps.length})`, apiApps.length === apps.length, `api ${apiApps.length} vs db ${apps.length}`);
  // Without this guard a 0-row API response would make every comparison below
  // vacuously "pass" against an empty map.
  check('API returned rows to compare', apiApps.length > 0, 'no rows - comparisons below would be meaningless');
  const compared = apiApps.length;
  console.log(`  comparing ${compared} row(s) field by field against Mongo\n`);

  const apiById = new Map(apiApps.map((a) => [String(a._id), a]));
  const diffs = [];
  const bump = (field, n) => { if (n) console.log(`  ${n} row(s) differ on ${field}`); };

  let dWorker = 0, dTitle = 0, dCreator = 0, dPlace = 0, dDate = 0, dStatus = 0, dCat = 0;
  for (const dbApp of apps) {
    const apiApp = apiById.get(String(dbApp._id));
    if (!apiApp) continue;
    const job = jobById.get(String(dbApp.jobId));
    const worker = userById.get(String(dbApp.workerId));
    const creator = job ? userById.get(String(job.creatorId)) : null;
    const apiC = apiApp.jobId?.creatorId || {};

    if ((apiApp.workerId?.name || '') !== (worker?.name || '')) { dWorker += 1; diffs.push(`worker   api="${apiApp.workerId?.name}" db="${worker?.name}"`); }
    if ((apiApp.jobId?.title || '') !== (job?.title || '')) { dTitle += 1; diffs.push(`title    api="${apiApp.jobId?.title}" db="${job?.title}"`); }
    if ((apiApp.jobId?.category || '') !== (job?.category || '')) { dCat += 1; diffs.push(`category api="${apiApp.jobId?.category}" db="${job?.category}"`); }
    if ((apiC.businessName || apiC.name || '') !== (creator?.businessName || creator?.name || '')) { dCreator += 1; diffs.push(`creator  api="${apiC.businessName || apiC.name}" db="${creator?.businessName || creator?.name}"`); }
    if ((apiC.mobile || '') !== (creator?.mobile || '')) { dCreator += 1; diffs.push(`creator# api="${apiC.mobile}" db="${creator?.mobile}"`); }
    if (placeLabel(apiApp.jobId?.location) !== placeLabel(job?.location)) { dPlace += 1; diffs.push(`place    api="${placeLabel(apiApp.jobId?.location)}" db="${placeLabel(job?.location)}"`); }
    // The API sends ISO strings while a lean() read gives Date objects, so these
    // must be compared as instants - String() on a Date never matches an ISO string.
    const apiMs = apiApp.appliedAt ? new Date(apiApp.appliedAt).getTime() : NaN;
    const dbMs = dbApp.appliedAt ? new Date(dbApp.appliedAt).getTime() : NaN;
    if (apiMs !== dbMs) { dDate += 1; diffs.push(`applied  api=${apiApp.appliedAt} db=${dbApp.appliedAt}`); }
    if ((apiApp.status || '') !== (dbApp.status || '')) { dStatus += 1; diffs.push(`status   api="${apiApp.status}" db="${dbApp.status}"`); }
  }

  check('worker name matches the database on every row', dWorker === 0, `${dWorker}`);
  check('task title matches the database on every row', dTitle === 0, `${dTitle}`);
  check('task category matches the database on every row', dCat === 0, `${dCat}`);
  check('job creator name + mobile match on every row', dCreator === 0, `${dCreator}`);
  check('location matches the database on every row', dPlace === 0, `${dPlace}`);
  check('applied date matches the database on every row', dDate === 0, `${dDate}`);
  check('status matches the database on every row', dStatus === 0, `${dStatus}`);
  diffs.slice(0, 10).forEach((d) => console.log(`      ${d}`));

  // ---- 4. Cross-collection consistency ------------------------------------
  console.log('\n=== 4. cross-collection consistency ===\n');
  const wrongRole = apps.filter((a) => userById.get(String(a.workerId))?.role !== 'worker');
  const creatorNotCreator = apps.filter((a) => {
    const job = jobById.get(String(a.jobId));
    const c = job ? userById.get(String(job.creatorId)) : null;
    return c && c.role !== 'job_creator';
  });
  const selfApplied = apps.filter((a) => {
    const job = jobById.get(String(a.jobId));
    return job && String(job.creatorId) === String(a.workerId);
  });
  const dupPairs = new Map();
  for (const a of apps) {
    const k = `${a.workerId}|${a.jobId}`;
    dupPairs.set(k, (dupPairs.get(k) || 0) + 1);
  }
  const duplicates = [...dupPairs.entries()].filter(([, n]) => n > 1);

  check('every applicant really has the worker role', wrongRole.length === 0, `${wrongRole.length} rows`);
  check('every job creator really has the job_creator role', creatorNotCreator.length === 0, `${creatorNotCreator.length} rows`);
  check('no creator applied to their own job', selfApplied.length === 0, `${selfApplied.length} rows`);
  check('no worker applied to the same job twice', duplicates.length === 0, `${duplicates.length} duplicate pairs`);

  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  console.log(`\n  status distribution: ${JSON.stringify(byStatus)}`);

  // ---- 5. The table exactly as the admin page renders it ------------------
  console.log('\n=== 5. every row, exactly as /admin/applications renders it ===\n');
  const fmt = (d) => (d ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d)) : '—');
  const ordered = [...apiApps].sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));
  ordered.forEach((a, i) => {
    const w = a.workerId || {}, j = a.jobId || {}, c = j.creatorId || {};
    const creatorLabel = c.businessName || c.name || String(j.creatorId || '—');
    const blanks = [w.name, j.title, creatorLabel, placeLabel(j.location), a.appliedAt, a.status].filter((v) => !v).length;
    check(
      `row ${String(i + 1).padStart(2)} fully populated: ${(w.name || '—')} | ${(j.title || '—').slice(0, 22).padEnd(22)} | ${creatorLabel.slice(0, 20).padEnd(20)} | ${(placeLabel(j.location) || '—').slice(0, 26).padEnd(26)} | ${fmt(a.appliedAt || a.createdAt)} | ${a.status}`,
      blanks === 0, `${blanks} blank column(s)`,
    );
  });

  await mongoose.disconnect();
  console.log(`\n${'='.repeat(56)}\nSECTION 1 RESULT: ${pass} passed, ${fail} failed\n${'='.repeat(56)}`);
  if (notes.length) { console.log('\n=== notes ==='); notes.forEach((n) => console.log(n)); }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });