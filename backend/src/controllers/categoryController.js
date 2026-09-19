const Category = require('../models/Category');

// GET /api/categories
async function listCategories(req, res, next) {
  try {
    const categories = await Category.find({ active: true }).sort({ name: 1 });
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
}

// POST /api/categories (admin only)
async function createCategory(req, res, next) {
  try {
    const { name, icon, subCategories } = req.body;
    const category = await Category.create({ name, icon, subCategories });
    res.status(201).json({ success: true, category });
  } catch (err) {
    next(err);
  }
}

// PUT /api/categories/:id (admin only)
async function updateCategory(req, res, next) {
  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    res.json({ success: true, category });
  } catch (err) {
    next(err);
  }
}

module.exports = { listCategories, createCategory, updateCategory };
