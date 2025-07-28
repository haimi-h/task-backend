// your-project/routes/recharge.routes.js
const express = require('express');
const router = express.Router();
const rechargeRequestController = require('../controllers/rechargeRequest.controller');
const authenticateToken = require('../middleware/auth.middleware'); // Your existing auth middleware
const adminController = require('../controllers/admin.controller'); // For checkAdminRole middleware

// --- User-facing route for submitting a recharge request ---
// This will be called from the user's RechargePage.
// Requires authentication to get the user ID.
router.post('/submit', authenticateToken, rechargeRequestController.submitRechargeRequest);

// --- Admin-facing routes for managing recharge requests ---
// These require both authentication and admin role.

// Route to get all pending recharge requests
router.get('/admin/pending', authenticateToken, adminController.checkAdminRole, rechargeRequestController.getPendingRechargeRequests);

// Route to approve a recharge request
router.put('/admin/approve/:requestId', authenticateToken, adminController.checkAdminRole, rechargeRequestController.approveRechargeRequest);

// Route to reject a recharge request
router.put('/admin/reject/:requestId', authenticateToken, adminController.checkAdminRole, rechargeRequestController.rejectRechargeRequest);

// Route for users to view their own rejected recharge requests
router.get('/user/rejected', authenticateToken, rechargeRequestController.getUserRejectedRecharges);
router.get(
    '/history/:userId', 
    authenticateToken, 
    adminController.checkAdminRole, 
    rechargeRequestController.getRechargeHistoryForUser
);



module.exports = router;
