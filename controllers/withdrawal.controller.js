const User = require('../models/user.model');
const Withdrawal = require('../models/withdrawal.model');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const db = require('../models/db');

exports.initiateWithdrawal = async (req, res) => {
    const userId = req.user.id;
    // MODIFIED: 'to_address' is no longer expected in req.body.
    // We will retrieve it from the user's stored profile.
    const { amount, withdrawal_password, currency = 'USDT', network = 'TRC20' } = req.body;

    // 1. Input Validation
    if (!amount || !withdrawal_password) {
        return res.status(400).json({ message: 'Amount and withdrawal password are required.' });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid withdrawal amount.' });
    }

    const withdrawalAmount = parseFloat(amount);

    db.getConnection(async (err, connection) => {
        if (err) {
            console.error("Error getting database connection:", err);
            return res.status(500).json({ message: 'Database connection error.' });
        }

        try {
            await connection.beginTransaction();

            // MODIFIED: Fetch withdrawal_wallet_address along with balance and password
            const [userRows] = await connection.execute('SELECT wallet_balance, withdrawal_password, withdrawal_wallet_address FROM users WHERE id = ? FOR UPDATE', [userId]);
            const user = userRows[0];

            if (!user) {
                await connection.rollback();
                connection.release();
                return res.status(404).json({ message: 'User not found.' });
            }

            // NEW: Check if a withdrawal address is set
            if (!user.withdrawal_wallet_address) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'No withdrawal wallet address set. Please set it first.' });
            }

            // Validate the *stored* withdrawal address here (redundant but safe)
            if (network === 'TRC20' && (!validator.isAlphanumeric(user.withdrawal_wallet_address) || !user.withdrawal_wallet_address.startsWith('T') || user.withdrawal_wallet_address.length !== 34)) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ message: 'Invalid stored TRC20 wallet address format. Please update it.' });
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

            // Deduct balance from user
            const [updateResult] = await connection.execute(
                'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?',
                [withdrawalAmount, userId]
            );

            if (updateResult.affectedRows === 0) {
                await connection.rollback();
                connection.release();
                return res.status(500).json({ message: 'Failed to update user balance.' });
            }

            // Record the withdrawal request using the STORED address
            const [withdrawalResult] = await connection.execute(
                'INSERT INTO withdrawals (user_id, amount, currency, network, to_address, status) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, withdrawalAmount, currency, network, user.withdrawal_wallet_address, 'pending']
            );

            const withdrawalId = withdrawalResult.insertId;

            // !!! SIMULATED BLOCKCHAIN TRANSFER !!!
            // (Same as before, replace with actual integration)
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
                to_address: user.withdrawal_wallet_address, // Return the address that was used
                currency: currency,
                network: network,
                status: 'completed'
            });

        } catch (error) {
            await connection.rollback();
            connection.release();
            console.error('Withdrawal failed:', error);
            res.status(500).json({ message: 'Withdrawal failed.', error: error.message });
        }
    });
};

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