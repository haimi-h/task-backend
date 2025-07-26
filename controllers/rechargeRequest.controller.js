// your-project/controllers/rechargeRequest.controller.js
const RechargeRequest = require('../models/rechargeRequest.model');
const User = require('../models/user.model'); // To update user wallet balance
const { io } = require('../server'); // FIX: Correctly import io instance from server.js

// IMPORTANT: For image upload, you'll need a file storage solution (e.g., Multer + Cloudinary/AWS S3).
// For now, we'll assume `receipt_image_url` is provided directly or handled by a middleware.
// For WhatsApp, you'll need a WhatsApp API (e.g., Twilio, MessageBird, or a custom solution).
// This controller will focus on the database logic and API endpoints.

/**
 * User submits a new recharge request.
 * This endpoint will be called from the user's RechargePage.
 * Expects: { amount, currency, receipt_image_url, whatsapp_number } in req.body
 */
exports.submitRechargeRequest = (req, res) => {
    const userId = req.user.id; // Get user ID from authenticated token
    const { amount, currency, receipt_image_url, whatsapp_number } = req.body;

    if (!userId || !amount || !currency || !receipt_image_url || !whatsapp_number) {
        return res.status(400).json({ message: "All fields (amount, currency, receipt_image_url, whatsapp_number) are required." });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number." });
    }

    RechargeRequest.create(userId, parseFloat(amount), currency, receipt_image_url, whatsapp_number, (err, result) => {
        if (err) {
            console.error('Error submitting recharge request:', err);
            return res.status(500).json({ message: "Failed to submit recharge request.", error: err.message });
        }
        
        // Notify admins in real-time about a new pending request
        // Ensure io is defined before using it
        if (io) {
            io.to('admins').emit('newRechargeRequest', {
                id: result.insertId,
                user_id: userId,
                amount: parseFloat(amount),
                currency,
                receipt_image_url,
                whatsapp_number,
                status: 'pending',
                created_at: new Date().toISOString()
            });
        } else {
            console.warn("Socket.IO 'io' instance not available. Cannot emit 'newRechargeRequest' event.");
        }

        res.status(201).json({ message: "Recharge request submitted successfully. Awaiting admin approval." });
    });
};

/**
 * Admin fetches all pending recharge requests.
 * This will populate the "Pass/Reject" table on the admin panel.
 * Protected by checkAdminRole middleware.
 */
exports.getPendingRechargeRequests = (req, res) => {
    RechargeRequest.getPendingRequests((err, requests) => {
        if (err) {
            console.error('Error fetching pending recharge requests:', err);
            return res.status(500).json({ message: "Failed to fetch pending recharge requests.", error: err.message });
        }
        res.status(200).json(requests);
    });
};

/**
 * Admin approves a recharge request.
 * This will credit the user's wallet and mark the request as 'approved'.
 * Protected by checkAdminRole middleware.
 * Expects: { admin_notes } in req.body
 */
exports.approveRechargeRequest = (req, res) => {
    const { requestId } = req.params;
    const { admin_notes } = req.body; // Optional notes from admin

    RechargeRequest.findById(requestId, (err, request) => {
        if (err) {
            console.error(`Error finding recharge request ${requestId}:`, err);
            return res.status(500).json({ message: "Failed to process request." });
        }
        if (!request) {
            return res.status(404).json({ message: "Recharge request not found." });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ message: `Recharge request is already ${request.status}.` });
        }

        // 1. Update recharge request status to 'approved'
        RechargeRequest.updateStatus(requestId, 'approved', admin_notes, (updateErr) => {
            if (updateErr) {
                console.error(`Error updating recharge request status to approved for ${requestId}:`, updateErr);
                return res.status(500).json({ message: "Failed to approve recharge request status." });
            }

            // 2. Credit user's wallet balance
            User.updateWalletBalance(request.user_id, request.amount, 'add', (walletErr) => {
                if (walletErr) {
                    console.error(`Error crediting wallet for user ${request.user_id} after recharge approval:`, walletErr);
                    // IMPORTANT: If wallet update fails, you might want to revert the status or log for manual intervention
                    return res.status(500).json({ message: "Recharge approved, but failed to credit user wallet. Manual intervention required.", error: walletErr.message });
                }

                // Notify user (via Socket.IO) that their recharge has been approved
                if (io) {
                    io.to(`user-${request.user_id}`).emit('rechargeApproved', {
                        requestId: request.id,
                        amount: request.amount,
                        currency: request.currency
                    });
                } else {
                    console.warn("Socket.IO 'io' instance not available. Cannot emit 'rechargeApproved' event.");
                }

                res.status(200).json({ message: "Recharge request approved and user wallet credited." });
            });
        });
    });
};

/**
 * Admin rejects a recharge request.
 * This will mark the request as 'rejected'.
 * Protected by checkAdminRole middleware.
 * Expects: { admin_notes } in req.body
 */
exports.rejectRechargeRequest = (req, res) => {
    const { requestId } = req.params;
    const { admin_notes } = req.body; // Notes for rejection reason

    RechargeRequest.findById(requestId, (err, request) => {
        if (err) {
            console.error(`Error finding recharge request ${requestId}:`, err);
            return res.status(500).json({ message: "Failed to process request." });
        }
        if (!request) {
            return res.status(404).json({ message: "Recharge request not found." });
        }
        if (request.status !== 'pending') {
            return res.status(400).json({ message: `Recharge request is already ${request.status}.` });
        }

        RechargeRequest.updateStatus(requestId, 'rejected', admin_notes, (updateErr) => {
            if (updateErr) {
                console.error(`Error updating recharge request status to rejected for ${requestId}:`, updateErr);
                return res.status(500).json({ message: "Failed to reject recharge request status." });
            }

            // Notify user (via Socket.IO) that their recharge has been rejected
            if (io) {
                io.to(`user-${request.user_id}`).emit('rechargeRejected', {
                    requestId: request.id,
                    amount: request.amount,
                    currency: request.currency,
                    admin_notes: admin_notes
                });
            } else {
                console.warn("Socket.IO 'io' instance not available. Cannot emit 'rechargeRejected' event.");
            }

            res.status(200).json({ message: "Recharge request rejected." });
        });
    });
};

/**
 * NEW: Fetches a user's rejected recharge requests.
 * This will be used on the user's tasking page or a dedicated history page.
 * Protected by authenticateToken middleware.
 */
exports.getUserRejectedRecharges = (req, res) => {
    const userId = req.user.id; // Get user ID from authenticated token

    RechargeRequest.getRequestsByUserId(userId, 'rejected', (err, requests) => {
        if (err) {
            console.error('Error fetching user rejected recharge requests:', err);
            return res.status(500).json({ message: "Failed to fetch rejected recharge requests.", error: err.message });
        }
        res.status(200).json(requests);
    });
};
