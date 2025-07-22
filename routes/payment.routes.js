const express = require('express');
const router = express.Router();
const tronWeb = require('../tron'); // Assuming you have a config folder
const authenticateToken = require('../middleware/auth.middleware'); // Import your auth middleware
const db = require('../models/db'); // Assuming db connection is here or accessible

// Helper function to update user's wallet address in DB. This is okay here.
const updateUserWalletInDB = (userId, walletAddress, privateKey, callback) => {
  const sql = `
    UPDATE users
    SET walletAddress = ?,
        privateKey = ?
    WHERE id = ? AND (walletAddress IS NULL OR walletAddress = ''); -- Only update if not already set
  `;
  db.query(sql, [walletAddress, privateKey, userId], callback);
};

// --- Your Existing and Correct /generate-address Route ---
router.get('/generate-address', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from authenticated token

    // First, check if the user already has a wallet address
    const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
    const currentUser = userRows[0];

    if (currentUser && currentUser.walletAddress) {
      // If user already has a wallet address, return it
      console.log(`User ${userId} already has wallet: ${currentUser.walletAddress}`);
      return res.json({
        address: currentUser.walletAddress,
      });
    }

    // If not, generate a new one
    const account = await tronWeb.createAccount();
    const newWalletAddress = account.address.base58;
    const newPrivateKey = account.privateKey;

    // Store the generated address and private key
    updateUserWalletInDB(userId, newWalletAddress, newPrivateKey, (err, result) => {
      if (err) {
        console.error(`Error saving generated wallet for user ${userId}:`, err);
        return res.status(500).json({ error: 'Failed to save generated address to user profile.' });
      }
      console.log(`Generated and assigned new wallet ${newWalletAddress} to user ${userId}.`);
      res.json({
        address: newWalletAddress,
      });
    });

  } catch (error) {
    console.error('Failed to generate or retrieve address:', error);
    res.status(500).json({ error: 'Failed to generate or retrieve address' });
  }
});


// --- NEW: Endpoint to Initiate a Recharge Request ---
// This is the new section that handles the recharge button press from the frontend.
router.post('/recharge', authenticateToken, async (req, res) => {
  const { amount, paymentMethod } = req.body; // e.g., amount: 100, paymentMethod: 'TRX'
  const userId = req.user.id;

  // Basic validation
  const numericAmount = parseFloat(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: 'Invalid amount provided.' });
  }

  try {
    // 1. Get the user's dedicated deposit address from the users table
    const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
    const user = userRows[0];

    if (!user || !user.walletAddress) {
      return res.status(404).json({ message: 'User wallet address not found. Please generate an address first.' });
    }

    const depositAddress = user.walletAddress;

    // 2. Create a record in the 'recharge_transactions' table
    // IMPORTANT: Make sure you have created this table in your database.
    const insertSql = `
      INSERT INTO recharge_transactions (user_id, amount_expected, currency, to_address, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    await db.promise().query(insertSql, [userId, numericAmount, paymentMethod, depositAddress, 'pending']);
    
    console.log(`[Recharge] Created pending transaction for user ${userId} of ${numericAmount} ${paymentMethod} to address ${depositAddress}`);

    // 3. Send the deposit details back to the frontend
    res.status(200).json({
      message: 'Recharge initiated. Please send funds to the provided address.',
      depositAddress: depositAddress,
      amount: numericAmount,
      currency: paymentMethod,
    });

  } catch (error) {
    console.error(`[Recharge] Error initiating recharge for user ${userId}:`, error);
    res.status(500).json({ message: 'Server error while initiating recharge.' });
  }
});


module.exports = router;