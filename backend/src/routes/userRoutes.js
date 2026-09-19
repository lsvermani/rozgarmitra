const express = require('express');
const { protect } = require('../middleware/auth');
const { getProfile, updateProfile, getUserById } = require('../controllers/userController');

const router = express.Router();

router.get('/profile', protect, getProfile);
router.put('/profile', protect, updateProfile);
router.get('/:id', protect, getUserById);

module.exports = router;
