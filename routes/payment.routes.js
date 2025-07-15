// payment.routes.js
const express = require('express');
const router = express.Router();
const tronWeb = require('../tron'); // Assuming you have a config folder
const authenticateToken = require('../middleware/auth.middleware'); // Import your auth middleware
const db = require('../models/db'); // Assuming db connection is here or accessible

// Helper function to update user's wallet address in DB (similar to Admin.updateUser)
// You might already have this in a User model (e.g., models/user.model.js)
// If you have a dedicated User model, import it and use its update method.
const updateUserWalletInDB = (userId, walletAddress, privateKey, callback) => {
  const sql = `
    UPDATE users
    SET walletAddress = ?,
        privateKey = ?
    WHERE id = ? AND (walletAddress IS NULL OR walletAddress = ''); -- Only update if not already set
  `;
  db.query(sql, [walletAddress, privateKey, userId], callback);
};

router.get('/generate-address', authenticateToken, async (req, res) => { // ADDED authenticateToken middleware
  try {
    const userId = req.user.id; // Get user ID from authenticated token

    // First, check if the user already has a wallet address assigned in the database
    const [userRows] = await db.promise().query('SELECT walletAddress, privateKey FROM users WHERE id = ?', [userId]);
    const currentUser = userRows[0];

    if (currentUser && currentUser.walletAddress) {
      // If user already has a wallet address, return it
      console.log(`User ${userId} already has wallet: ${currentUser.walletAddress}`);
      return res.json({
        address: currentUser.walletAddress,
        // privateKey: currentUser.privateKey // Do NOT send private key to frontend!
      });
    }

    // If user does NOT have a wallet address, generate a new one
    const account = await tronWeb.createAccount();
    const newWalletAddress = account.address.base58;
    const newPrivateKey = account.privateKey;

    // Store the generated address and private key securely in the user's profile
    updateUserWalletInDB(userId, newWalletAddress, newPrivateKey, (err, result) => {
      if (err) {
        console.error(`Error saving generated wallet for user ${userId}:`, err);
        return res.status(500).json({ error: 'Failed to save generated address to user profile.' });
      }
      console.log(`Generated and assigned new wallet ${newWalletAddress} to user ${userId}.`);
      res.json({
        address: newWalletAddress,
        // privateKey: newPrivateKey // Do NOT send private key to frontend!
      });
    });

  } catch (error) {
    console.error('Failed to generate or retrieve address:', error);
    res.status(500).json({ error: 'Failed to generate or retrieve address' });
  }
});

module.exports = router;
