// your-project/controllers/rechargeRequest.controller.js

const db = require('../models/db');
const { getIo } = require('../utils/socket');
const RechargeRequest = require('../models/rechargeRequest.model');
const User = require('../models/user.model');

// Submit a new recharge request
exports.submitRechargeRequest = (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;

  const query = 'INSERT INTO recharge_requests (user_id, amount, status) VALUES (?, ?, ?)';
  const values = [userId, amount, 'pending'];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error submitting recharge request:', err);
      return res.status(500).json({ error: 'Database error' });
    }

    const rechargeRequestId = result.insertId;
    const io = getIo(); // Get Socket.IO instance

    if (io) {
      // Fetch user details to include in the emitted event
      // Use db.query directly for non-transactional reads
      db.query('SELECT username, phone FROM users WHERE id = ?', [userId], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching user details for socket emit:', userErr);
          // Don't block the response, just log the error
        }
        const user = userResults && userResults.length > 0 ? userResults[0] : {};

        io.to('admins').emit('newRechargeRequest', {
          id: rechargeRequestId,
          user_id: userId,
          amount: parseFloat(amount),
          status: 'pending',
          username: user.username,
          phone: user.phone,
          timestamp: new Date().toISOString()
        });
      });
    } else {
      console.warn('Socket.IO instance not found for newRechargeRequest.');
    }

    res.status(201).json({ message: 'Recharge request submitted. Please wait for admin approval.', requestId: rechargeRequestId });
  });
};


// Admin approves a recharge request
exports.approveRechargeRequest = (req, res) => {
    const { requestId } = req.params;
    const { admin_notes } = req.body; // Optional notes from admin

    db.getConnection((err, connection) => { // <-- GET CONNECTION FOR TRANSACTION
        if (err) {
            console.error('Error getting DB connection for approveRechargeRequest:', err);
            return res.status(500).json({ message: "Database connection error." });
        }

        connection.beginTransaction(transErr => { // <-- START TRANSACTION ON CONNECTION
            if (transErr) {
                connection.release(); // Release connection on beginTransaction error
                console.error('Error beginning transaction for approveRechargeRequest:', transErr);
                return res.status(500).json({ message: "Failed to begin transaction." });
            }

            // 1. Fetch request with FOR UPDATE lock (using the obtained connection)
            connection.query('SELECT * FROM recharge_requests WHERE id = ? FOR UPDATE', [requestId], (err, requestResults) => {
                if (err) {
                    return connection.rollback(() => { // Rollback on error
                        connection.release(); // Release connection after rollback
                        console.error(`Error finding recharge request ${requestId}:`, err);
                        res.status(500).json({ message: "Failed to find recharge request." });
                    });
                }
                const request = requestResults[0];
                if (!request) {
                    connection.release(); // Release connection if request not found (no transaction needed)
                    return res.status(404).json({ message: "Recharge request not found." });
                }
                if (request.status !== 'pending') {
                    connection.release(); // Release connection if status not pending (no transaction needed)
                    return res.status(400).json({ message: `Recharge request is already ${request.status}.` });
                }

                // 2. Update recharge request status to 'approved' (using the obtained connection implicitly via RechargeRequest.updateStatus)
                // Assuming RechargeRequest.updateStatus uses db.query internally, which will correctly pick up the bound query method
                RechargeRequest.updateStatus(requestId, 'approved', admin_notes, (updateErr, updateResult) => {
                    if (updateErr) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error(`Error approving recharge request ${requestId}:`, updateErr);
                            res.status(500).json({ message: "Failed to approve recharge request." });
                        });
                    }

                    // 3. Update user's wallet balance (using the obtained connection implicitly via User.findById and User.updateWalletBalance)
                    User.findById(request.user_id, (userErr, user) => {
                        if (userErr) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error(`Error finding user ${request.user_id} for recharge approval:`, userErr);
                                res.status(500).json({ message: "Failed to find user for balance update." });
                            });
                        }
                        if (!user) {
                            return connection.rollback(() => {
                                connection.release();
                                res.status(404).json({ message: "User not found for balance update." });
                            });
                        }

                        const newBalance = parseFloat(user.wallet_balance) + parseFloat(request.amount);
                        User.updateWalletBalance(request.user_id, newBalance, (balanceUpdateErr, balanceUpdateResult) => {
                            if (balanceUpdateErr) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error(`Error updating user ${request.user_id} balance for recharge:`, balanceUpdateErr);
                                    res.status(500).json({ message: "Failed to update user balance." });
                                });
                            }

                            // Commit transaction
                            connection.commit(commitErr => { // <-- COMMIT TRANSACTION ON CONNECTION
                                if (commitErr) {
                                    return connection.rollback(() => { // Rollback on commit error
                                        connection.release();
                                        console.error('Error committing transaction for approveRechargeRequest:', commitErr);
                                        res.status(500).json({ message: "Failed to commit transaction." });
                                    });
                                }

                                connection.release(); // <-- RELEASE CONNECTION
                                console.log(`Recharge request ${requestId} approved and user ${request.user_id} balance updated.`);

                                // Emit socket event after successful approval
                                const io = getIo();
                                if (io) {
                                    io.to(`user-${request.user_id}`).emit('rechargeApproved', {
                                        requestId: request.id,
                                        amount: request.amount,
                                        currency: request.currency, // Assuming currency is in the request object
                                        newBalance: newBalance,
                                        admin_notes
                                    });
                                } else {
                                    console.warn('Socket.IO instance not found for rechargeApproved.');
                                }

                                res.status(200).json({ message: "Recharge request approved and balance updated." });
                            });
                        });
                    });
                });
            });
        });
    });
};

