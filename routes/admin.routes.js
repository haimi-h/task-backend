const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller'); // Ensure path is correct
const authenticateToken = require('../middleware/auth.middleware'); // Your existing auth middleware

// All admin routes will first go through authenticateToken to verify JWT
// Then, they will go through adminController.checkAdminRole to ensure the user is an admin.

// Route to get all users for the admin table
router.get('/users', authenticateToken, adminController.checkAdminRole, adminController.getAllUsers);

// Route to update a user's daily orders (for the "APPLY" functionality)
// MODIFIED: Changed the route path to match the frontend's call
router.put('/users/:userId/daily-orders', authenticateToken, adminController.checkAdminRole, adminController.updateUserDailyOrders);

// Route to inject (add) funds to a user's wallet balance
// Example: POST /api/admin/users/inject/:userId
router.post('/users/inject/:userId', authenticateToken, adminController.checkAdminRole, adminController.injectWallet);

// Route to update a user's full profile (including wallet address and password)
// This will be called by the SettingModal
router.put('/users/:userId/profile', authenticateToken, adminController.checkAdminRole, adminController.updateUserProfile);

// Route to generate and assign a new wallet address to a specific user
// This will be called from the frontend when a user needs a wallet address assigned.
router.post('/users/:userId/generate-wallet', authenticateToken, adminController.checkAdminRole, adminController.generateAndAssignWallet);

// ADDED: Route to delete a user by ID
// This will be called by the UserTable when deleting selected users.
router.delete('/users/:userId', authenticateToken, adminController.checkAdminRole, adminController.deleteUser);

module.exports = router;
