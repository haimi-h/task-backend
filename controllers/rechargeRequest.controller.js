// controllers/rechargeRequest.controller.js
const db = require('../models/db');
const { getIo } = require('../utils/socket');
const RechargeRequest = require('../models/rechargeRequest.model');
const User = require('../models/user.model');
// const axios = require('axios'); // Removed, as we no longer need to fetch crypto prices for conversion

// Submit a new recharge request
exports.submitRechargeRequest = (req, res) => {
  const { amount, currency } = req.body; // Ensure currency is received
  const userId = req.user.id;

  // The create function in rechargeRequest.model.js already takes currency
  RechargeRequest.create(userId, amount, currency, null, null, (err, result) => {
    if (err) {
      console.error('Error submitting recharge request:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    const rechargeRequestId = result.insertId;
    const io = getIo(); // ✅ Socket reference

    if (io) {
      // Fetch user details to include in the emitted event
      db.query('SELECT username, phone FROM users WHERE id = ?', [userId], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching user details for socket emit:', userErr);
        }
        const user = userResults && userResults.length > 0 ? userResults[0] : {};

        io.to('admins').emit('newRechargeRequest', {
          id: rechargeRequestId,
          userId,
          username: user.username,
          phone: user.phone,
          amount,
          currency, // Include currency in the socket emit
          status: 'pending',
          createdAt: new Date(),
        });
      });
    } else {
      console.error('⚠️ Socket.IO instance not found while emitting.');
    }

    res.status(200).json({ message: 'Recharge request submitted successfully.' });
  });
};

// Get all pending recharge requests (admin)
exports.getPendingRechargeRequests = (req, res) => {
  const query = `
    SELECT 
        rr.id,
        rr.user_id,
        u.username,
        u.phone,
        rr.amount,
        rr.currency,
        rr.receipt_image_url,
        rr.status,
        rr.admin_notes,
        rr.created_at,
        rr.updated_at
    FROM 
        recharge_requests rr
    JOIN 
        users u ON rr.user_id = u.id
    WHERE 
        rr.status = 'pending'
    ORDER BY 
        rr.created_at DESC;
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching pending recharges:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json(results);
  });
};

exports.getRechargeHistoryForUser = (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ message: "User ID is required." });
  }

  RechargeRequest.getHistoryByUserId(userId, (err, requests) => {
    if (err) {
      console.error(`Error fetching recharge history for user ${userId}:`, err);
      return res.status(500).json({ message: "Failed to fetch recharge history." });
    }
    // The model will return an array of requests, which is exactly what the frontend expects.
    res.status(200).json(requests);
  });
};

// Approve a recharge request (admin)
exports.approveRechargeRequest = (req, res) => {
  const { requestId } = req.params;
  const { admin_notes } = req.body;

  RechargeRequest.findById(requestId, (err, request) => {
    if (err) {
      console.error(`Error finding recharge request ${requestId}:`, err);
      return res.status(500).json({ message: "Failed to find recharge request." });
    }
    if (!request) {
      return res.status(404).json({ message: "Recharge request not found." });
    }

    // Ensure the request is pending before processing
    if (request.status !== 'pending') {
      return res.status(400).json({ message: 'Recharge request is not pending.' });
    }

    db.beginTransaction(transErr => {
      if (transErr) {
        console.error("Error starting transaction:", transErr);
        return res.status(500).json({ message: "Database transaction error." });
      }

      // Determine the amount and currency to credit
      let amountToCredit = parseFloat(request.amount);
      const requestCurrency = request.currency; // This will be 'USD' from RechargePage.js

      // --- MODIFIED: Removed USD to TRX conversion logic ---
      // The amount will now be credited directly as USD to the wallet_balance.
      const processApproval = async () => { // Kept async for consistency, though no longer strictly needed for price fetch
        try {
          // Removed: if (requestCurrency === 'USD') { ... conversion logic ... }
          // The amountToCredit is already in USD as sent from the frontend.

          // Update the recharge request status to 'approved'
          RechargeRequest.updateStatus(requestId, 'approved', admin_notes, (updateErr) => {
            if (updateErr) {
              return db.rollback(() => {
                console.error(`Error updating status for ${requestId}:`, updateErr);
                res.status(500).json({ message: "Failed to approve recharge request status." });
              });
            }

            // Update user's wallet balance with the USD amount
            User.updateWalletBalance(request.user_id, amountToCredit, 'add', (userUpdateErr) => {
              if (userUpdateErr) {
                return db.rollback(() => {
                  console.error(`Error updating user wallet:`, userUpdateErr);
                  res.status(500).json({ message: "Recharge approved, but failed to update wallet." });
                });
              }

              db.commit(commitErr => {
                if (commitErr) {
                  return db.rollback(() => {
                    console.error("Commit error:", commitErr);
                    res.status(500).json({ message: "Failed to commit recharge approval." });
                  });
                }

                const io = getIo();
                if (io) {
                  io.to(`user-${request.user_id}`).emit('rechargeApproved', {
                    requestId: request.id,
                    amount: amountToCredit, // Emit the USD amount
                    currency: 'USD', // Emit the currency as USD
                    admin_notes
                  });
                } else {
                  console.warn('Socket.IO not available for rechargeApproved.');
                }

                res.status(200).json({ message: "Recharge request approved and wallet credited." });
              });
            });
          });
        } catch (error) { // Catch any remaining errors in the approval process
          db.rollback(() => {
            console.error('Error during recharge approval:', error);
            res.status(500).json({ message: error.message || 'Failed to process recharge approval.' });
          });
        }
      };

      processApproval(); // Call the async function
    });
  });
};

// Reject a recharge request (admin)
exports.rejectRechargeRequest = (req, res) => {
  const { requestId } = req.params;
  const { admin_notes } = req.body;

  RechargeRequest.findById(requestId, (err, request) => {
    if (err) {
      console.error(`Error finding recharge request ${requestId}:`, err);
      return res.status(500).json({ message: "Failed to find recharge request." });
    }
    if (!request) {
      return res.status(404).json({ message: "Recharge request not found." });
    }

    RechargeRequest.updateStatus(requestId, 'rejected', admin_notes, (updateErr) => {
      if (updateErr) {
        console.error(`Error rejecting recharge request ${requestId}:`, updateErr);
        return res.status(500).json({ message: "Failed to reject recharge request." });
      }

      const io = getIo(); // ✅ FIXED: Ensure we get the socket instance
      if (io) {
        io.to(`user-${request.user_id}`).emit('rechargeRejected', {
          requestId: request.id,
          amount: request.amount,
          currency: request.currency,
          admin_notes
        });
      } else {
        console.warn('Socket.IO instance not found for rechargeRejected.');
      }

      res.status(200).json({ message: "Recharge request rejected." });
    });
  });
};

// Fetches a user's rejected recharge requests
exports.getUserRejectedRecharges = (req, res) => {
  const userId = req.user.id;

  RechargeRequest.getRequestsByUserId(userId, 'rejected', (err, requests) => {
    if (err) {
      console.error('Error fetching rejected recharge requests:', err);
      return res.status(500).json({ message: "Failed to fetch rejected recharge requests.", error: err.message });
    }
    res.status(200).json({ requests });
  });
};