// Admin rejects a recharge request
exports.rejectRechargeRequest = (req, res) => {
    const { requestId } = req.params;
    const { admin_notes } = req.body; // Optional notes from admin

    db.getConnection((err, connection) => { // <-- GET CONNECTION FOR TRANSACTION
        if (err) {
            console.error('Error getting DB connection for rejectRechargeRequest:', err);
            return res.status(500).json({ message: "Database connection error." });
        }

        connection.beginTransaction(transErr => { // <-- START TRANSACTION ON CONNECTION
            if (transErr) {
                connection.release(); // Release connection on beginTransaction error
                console.error('Error beginning transaction for rejectRechargeRequest:', transErr);
                return res.status(500).json({ message: "Failed to begin transaction." });
            }

            // Fetch request with FOR UPDATE lock (using the obtained connection)
            connection.query('SELECT * FROM recharge_requests WHERE id = ? FOR UPDATE', [requestId], (err, requestResults) => {
                if (err) {
                    return connection.rollback(() => {
                        connection.release();
                        console.error(`Error finding recharge request ${requestId}:`, err);
                        res.status(500).json({ message: "Failed to find recharge request." });
                    });
                }
                const request = requestResults[0];
                if (!request) {
                    connection.release();
                    return res.status(404).json({ message: "Recharge request not found." });
                }
                if (request.status !== 'pending') {
                    connection.release();
                    return res.status(400).json({ message: `Recharge request is already ${request.status}.` });
                }

                // Update recharge request status to 'rejected' (using the obtained connection implicitly)
                RechargeRequest.updateStatus(requestId, 'rejected', admin_notes, (updateErr) => {
                    if (updateErr) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error(`Error rejecting recharge request ${requestId}:`, updateErr);
                            res.status(500).json({ message: "Failed to reject recharge request." });
                        });
                    }

                    connection.commit(commitErr => { // <-- COMMIT TRANSACTION ON CONNECTION
                        if (commitErr) {
                            return connection.rollback(() => {
                                connection.release();
                                console.error('Error committing transaction for rejectRechargeRequest:', commitErr);
                                res.status(500).json({ message: "Failed to commit transaction." });
                            });
                        }

                        connection.release(); // <-- RELEASE CONNECTION
                        console.log(`Recharge request ${requestId} rejected.`);

                        const io = getIo();
                        if (io) {
                            io.to(`user-${request.user_id}`).emit('rechargeRejected', {
                                requestId: request.id,
                                amount: request.amount,
                                currency: request.currency, // Assuming currency is in the request object
                                admin_notes
                            });
                        } else {
                            console.warn('Socket.IO instance not found for rechargeRejected.');
                        }

                        res.status(200).json({ message: "Recharge request rejected." });
                    });
                });
            });
        });
    });
};

// Fetches all pending recharge requests for admin review
exports.getPendingRechargeRequests = (req, res) => {
  RechargeRequest.getPendingRequests((err, requests) => {
    if (err) {
      console.error("Error fetching pending recharge requests:", err);
      return res.status(500).json({ message: "Failed to fetch pending recharge requests.", error: err.message });
    }
    res.status(200).json({ requests });
  });
};

// Fetches a user's rejected recharge requests
exports.getUserRejectedRecharges = (req, res) => {
  const userId = req.user.id;

  RechargeRequest.getRequestsByUserId(userId, 'rejected', (err, requests) => {
    if (err) {
      console.error("Error fetching user's rejected recharges:", err);
      return res.status(500).json({ message: "Failed to fetch rejected recharges." });
    }
    res.status(200).json({ rejectedRecharges: requests });
  });
};

exports.getRechargeHistoryForUser = (req, res) => {
    const { userId } = req.params; // Get userId from URL params
    const authUserId = req.user.id; // User ID from authenticated token

    // Optional: Add a check if the authenticated user is an admin
    // If not admin, ensure userId matches authUserId for security
    if (req.user.role !== 'admin' && parseInt(userId) !== authUserId) {
        return res.status(403).json({ message: "Access denied. You can only view your own recharge history." });
    }

    RechargeRequest.getRequestsByUserId(userId, null, (err, requests) => { // Null for status to get all
        if (err) {
            console.error(`Error fetching recharge history for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to fetch recharge history." });
        }
        res.status(200).json({ rechargeHistory: requests });
    });
};