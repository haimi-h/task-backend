const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller'); // Ensure path is correct
const authenticateToken = require('../middleware/auth.middleware'); // Your existing auth middleware

// All admin routes will first go through authenticateToken to verify JWT
// Then, they will go through adminController.checkAdminRole to ensure the user is an admin.

// Route to get all users for the admin table
router.get('/users', authenticateToken, adminController.checkAdminRole, adminController.getAllUsers);

// Route to update a user's daily orders (for the "APPLY" functionality)
// Example: PUT /api/admin/users/:userId
router.put('/users/:userId', authenticateToken, adminController.checkAdminRole, adminController.updateUserDailyOrders);

// Route to inject (add) funds to a user's wallet balance
// Example: POST /api/admin/users/inject/:userId
router.post('/users/inject/:userId', authenticateToken, adminController.checkAdminRole, adminController.injectWallet);

// You can add more admin routes here as you implement more admin features
// e.g., router.delete('/users/:userId', authenticateToken, adminController.checkAdminRole, adminController.deleteUser);
// e.g., router.get('/users/:userId', authenticateToken, adminController.checkAdminRole, adminController.getSingleUser);

module.exports = router;