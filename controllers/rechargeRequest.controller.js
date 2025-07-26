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
      io.to('admins').emit('newRechargeRequest', {
        id: rechargeRequestId,
        userId,
        amount,
        status: 'pending',
        createdAt: new Date(),
      });
    } else {
      console.error('⚠️ Socket.IO instance not found while emitting.');
    }

    res.status(200).json({ message: 'Recharge request submitted successfully.' });
  });
};

// Get all pending recharge requests (admin)
exports.getPendingRechargeRequests = (req, res) => {
  const query = 'SELECT * FROM recharge_requests WHERE status = ?';
  db.query(query, ['pending'], (err, results) => {
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
  const query = 'UPDATE recharge_requests SET status = ? WHERE id = ?';
  db.query(query, ['approved', requestId], (err) => {
    if (err) {
      console.error('Error approving recharge:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json({ message: 'Recharge request approved.' });
  });
};

// Reject a recharge request (admin)
exports.rejectRechargeRequest = (req, res) => {
  const { requestId } = req.params;
  const query = 'UPDATE recharge_requests SET status = ? WHERE id = ?';
  db.query(query, ['rejected', requestId], (err) => {
    if (err) {
      console.error('Error rejecting recharge:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json({ message: 'Recharge request rejected.' });
  });
};

// Get all rejected recharge requests for a user
exports.getUserRejectedRecharges = (req, res) => {
  const userId = req.user.id;
  const query = 'SELECT * FROM recharge_requests WHERE user_id = ? AND status = ?';
  db.query(query, [userId, 'rejected'], (err, results) => {
    if (err) {
      console.error('Error fetching rejected recharges:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    res.status(200).json(results);
  });
};
