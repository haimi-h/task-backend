// PATCHED: payment.routes.js (Only the /recharge route)
const express = require('express');
const router = express.Router();
const axios = require('axios');
const authenticateToken = require('../middleware/auth.middleware');
const db = require('../models/db');

// Warm-up ping route for client to call before sensitive POSTs
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
    // Retry CoinGecko fetch up to 3 times
    for (let i = 0; i < 3; i++) {
      try {
        const priceResponse = await axios.get(
          'https://api.coingecko.com/api/v3/simple/price?ids=tron&vs_currencies=usd'
        );
        trxPriceInUsd = priceResponse.data?.tron?.usd;
        if (trxPriceInUsd) break;
      } catch (err) {
        console.warn(`[Recharge] TRX price fetch attempt ${i + 1} failed.`);
        await new Promise((res) => setTimeout(res, 1000)); // wait before retry
      }
    }

    if (!trxPriceInUsd) {
      console.error('[Recharge] Could not fetch TRX price after 3 attempts.');
      return res.status(503).json({ message: 'Could not retrieve TRX price. Try again shortly.' });
    }

    const requiredTrxAmount = (numericUsdAmount / trxPriceInUsd).toFixed(6);

    const [userRows] = await db.promise().query('SELECT walletAddress FROM users WHERE id = ?', [userId]);
    const user = userRows[0];
    if (!user || !user.walletAddress) {
      return res.status(404).json({ message: 'User wallet address not found. Please generate one first.' });
    }

    const depositAddress = user.walletAddress;

    // Insert into recharge_transactions
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
