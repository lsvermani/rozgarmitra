require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');

const PORT = process.env.PORT || 5000;

async function start() {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`\n🚀 Rozgarmitra API running on http://localhost:${PORT}`);
    console.log(`   Mode: ${process.env.APP_MODE || 'demo'}`);
    console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
  });
}

start();
