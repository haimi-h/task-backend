// routes/recharge.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware'); // Assuming you have an auth middleware

// Import the new recharge history controller
const rechargeHistoryController = require('../controllers/rechargeHistory.controller');

// Import your existing recharge request controller if it's separate
// const rechargeRequestController = require('../controllers/rechargeRequest.controller');

// Route to get recharge history for a specific user
// This will be called by your HistoryModal: /api/recharge/history/:userId
router.get('/history/:userId', authMiddleware, rechargeHistoryController.getRechargeHistory);

// Example of how to include other recharge-related routes if they are in a separate controller
// router.post('/submit', authMiddleware, rechargeRequestController.submitRechargeRequest);
// router.get('/pending', authMiddleware, adminMiddleware, rechargeRequestController.getPendingRechargeRequests);
// router.put('/approve/:requestId', authMiddleware, adminMiddleware, rechargeRequestController.approveRechargeRequest);
// router.put('/reject/:requestId', authMiddleware, adminMiddleware, rechargeRequestController.rejectRechargeRequest);
// router.get('/rejected/:userId', authMiddleware, rechargeRequestController.getUserRejectedRecharges);


module.exports = router;
