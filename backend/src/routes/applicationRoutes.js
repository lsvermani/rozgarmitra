const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listApplications, updateApplicationStatus } = require('../controllers/applicationController');

const router = express.Router();

router.get('/', protect, listApplications);
router.put('/:id/status', protect, authorize('job_creator'), updateApplicationStatus);

module.exports = router;
