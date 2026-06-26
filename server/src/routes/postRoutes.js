const express = require('express');
const router = express.Router();
const postController = require('../controllers/postController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// Base posts operations
router.post('/', authenticateToken, upload.array('media', 10), postController.createPost);
router.get('/feed', authenticateToken, postController.getFeed);
router.get('/explore', authenticateToken, postController.getExplore);
router.get('/saved', authenticateToken, postController.getSavedPosts);

// Search endpoint
router.get('/search/users', authenticateToken, postController.searchUsers);
router.get('/search/posts', authenticateToken, postController.searchPosts);

// Single post operations
router.get('/:postId', authenticateToken, postController.getPostDetails);
router.put('/:postId', authenticateToken, postController.updatePost);
router.delete('/:postId', authenticateToken, postController.deletePost);
router.post('/:postId/like', authenticateToken, postController.toggleLike);
router.post('/:postId/comment', authenticateToken, postController.addComment);
router.post('/:postId/save', authenticateToken, postController.toggleSave);

module.exports = router;
