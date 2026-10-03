const mongoose = require('mongoose');
const User = require('../models/User');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rozgarmitra';
  try {
    await mongoose.connect(uri);
    // Drop the legacy non-unique `mobile_1` index before syncing, so the
    // replacement `{ mobile, role }` unique index can be built.
    //
    // Two distinct "nothing to drop" errors have to be tolerated here:
    //   - IndexNotFound      (codeName 'IndexNotFound')      -> collection exists,
    //     but has no `mobile_1` index.
    //   - NamespaceNotFound  (codeName 'NamespaceNotFound')  -> the `users`
    //     collection itself does not exist yet, which is the normal state of a
    //     brand-new database. This used to be rethrown, so `connectDB` fell
    //     into the outer catch and called `process.exit(1)`: the server never
    //     bound to its port and every request (including POST /auth/send-otp)
    //     died as a network error, which the web app reported as
    //     "Failed to send OTP." against a perfectly valid config.
    try {
      await User.collection.dropIndex('mobile_1');
    } catch (err) {
      const nothingToDrop = err.codeName === 'IndexNotFound' || err.codeName === 'NamespaceNotFound';
      if (!nothingToDrop) throw err;
    }
    await User.syncIndexes();
    console.log(`[DB] Connected to MongoDB: ${uri}`);
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
    console.error(
      '[DB] Is MongoDB running? Start it locally or set MONGO_URI to a remote cluster (e.g. MongoDB Atlas).'
    );
    process.exit(1);
  }
}

module.exports = connectDB;
