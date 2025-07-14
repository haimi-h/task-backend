// In a new file, e.g., payment.routes.js
const express = require('express');
const router = express.Router();
const tronWeb = require('../tron'); // Assuming you have a config folder

router.get('/generate-address', async (req, res) => {
  try {
    const account = await tronWeb.createAccount();
    res.json({
      address: account.address.base58,
      privateKey: account.privateKey // Be sure to store this securely
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate address' });
  }
});

module.exports = router;