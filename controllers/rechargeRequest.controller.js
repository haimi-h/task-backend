// controllers/rechargeRequest.controller.js
const db = require('../models/db');
const { getIo } = require('../utils/socket');

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
    const io = getIo(); // ✅ Socket reference

    if (io) {
      // Fetch user details to include in the emitted event
      db.query('SELECT username, phone FROM users WHERE id = ?', [userId], (userErr, userResults) => {
        if (userErr) {
          console.error('Error fetching user details for socket emit:', userErr);
          // Continue without user details if there's an error fetching them
        }
        const user = userResults && userResults.length > 0 ? userResults[0] : {};

        io.to('admins').emit('newRechargeRequest', {
          id: rechargeRequestId,
          userId,
          username: user.username, // Include username
          phone: user.phone,       // Include phone
          amount,
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
        u.username,  -- Added username
        u.phone,     -- Added phone
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

// Approve a recharge request (admin)
exports.approveRechargeRequest = (req, res) => {
  const { requestId } = req.params;
  const { admin_notes } = req.body; // Assuming admin_notes can be sent in the body

  RechargeRequest.findById(requestId, (err, request) => {
    if (err) {
      console.error(`Error finding recharge request ${requestId}:`, err);
      return res.status(500).json({ message: "Failed to find recharge request." });
    }
    if (!request) {
      return res.status(404).json({ message: "Recharge request not found." });
    }

    // Start a database transaction
    db.beginTransaction(transErr => {
      if (transErr) {
        console.error("Error starting transaction for approveRechargeRequest:", transErr);
        return res.status(500).json({ message: "Database transaction error." });
      }

      RechargeRequest.updateStatus(requestId, 'approved', admin_notes, (updateErr) => {
        if (updateErr) {
          return db.rollback(() => {
            console.error(`Error updating recharge request status to approved for ${requestId}:`, updateErr);
            res.status(500).json({ message: "Failed to approve recharge request status." });
          });
        }

        // Only update user's wallet balance if the recharge request was successfully approved
        User.updateWalletBalance(request.user_id, request.amount, 'add', (userUpdateErr) => {
          if (userUpdateErr) {
            return db.rollback(() => {
              console.error(`Error updating user wallet balance for user ${request.user_id}:`, userUpdateErr);
              res.status(500).json({ message: "Recharge approved, but failed to update user wallet balance." });
            });
          }

          db.commit(commitErr => {
            if (commitErr) {
              return db.rollback(() => {
                console.error("Error committing transaction for approveRechargeRequest:", commitErr);
                res.status(500).json({ message: "Failed to commit recharge approval." });
              });
            }

            const io = getIo(); // Get the Socket.IO instance
            if (io) {
              io.to(`user-${request.user_id}`).emit('rechargeApproved', {
                requestId: request.id,
                amount: request.amount,
                currency: request.currency,
                admin_notes: admin_notes
              });
            } else {
              console.warn('Socket.IO instance not found for rechargeApproved emit.');
            }

            res.status(200).json({ message: "Recharge request approved and wallet credited." });
          });
        });
      });
    });
  });
};

// Reject a recharge request (admin)
exports.rejectRechargeRequest = (req, res) => {
  const { requestId } = req.params;
  const { admin_notes } = req.body; // Optional: reason for rejection

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
            console.error(`Error updating recharge request status to rejected for ${requestId}:`, updateErr);
            return res.status(500).json({ message: "Failed to reject recharge request status." });
        }

        // Notify user (via Socket.IO) that their recharge has been rejected
        io.to(`user-${request.user_id}`).emit('rechargeRejected', {
            requestId: request.id,
            amount: request.amount,
            currency: request.currency,
            admin_notes: admin_notes
        });

        res.status(200).json({ message: "Recharge request rejected." });
    });
});
}
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
        res.status(200).json({ requests });
    });
};