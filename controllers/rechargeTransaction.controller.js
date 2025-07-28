// controllers/rechargeHistory.controller.js
const db = require('../models/db'); // Assuming this path correctly points to your database connection/pool

/**
 * Fetches all recharge transactions for a specific user.
 * This function is intended to be used by the frontend (e.g., HistoryModal).
 * @param {object} req - Express request object.
 * @param {object} res - Express response object.
 */
exports.getRechargeHistory = (req, res) => {
  // Get the user ID from the request parameters (e.g., /api/recharge/history/:userId)
  const { userId } = req.params;

  // You might want to add authentication/authorization middleware before this controller
  // to ensure only the authenticated user or an admin can view this history.
  // For example, if req.user.id is the authenticated user's ID:
  // if (req.user.id !== parseInt(userId, 10) && req.user.role !== 'admin') {
  //   return res.status(403).json({ message: 'Access denied. You can only view your own history.' });
  // }

  // SQL query to select all columns from recharge_transactions for a given user_id
  const query = `
    SELECT 
        id,
        user_id,
        transaction_id,
        amount,
        currency,
        status,
        address,
        txid,
        created_at,
        updated_at
    FROM 
        recharge_transactions
    WHERE 
        user_id = ?
    ORDER BY 
        created_at DESC; -- Order by most recent first
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Error fetching recharge history for user:', userId, err);
      return res.status(500).json({ message: 'Failed to retrieve recharge history.', error: err.message });
    }
    // Send the fetched transactions as a JSON array
    res.status(200).json(results);
  });
};
