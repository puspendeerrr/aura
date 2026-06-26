const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// Room / Sidebar endpoints
router.get('/rooms', authenticateToken, chatController.getRooms);
router.get('/rooms/:roomId/messages', authenticateToken, chatController.getMessages);
router.post('/rooms/create', authenticateToken, chatController.createRoom);

// Group management endpoints
router.post('/groups/create', authenticateToken, chatController.createGroup);
router.post('/groups/:roomId/add-members', authenticateToken, chatController.addGroupMembers);
router.post('/groups/:roomId/remove-member', authenticateToken, chatController.removeGroupMember);
router.post('/groups/:roomId/promote', authenticateToken, chatController.promoteGroupAdmin);

// Room custom toggles (Pin, Archive, Mute)
router.post('/rooms/:roomId/pin', authenticateToken, chatController.togglePinRoom);
router.post('/rooms/:roomId/archive', authenticateToken, chatController.toggleArchiveRoom);
router.post('/rooms/:roomId/mute', authenticateToken, chatController.toggleMuteRoom);

// Media Upload REST API
router.post('/rooms/:roomId/upload-media', authenticateToken, upload.array('media', 10), chatController.uploadMedia);

// Message searching
router.get('/rooms/:roomId/search', authenticateToken, chatController.searchMessages);

// Message single operations (Delete, Pin, View-once)
router.delete('/messages/:messageId/me', authenticateToken, chatController.deleteMessageForMe);
router.delete('/messages/:messageId/everyone', authenticateToken, chatController.deleteMessageForEveryone);
router.post('/messages/:messageId/pin', authenticateToken, chatController.togglePinMessage);
router.post('/messages/:messageId/view-once', authenticateToken, chatController.viewOnceMessage);

module.exports = router;

