#!/usr/bin/env node
/**
 * Rozgarmitra — MongoDB connection script
 * ======================================
 *
 * Single entry point for "is the database wired up and reachable?".
 * It reads the same MONGO_URI the API server uses, so a green result here
 * means the backend will boot.
 *
 * Usage (run from the `backend/` folder so `backend/.env` is picked up):
 *
 *   npm run db:check                     # connect + report collections/doc counts
 *   npm run db:setup                     # ...and create/repair all Mongoose indexes
 *   node scripts/mongo-connect.js --uri "mongodb+srv://user:pass@cluster/rozgarmitra"
 *   node scripts/mongo-connect.js --json # machine-readable output (CI)
 *
 * Exit codes: 0 = connected, 1 = could not connect (with a fix hint printed).
 *
 * Resolution order for the connection string:
 *   1. --uri <value>            (explicit CLI flag, never written to disk)
 *   2. MONGO_URI env var        (.env file or shell environment)
 *   3. mongodb://127.0.0.1:27017/rozgarmitra   (local dev default)
 */

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const DEFAULT_URI = 'mongodb://127.0.0.1:27017/rozgarmitra';
const CONNECT_TIMEOUT_MS = 10000;

// Collections the Mongoose models create. Used to flag an unseeded database.
const EXPECTED_COLLECTIONS = [
  'users',
  'jobs',
  'applications',
  'ratings',
  'notifications',
  'reports',
  'categories',
  'workeroffers',
  'workerselections',
];

function parseArgs(argv) {
  const args = { uri: null, json: false, indexes: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--indexes' || arg === '--setup') args.indexes = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg.startsWith('--uri=')) args.uri = arg.slice('--uri='.length);
    else if (arg === '--uri') args.uri = argv[(i += 1)];
  }
  return args;
}

/** Hide the password when echoing a URI into logs. */
function redact(uri) {
  return uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:****@');
}

/** Show where we connected without leaking credentials. */
function describeTarget(uri) {
  try {
    const normalized = uri.replace('mongodb+srv://', 'https://').replace('mongodb://', 'http://');
    const parsed = new URL(normalized);
    const kind = uri.startsWith('mongodb+srv') ? 'Atlas (mongodb+srv)' : 'Standalone (mongodb)';
    return { kind, host: parsed.host, database: parsed.pathname.replace(/^\//, '') || '(none)' };
  } catch {
    return { kind: 'unknown', host: '(unparseable)', database: '(unknown)' };
  }
}

function printHelp() {
  console.log(`
Rozgarmitra - MongoDB connection script

  node scripts/mongo-connect.js [options]

Options:
  --uri <connection-string>   Override MONGO_URI for this run
  --indexes                   Also create/repair Mongo indexes (same as db:setup)
  --json                      Emit JSON instead of a human report
  -h, --help                  Show this message

Environment:
  MONGO_URI   Read from backend/.env or the shell (default: ${DEFAULT_URI})

Examples:
  npm run db:check
  npm run db:setup
  node scripts/mongo-connect.js --uri "mongodb+srv://user:pass@cluster0.abcde.mongodb.net/rozgarmitra"
`);
}


async function collectReport(uri) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    connectTimeoutMS: CONNECT_TIMEOUT_MS,
    // `directConnection` stays unset so Atlas SRV / seed-list discovery works.
  });

  const startedAt = Date.now();
  await client.connect();
  const latencyMs = Date.now() - startedAt;

  const admin = client.db().admin();
  const serverInfo = await admin.command({ buildInfo: 1 }).catch(() => ({}));
  const hello = await admin.command({ hello: 1 }).catch(() => ({}));

  const dbName = client.db().databaseName;
  const collections = await client
    .db(dbName)
    .listCollections()
    .toArray()
    .catch(() => []);

  const rows = [];
  for (const collection of collections) {
    const handle = client.db(dbName).collection(collection.name);
    const documents = await handle.estimatedDocumentCount().catch(() => null);
    const indexes = await handle.indexes().catch(() => []);
    rows.push({
      name: collection.name,
      documents,
      indexes: indexes.map((index) => index.name),
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const present = new Set(rows.map((row) => row.name));
  const missing = EXPECTED_COLLECTIONS.filter((name) => !present.has(name));

  await client.close();

  return {
    connected: true,
    uri: redact(uri),
    target: describeTarget(uri),
    database: dbName,
    latencyMs,
    server: {
      version: serverInfo.version || 'unknown',
      topology: hello.setName ? `replica set (${hello.setName})` : 'standalone',
      isWritablePrimary: Boolean(hello.isWritablePrimary),
    },
    collections: rows,
    missingCollections: missing,
    seeded: missing.length === 0,
  };
}

function printReport(report) {
  console.log('');
  console.log('MongoDB connection OK');
  console.log('-'.repeat(66));
  console.log(`   URI          : ${report.uri}`);
  console.log(`   Target       : ${report.target.kind} @ ${report.target.host}`);
  console.log(`   Database     : ${report.database}`);
  console.log(`   Server       : MongoDB ${report.server.version} - ${report.server.topology}`);
  console.log(`   Latency      : ${report.latencyMs} ms`);
  console.log('-'.repeat(66));
  console.log(`   Collections  : ${report.collections.length}`);
  if (report.collections.length === 0) {
    console.log('   (empty database - run `npm run seed` to load demo data)');
  } else {
    for (const row of report.collections) {
      const count = row.documents === null ? '?' : String(row.documents);
      console.log(`     - ${row.name.padEnd(16)} ${count.padStart(7)} docs   indexes: ${row.indexes.join(', ') || '-'}`);
    }
  }
  if (report.missingCollections.length) {
    console.log(`   Missing      : ${report.missingCollections.join(', ')}`);
    console.log('   Hint         : run `npm run seed` to create + populate them.');
  }
  console.log('-'.repeat(66));
  console.log('');
}

function printFailure(uri, error) {
  console.error('');
  console.error('MongoDB connection FAILED');
  console.error('-'.repeat(66));
  console.error(`   URI   : ${redact(uri)}`);
  console.error(`   Host  : ${describeTarget(uri).host}`);
  console.error(`   Error : ${error.message}`);
  console.error('-'.repeat(66));
  if (/ECONNREFUSED|Server selection timed out|MongooseServerSelectionError/i.test(error.message)) {
    console.error('   Likely cause: nothing is listening on that host/port.');
    console.error('   Fix (local):  powershell -File ../scripts/start-mongodb.ps1');
    console.error('   Fix (Atlas):  set MONGO_URI in backend/.env, then whitelist your IP');
    console.error('                 in Atlas -> Network Access (0.0.0.0/0 for quick tests).');
  } else if (/authentication failed|bad auth/i.test(error.message)) {
    console.error('   Likely cause: wrong username/password in MONGO_URI.');
    console.error('   Fix: re-copy the connection string from Atlas -> Connect -> Drivers.');
  } else if (/querySrv|ENOTFOUND|getaddrinfo/i.test(error.message)) {
    console.error('   Likely cause: DNS cannot resolve the Atlas SRV record.');
    console.error('   Fix: check internet/DNS, or use the non-SRV');
    console.error('        mongodb://host1,host2,host3/... connection string.');
  }
  console.error('');
}

/**
 * Create/repair every index declared by the Mongoose models. Reuses the
 * backend's own model layer so this can never drift from what the API expects.
 */
async function syncIndexes(uri) {
  const mongoose = require('mongoose');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS });

  const modelsDir = path.join(__dirname, '..', 'src', 'models');
  const models = fs
    .readdirSync(modelsDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => require(path.join(modelsDir, file)));

  const summary = [];
  for (const model of models) {
    // Legacy single-field mobile index breaks multi-role accounts; drop it if present.
    const dropped = await model.collection.dropIndex('mobile_1').catch(() => null);
    await model.syncIndexes();
    // Report the resulting index list (not just what syncIndexes created) so the
    // output is meaningful even when everything was already in sync.
    const finalIndexes = await model.collection.indexes().catch(() => []);
    summary.push({
      model: model.modelName,
      droppedLegacyMobileIndex: Boolean(dropped),
      indexes: finalIndexes.map((index) => index.name),
    });
  }

  await mongoose.disconnect();
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return 0;
  }

  const uri = args.uri || process.env.MONGO_URI || DEFAULT_URI;

  try {
    const report = await collectReport(uri);

    if (args.indexes) {
      report.indexSync = await syncIndexes(uri);
    }

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
      if (report.indexSync) {
        console.log('   Index sync:');
        for (const entry of report.indexSync) {
          console.log(`     - ${entry.model.padEnd(14)} indexes: ${entry.indexes.join(', ') || '(none)'}`);
        }
        console.log('');
      }
    }
    return 0;
  } catch (error) {
    if (args.json) {
      console.log(JSON.stringify({ connected: false, uri: redact(uri), error: error.message }, null, 2));
    } else {
      printFailure(uri, error);
    }
    return 1;
  }
}

// NOTE: assign `process.exitCode` instead of calling process.exit() so Node
// flushes stdout fully before leaving — process.exit() truncates piped/redirected
// output on Windows (the report would silently disappear).
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error('[mongo-connect] Unexpected error:', error);
    process.exitCode = 1;
  });

