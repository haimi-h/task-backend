// routes/chat.routes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chat.controller'); // Import the chat controller
const authenticateToken = require('../middleware/auth.middleware'); // Your existing auth middleware
const adminController = require('../controllers/admin.controller'); // Import adminController for checkAdminRole
const upload = require('../middleware/upload.middleware');

// Route for sending a message (accessible by both users and admins)
// Requires authentication to identify sender and their role
router.post('/messages', authenticateToken, chatController.sendMessage);

//route for sending images
router.post('/messages/image', authenticateToken, upload.single('image'), chatController.sendImageMessage);

// Route for fetching messages for a specific user's conversation
// Accessible by the user themselves or by an admin
router.get('/messages/:userId', authenticateToken, chatController.getMessages);

// Route for admins to get a list of users with unread messages
// Requires authentication and admin role check
router.get('/unread-conversations', authenticateToken, adminController.checkAdminRole, chatController.getUsersWithUnreadMessages);


module.exports = router;
