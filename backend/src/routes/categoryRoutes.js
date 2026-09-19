const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { listCategories, createCategory, updateCategory } = require('../controllers/categoryController');

const router = express.Router();

router.get('/', listCategories);
router.post('/', protect, authorize('admin'), createCategory);
router.put('/:id', protect, authorize('admin'), updateCategory);

module.exports = router;
