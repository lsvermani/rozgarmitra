const Notification = require('../models/Notification');

// GET /api/notifications
async function listNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    const unreadCount = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ success: true, count: notifications.length, unreadCount, notifications });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/:id/read
async function markAsRead(req, res, next) {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found.' });
    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/read-all
async function markAllRead(req, res, next) {
  try {
    await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
    res.json({ success: true, message: 'All notifications marked read.' });
  } catch (err) {
    next(err);
  }
}

module.exports = { listNotifications, markAsRead, markAllRead };
