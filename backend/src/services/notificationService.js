const Notification = require('../models/Notification');

async function notify(userId, title, message, type = 'GENERAL', relatedJobId = null) {
  try {
    return await Notification.create({ userId, title, message, type, relatedJobId });
  } catch (err) {
    console.error('[Notification] Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { notify };
