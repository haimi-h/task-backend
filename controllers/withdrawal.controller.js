const User = require('../models/user.model'); // For user balance and password check
const Withdrawal = require('../models/withdrawal.model'); // For recording withdrawal requests
const validator = require('validator'); // For input validation (install: npm install validator)
const bcrypt = require('bcryptjs'); // For comparing hashed passwords (install: npm install bcryptjs)
const db = require('../models/db'); // For direct database access if needed for transactions

// !!! IMPORTANT !!!
// In a real-world application, sending crypto out involves
// integrating with a blockchain (e.g., Tron network for TRC20 USDT).
// This typically requires:
// 1. A hot wallet managed by your platform with sufficient funds.
// 2. A Tron API client library (e.g., tronweb) or a third-party crypto payment gateway.
// 3. Handling network fees.
// The `initiateWithdrawal` function below will *simulate* the external transfer
// by setting the status to 'completed' after recording.
// YOU WILL NEED TO REPLACE THIS SIMULATION WITH ACTUAL BLOCKCHAIN INTEGRATION.

exports.initiateWithdrawal = async (req, res) => {
    const userId = req.user.id; // From authenticateToken middleware
    const { amount, to_address, withdrawal_password, currency = 'USDT', network = 'TRC20' } = req.body;

    // 1. Input Validation
    if (!amount || !to_address || !withdrawal_password) {
        return res.status(400).json({ message: 'Amount, recipient address, and withdrawal password are required.' });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid withdrawal amount.' });
    }

    // Basic TRC20 address validation (Tron addresses typically start with 'T')
    // This is a basic check; for robust validation, use a dedicated crypto address validation library.
    if (network === 'TRC20' && !validator.isAlphanumeric(to_address) || !to_address.startsWith('T') || to_address.length !== 34) { // Basic check for TRC20
        return res.status(400).json({ message: 'Invalid TRC20 wallet address format.' });
    }
    // You might add checks for other networks/currencies here

    const withdrawalAmount = parseFloat(amount);

    // Use a transaction for the entire withdrawal process for atomicity
    db.getConnection(async (err, connection) => {
        if (err) {
            console.error("Error getting database connection:", err);
            return res.status(500).json({ message: 'Database connection error.' });
        }

        try {
            await connection.beginTransaction();

            // Fetch user details for balance and withdrawal password verification
            const [userRows] = await connection.execute('SELECT wallet_balance, withdrawal_password FROM users WHERE id = ? FOR UPDATE', [userId]);
            const user = userRows[0];

            if (!user) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: 'User not found.' });
            }

            // Verify withdrawal password
            const isPasswordMatch = await bcrypt.compare(withdrawal_password, user.withdrawal_password);
            if (!isPasswordMatch) {
                await connection.rollback();
                connection.release();
                return res.status(401).json({ message: 'Incorrect withdrawal password.' });
            }

            // Check if sufficient balance
            if (parseFloat(user.wallet_balance) < withdrawalAmount) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Insufficient balance.' });
            }

            // Deduct balance from user (using the new deductBalance logic directly in the transaction)
            const [updateResult] = await connection.execute(
                'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?',
                [withdrawalAmount, userId]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                connection.release();
                return res.status(500).json({ message: 'Failed to update user balance.' });
            }

            // Record the withdrawal request
            const [withdrawalResult] = await connection.execute(
                'INSERT INTO withdrawals (user_id, amount, currency, network, to_address, status) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, withdrawalAmount, currency, network, to_address, 'pending'] // Initial status 'pending'
            );

            const withdrawalId = withdrawalResult.insertId;

            // !!! SIMULATED BLOCKCHAIN TRANSFER !!!
            // In a real application, you would now send the crypto via a blockchain API.
            // This is usually an asynchronous process that might take time.
            // For this implementation, we'll immediately mark it as 'completed'
            // or 'processing' if you have an off-chain approval process.
            // If it's real blockchain, the status would be 'processing' and then updated
            // to 'completed' or 'failed' based on the blockchain transaction's final state.

            // Simulate immediate completion for now
            await connection.execute(
                'UPDATE withdrawals SET status = ? WHERE id = ?',
                ['completed', withdrawalId]
            );

            await connection.commit();
            connection.release();

            res.status(200).json({
                message: 'Withdrawal request initiated successfully. Funds will be sent shortly.',
                withdrawalId: withdrawalId,
                amount: withdrawalAmount,
                to_address: to_address,
                currency: currency,
                network: network,
                status: 'completed' // Based on simulation
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            console.error('Withdrawal failed:', error);
            res.status(500).json({ message: 'Withdrawal failed.', error: error.message });
        }
    });
};

// You might also want a function to get withdrawal history for a user
exports.getWithdrawalHistory = (req, res) => {
    const userId = req.user.id;

    Withdrawal.findByUserId(userId, (err, withdrawals) => {
        if (err) {
            console.error('Error fetching withdrawal history:', err);
            return res.status(500).json({ message: 'Failed to fetch withdrawal history.' });
        }
        res.status(200).json({ withdrawals });
    });
};