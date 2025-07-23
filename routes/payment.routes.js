// UPDATED: payment.routes.js with CoinGecko fallback + warmup route
const express = require('express');
const router = express.Router();
const axios = require('axios');
const authenticateToken = require('../middleware/auth.middleware');
const db = require('../models/db');

// Warm-up ping route to wake up Render server before sensitive operations
router.get('/ping', (req, res) => {
  res.send('pong');
});

router.post('/recharge', authenticateToken, async (req, res) => {
  const { amount: usdAmount, paymentMethod } = req.body;
  const userId = req.user.id;

  const numericUsdAmount = parseFloat(usdAmount);
  if (isNaN(numericUsdAmount) || numericUsdAmount < 7) {
    return res.status(400).json({ message: 'Invalid amount provided. Minimum is $7.' });
  }

  let trxPriceInUsd;

  try {
    console.log('[Recharge] Fetching TRX price from CoinGecko...');
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd');
    console.log('[CoinGecko] Raw response:', response.data);

    trxPriceInUsd = response.data?.tron?.usd;

    if (!trxPriceInUsd || typeof trxPriceInUsd !== 'number') {
      console.warn('[CoinGecko] Invalid or missing TRX price, using fallback.');
      trxPriceInUsd = 0.30; // fallback price
    }
  } catch (err) {
    console.error('[CoinGecko] API call failed, using fallback. Error:', err.message);
    trxPriceInUsd = 0.30; // fallback price
  }

  try {
    const requiredTrxAmount = (numericUsdAmount / trxPriceInUsd).toFixed(6);

    const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user || !user.walletAddress) {
      return res.status(404).json({ message: 'User wallet address not found. Please generate one first.' });
    }

    const depositAddress = user.walletAddress;

    const insertSql = `
      INSERT INTO recharge_transactions (user_id, amount_expected, currency, to_address, status)
      VALUES (?, ?, ?, ?, ?)
    `;

    try {
      await db.promise().query(insertSql, [userId, requiredTrxAmount, 'TRX', depositAddress, 'pending']);
    } catch (dbErr) {
      console.error('[Recharge] DB insert failed:', dbErr);
      return res.status(500).json({ message: 'Server error while initiating recharge (DB failed).' });
    }

    console.log(`[Recharge] User ${userId}: $${numericUsdAmount} → ${requiredTrxAmount} TRX`);

    res.status(200).json({
      message: 'Recharge initiated. Please send the exact TRX amount.',
      depositAddress,
      amount: requiredTrxAmount,
      currency: 'TRX',
      originalUsdAmount: numericUsdAmount,
    });
  } catch (error) {
    console.error(`[Recharge] Unexpected error for user ${userId}:`, error);
    res.status(500).json({ message: 'Unexpected server error while initiating recharge.' });
  }
});

module.exports = router;