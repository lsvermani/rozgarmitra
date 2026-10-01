const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const {
  getStats,
  listUsers,
  toggleBlockUser,
  verifyUser,
  listAllJobs,
  removeJob,
  listReports,
  updateReportStatus,
} = require('../controllers/adminController');
const {
  logServerConfigChange,
  listServerConfigChanges,
} = require('../controllers/configAuditController');

const router = express.Router();

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', listUsers);
router.put('/users/:id/block', toggleBlockUser);
router.put('/users/:id/verify', verifyUser);
router.get('/jobs', listAllJobs);
router.delete('/jobs/:id', removeJob);
router.get('/reports', listReports);
router.put('/reports/:id', updateReportStatus);

// Audit trail for API address / environment changes made in the Android app's
// Server / Admin Settings page. Recording only — these endpoints can never
// change a server address.
router.get('/server-config-log', listServerConfigChanges);
router.post('/server-config-log', logServerConfigChange);

module.exports = router;

