/**
 * Diagnoses and repairs test-suite data drift.
 *
 * admin-user-edit-test.js restores its mutations at the end, but a run that is
 * killed part-way (e.g. the backend restarting mid-test, giving ECONNREFUSED)
 * leaves the target user promoted to job_creator AND holding another
 * job_creator's mobile. That breaks the unique (mobile, role) index for every
 * later run: promoting a user back to job_creator then returns 409.
 *
 *   node scripts/repair-test-user-state.js          # report only
 *   node scripts/repair-test-user-state.js --fix    # repair
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

(async () => {
  const fix = process.argv.includes('--fix');
  await mongoose.connect(process.env.MONGO_URI);

  const users = await User.find({}).lean();
  console.log(`total users: ${users.length}\n`);

  // A mobile shared by more than one account is the signature of a botched run.
  const byMobile = new Map();
  for (const u of users) {
    if (!byMobile.has(u.mobile)) byMobile.set(u.mobile, []);
    byMobile.get(u.mobile).push(u);
  }
  const dupMobiles = [...byMobile.entries()].filter(([, list]) => list.length > 1);

  console.log('=== mobiles held by more than one account ===');
  if (!dupMobiles.length) console.log('  (none)');
  for (const [mobile, list] of dupMobiles) {
    console.log(`  ${mobile}:`);
    for (const u of list) {
      console.log(`    _id=${u._id}  role=${u.role}  name="${u.name || ''}"  ${u._id.equals(list[0]._id) ? '' : '<-- duplicate'}`);
    }
  }

  // Leftover fixtures from an interrupted run.
  const leftovers = users.filter((u) => u.name === 'Edited Name QA' || u.name === 'Edited Job Title QA');
  console.log('\n=== rows still holding a test fixture value ===');
  if (!leftovers.length) console.log('  (none)');
  for (const u of leftovers) console.log(`  _id=${u._id} role=${u.role} mobile=${u.mobile} name="${u.name}"`);

  // The seeder creates workers on 9000000010-19 and creators on 8000000010-14.
  // A gap in the worker range is where a stray account's mobile used to be.
  const present = new Set(users.map((u) => String(u.mobile)));
  const missingWorkers = [];
  for (let i = 10; i <= 19; i += 1) {
    const m = `90000000${String(i).padStart(2, '0')}`;
    if (!present.has(m)) missingWorkers.push(m);
  }
  console.log('\n=== seed worker mobiles (9000000010-19) not present in the DB ===');
  console.log(missingWorkers.length ? `  ${missingWorkers.join(', ')}` : '  (none - seed range is complete)');

  const missingCreators = [];
  for (let i = 10; i <= 14; i += 1) {
    const m = `80000000${String(i).padStart(2, '0')}`;
    if (!present.has(m)) missingCreators.push(m);
  }
  console.log('\n=== seed creator mobiles (8000000010-14) not present in the DB ===');
  console.log(missingCreators.length ? `  ${missingCreators.join(', ')}` : '  (none - seed range is complete)');

  // Deliberate deletion of seed/demo data is risky, so print the whole picture
  // and let a human decide. Use --fix only once the stray is understood.
  if (process.argv.includes('--list')) {
    console.log('\n=== every account ===');
    users
      .sort((a, b) => String(a.mobile).localeCompare(String(b.mobile)))
      .forEach((u) => console.log(`  ${String(u.mobile).padEnd(12)} ${String(u.role).padEnd(12)} "${u.name || ''}"`));
  }

  if (!fix) {
    console.log('\n(dry run - pass --list for a full dump, --fix to repair)');
    await mongoose.disconnect();
    return;
  }

  // Removing a stray can orphan rows that still point at it, so report what
  // references it before touching anything.
  const Application = require('../src/models/Application');
  const Job = require('../src/models/Job');
  console.log('\n=== references to the stray account(s) ===');
  for (const [, list] of dupMobiles) {
    const sorted = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const stray of sorted.slice(1)) {
      const apps = await Application.countDocuments({ workerId: stray._id });
      const jobs = await Job.countDocuments({ creatorId: stray._id });
      console.log(`  _id=${stray._id}: applications=${apps} jobs=${jobs}`);
    }
  }

  // Repair: for each duplicated mobile keep the account whose role was original
  // and remove the stray duplicates created by the interrupted run.
  let removed = 0;
  for (const [, list] of dupMobiles) {
    const sorted = [...list].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const keep = sorted[0];
    for (const stray of sorted.slice(1)) {
      console.log(`\n  removing stray _id=${stray._id} role=${stray.role} mobile=${stray.mobile} name="${stray.name || ''}" (keeping _id=${keep._id})`);
      await User.deleteOne({ _id: stray._id });
      removed += 1;
    }
  }

  console.log(`\nremoved ${removed} stray account(s)`);
  await mongoose.disconnect();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });