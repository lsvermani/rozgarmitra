const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

const { version: APP_VERSION } = require('../package.json');
const { notFound, errorHandler } = require('./middleware/errorHandler');

/// Human-readable mongoose connection states. Exposed by /api/health so the app
/// can tell "server up, database down" apart â€” never the host or the URI.
const DB_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

const authRoutes = require('./routes/authRoutes');
// Admin Panel OTP login. Mounted BEFORE authRoutes on purpose: it claims
// `/api/auth/verify-otp` for the allow-listed administrator number and calls
// `next('router')` for everyone else, so the pre-existing worker / job-creator
// handler behind it is reached exactly as before. Nothing existing is replaced.
const adminOtpRoutes = require('./routes/adminOtpRoutes');
const whatsappRoutes = require('./routes/whatsappRoutes');
const msg91Routes = require('./routes/msg91Routes');
const smsGatewayRoutes = require('./routes/smsGatewayRoutes');
const capcom6Routes = require('./routes/capcom6Routes');
const userRoutes = require('./routes/userRoutes');
const jobRoutes = require('./routes/jobRoutes');
const applicationRoutes = require('./routes/applicationRoutes');
const ratingRoutes = require('./routes/ratingRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportRoutes = require('./routes/reportRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const adminRoutes = require('./routes/adminRoutes');
const locationRoutes = require('./routes/locationRoutes');
const offerRoutes = require('./routes/offerRoutes');

const app = express();

// Behind a reverse proxy / load balancer (nginx, Caddy, Render, Railway...)
// enable TRUST_PROXY so req.ip / req.protocol reflect the real client instead of
// the proxy. Off by default: trusting forwarded headers from arbitrary clients
// would let them spoof their address.
if (String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(mongoSanitize());

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES || '15', 10)) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', limiter);

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Rozgarmitra API is running.',
    health: '/api/health',
    mode: process.env.APP_MODE || 'demo',
    version: APP_VERSION,
  });
});

/**
 * Liveness + configuration probe used by the Android app's
 * "Test Connection" button before a new server address is saved.
 *
 * Only non-sensitive information is exposed: no database host, no credentials,
 * no environment internals.
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Rozgarmitra API is running.',
    mode: process.env.APP_MODE || 'demo',
    version: APP_VERSION,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      connected: mongoose.connection.readyState === 1,
      state: DB_STATES[mongoose.connection.readyState] || 'unknown',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check: also pings MongoDB, so "connected" is proven rather than
 * assumed. Returns 503 when the database is unavailable.
 */
app.get('/api/health/db', async (req, res) => {
  const state = mongoose.connection.readyState;
  if (state !== 1 || !mongoose.connection.db) {
    return res.status(503).json({
      success: false,
      message: 'Database is not connected.',
      version: APP_VERSION,
      database: { connected: false, state: DB_STATES[state] || 'unknown' },
      timestamp: new Date().toISOString(),
    });
  }

  const startedAt = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    res.json({
      success: true,
      message: 'Database reachable.',
      version: APP_VERSION,
      database: {
        connected: true,
        state: DB_STATES[state] || 'connected',
        latencyMs: Date.now() - startedAt,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(503).json({
      success: false,
      message: 'Database ping failed.',
      database: { connected: false, state: DB_STATES[state] || 'unknown' },
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/auth', adminOtpRoutes);
app.use('/api/auth', authRoutes);
// WhatsApp OTP sits alongside the existing auth endpoints rather than replacing
// them. Its public routes are `/api/auth/whatsapp/*`; the admin surface it
// carries is mounted here too, but every one of those handlers is behind
// `protect` + `requirePermission`, so they are unreachable without an admin
// token.
app.use('/api/auth/whatsapp', whatsappRoutes);
// MSG91 OTP Widget. `/complete` issues a session only after MSG91 confirms the
// widget's access-token server-side, so the client is never the authority.
app.use('/api/auth/msg91', msg91Routes);
// Android SMS gateway: the phone holding the SIM polls these to send messages.
app.use('/api/sms-gateway', smsGatewayRoutes);
// capcom6 SMS Gateway for Android. The webhook is HMAC-verified rather than
// session-authenticated, because the app posts from the phone with no JWT.
app.use('/api/capcom6', capcom6Routes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/location', locationRoutes);
app.use('/api/offers', offerRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;

