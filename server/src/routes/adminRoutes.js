const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, isAdmin } = require('../middlewares/auth');

router.get('/dashboard', authenticateToken, isAdmin, adminController.getDashboardStats);
router.get('/users', authenticateToken, isAdmin, adminController.getUsersList);
router.get('/reports', authenticateToken, isAdmin, adminController.getReports);
router.post('/reports', authenticateToken, adminController.createReport); // Any user can report posts
router.post('/reports/:reportId/resolve', authenticateToken, isAdmin, adminController.resolveReport);
router.post('/users/:userId/ban', authenticateToken, isAdmin, adminController.toggleUserBan);

module.exports = router;
