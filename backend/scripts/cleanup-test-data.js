/**
 * One-off cleanup of the records created by `admin-auth-test.js` and
 * `security-test.js`, so the local database is back to its seeded state.
 *
 *   node scripts/cleanup-test-data.js
 *
 * Refuses to run without --yes, and only ever deletes the specific records the
 * test suites create — never anything from the seed script.
 */
require('dotenv').config();
const m = require('mongoose');

const CONFIRMED = process.argv.includes('--yes');

// The exact mobiles the two suites register, plus the name pattern they use.
const TEST_MOBILES = ['9123456780', '9123456781', '9123456782'];
const TEST_NAMES = ['Phase A Tester', 'Second Tester', 'Third Tester'];

async function run() {
  await m.connect(process.env.MONGO_URI);
  const db = m.connection.db;

  const testUsers = await db
    .collection('users')
    .find({ $or: [{ mobile: { $in: TEST_MOBILES } }, { name: { $in: TEST_NAMES } }] })
    .project({ _id: 1, mobile: 1, name: 1, role: 1 })
    .toArray();

  const testUserIds = testUsers.map((u) => u._id);

  console.log(`Found ${testUsers.length} test user(s):`);
  for (const u of testUsers) console.log(`  ${u.mobile}  ${u.name}  (${u.role})`);

  // Reports the suites create: one per successful block test, always with the
  // fixed description written by reportController.blockUser.
  const testReports = await db
    .collection('reports')
    .find({ description: 'User blocked via block action.' })
    .project({ _id: 1, reporterId: 1 })
    .toArray();

  const seedReports = await db.collection('reports').countDocuments({ description: { $ne: 'User blocked via block action.' } });
  const activityCount = await db.collection('activitylogs').countDocuments({});

  console.log(`\nWould delete:`);
  console.log(`  users        : ${testUsers.length}`);
  console.log(`  reports      : ${testReports.length}  (the other ${seedReports} are seeded and stay)`);
  console.log(`  activitylogs : ${activityCount}  (collection was created by this work; all rows are test runs)`);

  if (!CONFIRMED) {
    console.log('\nDry run. Re-run with --yes to actually delete.');
    await m.disconnect();
    return;
  }

  // Delete dependent records first so nothing is left dangling.
  for (const collection of ['notifications', 'applications', 'ratings', 'workeroffers', 'workerselections']) {
    const res = await db.collection(collection).deleteMany({ $or: [{ workerId: { $in: testUserIds } }, { userId: { $in: testUserIds } }, { creatorId: { $in: testUserIds } }] });
    if (res.deletedCount) console.log(`  ${collection}: removed ${res.deletedCount}`);
  }

  if (testUserIds.length) {
    const res = await db.collection('users').deleteMany({ _id: { $in: testUserIds } });
    console.log(`  users: removed ${res.deletedCount}`);
  }

  if (testReports.length) {
    const res = await db.collection('reports').deleteMany({ description: 'User blocked via block action.' });
    console.log(`  reports: removed ${res.deletedCount}`);
  }

  if (activityCount) {
    const res = await db.collection('activitylogs').deleteMany({});
    console.log(`  activitylogs: removed ${res.deletedCount}`);
  }

  console.log('\n--- Final state ---');
  for (const c of ['users', 'jobs', 'applications', 'reports', 'notifications', 'workeroffers', 'workerselections', 'ratings', 'categories', 'activitylogs']) {
    const n = await db.collection(c).countDocuments();
    console.log(`  ${c.padEnd(18)} ${n}`);
  }

  await m.disconnect();
}

run().catch((e) => { console.error('ERR', e.message); process.exit(1); });
