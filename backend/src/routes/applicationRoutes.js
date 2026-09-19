const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listApplications, updateApplicationStatus, acceptApplication } = require('../controllers/applicationController');

const router = express.Router();

router.get('/', protect, listApplications);
router.put('/:id/status', protect, authorize('job_creator'), updateApplicationStatus);
router.put('/:id/accept', protect, authorize('worker'), acceptApplication);

module.exports = router;
