// your-project/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller'); // Ensure this path is correct
const authenticateToken = require('../middleware/auth.middleware'); // Ensure this path is correct

// Route to get a user's own profile data
// This route requires authentication
router.get('/profile', authenticateToken, userController.getUserProfile);

// Route to get a user's list of referred users
// This route also requires authentication
router.get('/my-referrals', authenticateToken, userController.getMyReferrals);

module.exports = router;