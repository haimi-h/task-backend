const express = require('express');
const router = express.Router();
const tronWeb = require('../tron');
const authenticateToken = require('../middleware/auth.middleware');
const db = require('../models/db');
const axios = require('axios'); // <-- IMPORT AXIOS

// Your existing helper function and /generate-address route are still fine...
const updateUserWalletInDB = (userId, walletAddress, privateKey, callback) => {
    const sql = `
      UPDATE users
      SET walletAddress = ?,
          privateKey = ?
      WHERE id = ? AND (walletAddress IS NULL OR walletAddress = '');
    `;
    db.query(sql, [walletAddress, privateKey, userId], callback);
  };
  
router.get('/generate-address', authenticateToken, async (req, res) => {
    // ... no changes needed in this route
    try {
        const userId = req.user.id;
        const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
        const currentUser = userRows[0];
        if (currentUser && currentUser.walletAddress) {
          return res.json({ address: currentUser.walletAddress });
        }
        const account = await tronWeb.createAccount();
        const newWalletAddress = account.address.base58;
        const newPrivateKey = account.privateKey;
        updateUserWalletInDB(userId, newWalletAddress, newPrivateKey, (err, result) => {
          if (err) {
            return res.status(500).json({ error: 'Failed to save generated address.' });
          }
          res.json({ address: newWalletAddress });
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to generate address.' });
      }
});


// --- MODIFIED: The /recharge endpoint now handles USD to TRX conversion ---
router.post('/recharge', authenticateToken, async (req, res) => {
  // The amount from the frontend is still in USD
  const { amount: usdAmount, paymentMethod } = req.body;
  const userId = req.user.id;

  const numericUsdAmount = parseFloat(usdAmount);
  if (isNaN(numericUsdAmount) || numericUsdAmount <= 0) {
    return res.status(400).json({ message: 'Invalid amount provided.' });
  }

  try {
    // 1. Get the current TRX price in USD from CoinGecko API
    const priceResponse = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
    const trxPriceInUsd = priceResponse.data.tron.usd;

    if (!trxPriceInUsd) {
        console.error("[Recharge] Could not fetch TRX price.");
        return res.status(503).json({ message: 'Could not retrieve cryptocurrency price. Please try again later.' });
    }

    // 2. Calculate the required TRX amount
    const requiredTrxAmount = (numericUsdAmount / trxPriceInUsd).toFixed(6); // Use 6 decimal places for accuracy

    // 3. Get the user's deposit address
    const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user || !user.walletAddress) {
      return res.status(404).json({ message: 'User wallet address not found.' });
    }
    const depositAddress = user.walletAddress;

    // 4. Create the transaction record with the CALCULATED TRX AMOUNT
    const insertSql = `
      INSERT INTO recharge_transactions (user_id, amount_expected, currency, to_address, status)
      VALUES (?, ?, ?, ?, ?)
    `;
    // We save the TRX amount as the amount_expected
    await db.promise().query(insertSql, [userId, requiredTrxAmount, 'TRX', depositAddress, 'pending']);

    console.log(`[Recharge] User ${userId} wants to deposit $${numericUsdAmount}. Price: 1 TRX = $${trxPriceInUsd}. Required TRX: ${requiredTrxAmount}`);

    // 5. Send the precise TRX amount and address back to the frontend
    res.status(200).json({
      message: 'Recharge initiated. Please send the exact TRX amount.',
      depositAddress: depositAddress,
      amount: requiredTrxAmount, // The calculated TRX amount
      currency: 'TRX',
      originalUsdAmount: numericUsdAmount // Also send back the original amount for display
    });

  } catch (error) {
    console.error(`[Recharge] Error initiating recharge for user ${userId}:`, error.response ? error.response.data : error.message);
    res.status(500).json({ message: 'Server error while initiating recharge.' });
  }
});

module.exports = router;