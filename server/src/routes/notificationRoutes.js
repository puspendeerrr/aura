const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticateToken } = require('../middlewares/auth');

router.get('/', authenticateToken, notificationController.getNotifications);
router.post('/read', authenticateToken, notificationController.markAsRead);

module.exports = router;
