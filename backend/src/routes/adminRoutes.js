const express = require('express');
const { protect, authorize, requirePermission } = require('../middleware/auth');
const {
  getStats,
  listUsers,
  updateUser,
  toggleBlockUser,
  verifyUser,
  listAllJobs,
  updateJob,
  removeJob,
  listReports,
  updateReportStatus,
} = require('../controllers/adminController');
const {
  logServerConfigChange,
  listServerConfigChanges,
} = require('../controllers/configAuditController');
const {
  listActivityLogs,
  activitySummary,
  liveLocations,
} = require('../controllers/activityLogController');

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', listUsers);
// Editing a user is gated on the `users.edit` permission, not just the admin
// role, so a future Manager/Viewer role can be granted read-only access here.
router.put('/users/:id', requirePermission('users.edit'), updateUser);
router.put('/users/:id/block', toggleBlockUser);
router.put('/users/:id/verify', verifyUser);
router.get('/jobs', listAllJobs);
// Same permission-based gating as the user editor.
router.put('/jobs/:id', requirePermission('jobs.edit'), updateJob);
router.delete('/jobs/:id', removeJob);
router.get('/reports', listReports);
router.put('/reports/:id', updateReportStatus);

// Activity Logs page. Read-only, so it is gated on `logs.view` (granted to
// admin, manager and viewer) rather than requiring the full admin role.
// Registered before nothing in particular, but note `/activity-logs/live` and
// `/activity-logs/summary` must be declared before any ':id' style route.
router.get('/activity-logs', requirePermission('logs.view'), listActivityLogs);
router.get('/activity-logs/summary', requirePermission('logs.view'), activitySummary);
router.get('/activity-logs/live', requirePermission('logs.view'), liveLocations);

// Audit trail for API address / environment changes made in the Android app's
// Server / Admin Settings page. Recording only — these endpoints can never
// change a server address.
router.get('/server-config-log', listServerConfigChanges);
router.post('/server-config-log', logServerConfigChange);

module.exports = router;

