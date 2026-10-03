/**
 * Aligns the admin account with ADMIN_PHONE_NUMBER.
 *
 *   node src/seed/migrate-admin-mobile.js
 *
 * Why this exists
 * ---------------
 * The panel's authorised OTP number moved to 8699142699, but the seeded admin
 * *account* still carried the previous number. Without this, an OTP would be
 * sent to the right handset and then rejected at the final step ("This account
 * does not have administrator access"), which looks like a gateway fault.
 *
 * Safety
 * ------
 * - Idempotent: re-running changes nothing once the account matches.
 * - Refuses to proceed when ADMIN_PHONE_NUMBER is unset or malformed, rather
 *   than guessing a default.
 * - Only touches `admin` / `super_admin` documents. Workers, job creators and
 *   their OTPs are untouched.
 * - Does not overwrite a name or any other field.
 */
require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const { isAdminRole } = require('../config/permissions');
const { toNational } = require('../config/adminOtp');

async function main() {
  const target = toNational(process.env.ADMIN_PHONE_NUMBER);
  if (!target) {
    console.error('ADMIN_PHONE_NUMBER is missing or not a valid 10-digit number. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Target admin mobile: ${target}`);

  const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } });

  for (const admin of admins) {
    if (admin.mobile === target) {
      console.log(`- ${admin.role} ${admin.mobile}: already correct, skipped.`);
      continue;
    }

    // A clash would violate the sparse unique index on { mobile, role }.
    const clash = await User.findOne({ mobile: target, role: admin.role, _id: { $ne: admin._id } });
    if (clash) {
      console.error(`- ${admin.role}: a ${admin.role} already uses ${target}. Resolve manually.`);
      continue;
    }

    const previous = admin.mobile;
    admin.mobile = target;
    await admin.save();
    console.log(`- ${admin.role}: ${previous} -> ${target}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error('Migration failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});