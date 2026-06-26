const express = require('express');
const router = express.Router();
const storyController = require('../controllers/storyController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post('/', authenticateToken, upload.single('media'), storyController.createStory);
router.get('/feed', authenticateToken, storyController.getStoriesFeed);
router.post('/:storyId/view', authenticateToken, storyController.viewStory);
router.get('/:storyId/viewers', authenticateToken, storyController.getStoryViewers);

module.exports = router;
