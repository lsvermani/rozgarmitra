/**
 * Removes the throwaway accounts the live-delivery and typing checks create on
 * the administrator's own number, and confirms the real admin account is intact.
 *
 *   node scripts/cleanup-live-test-accounts.js [mobile]
 */
const MOBILE = process.argv[2] || '8699142699';

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection('users');

  // Only non-admin roles. The admin account is the operator's real one and must
  // never be touched by a test cleanup.
  const removed = await users.deleteMany({ mobile: MOBILE, role: { $in: ['worker', 'job_creator'] } });
  console.log(`throwaway accounts removed: ${removed.deletedCount}`);

  const left = await users
    .find({ mobile: MOBILE }, { projection: { role: 1, otpHash: 1, otpCode: 1, _id: 0 } })
    .toArray();
  console.log(`accounts remaining on +91${MOBILE}:`);
  left.forEach((u) => {
    console.log(`  role=${u.role}  otpHash=${u.otpHash ? 'present' : 'none'}  otpCode=${u.otpCode ? 'PLAINTEXT PRESENT (BAD)' : 'none'}`);
  });

  await mongoose.disconnect();
  process.exit(0);
})().catch((err) => {
  console.error('FATAL:', err && err.stack ? err.stack : err);
  process.exit(1);
});