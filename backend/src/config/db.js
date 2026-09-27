const mongoose = require('mongoose');
const User = require('../models/User');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rozgarmitra';
  try {
    await mongoose.connect(uri);
    try {
      await User.collection.dropIndex('mobile_1');
    } catch (err) {
      if (err.codeName !== 'IndexNotFound') throw err;
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
