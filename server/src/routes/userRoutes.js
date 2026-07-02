const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.get('/profile/:username', authenticateToken, userController.getProfile);
router.put('/profile', authenticateToken, upload.single('avatar'), userController.updateProfile);
router.post('/follow/:userId', authenticateToken, userController.toggleFollow);
router.get('/follow-requests', authenticateToken, userController.getFollowRequests);
router.post('/follow-requests/:followerId', authenticateToken, userController.respondToFollowRequest);
router.get('/suggested', authenticateToken, userController.getSuggestedCreators);
router.get('/profile/:username/followers', authenticateToken, userController.getFollowersList);
router.get('/profile/:username/following', authenticateToken, userController.getFollowingList);
router.get('/profile/:username/mutual', authenticateToken, userController.getMutualFollowersList);
router.post('/change-password', authenticateToken, userController.changePassword);
router.delete('/delete-account', authenticateToken, userController.deleteAccount);

module.exports = router;
