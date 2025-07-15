// your-project/routes/user.routes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller'); // Ensure this path is correct
const authenticateToken = require('../middleware/auth.middleware'); // Ensure this path is correct

// Route to get a user's own profile data (existing route)
// This route requires authentication
router.get('/profile', authenticateToken, userController.getUserProfile);

// Route to get a user's list of referred users (existing route)
// This route also requires authentication
router.get('/my-referrals', authenticateToken, userController.getMyReferrals);

// ADDED: Route to get the profile of the currently logged-in user
// This route will be used by the ChatWidget to fetch the user's wallet address.
router.get('/me', authenticateToken, userController.getLoggedInUser);

module.exports = router;
