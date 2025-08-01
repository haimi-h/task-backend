// your-project/controllers/withdrawal.controller.js
const User = require('../models/user.model');
const Withdrawal = require('../models/withdrawal.model');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const db = require('../models/db'); // Ensure this is the correct path to your db.js

exports.initiateWithdrawal = (req, res) => { // Removed async
    const userId = req.user.id;
    const { amount, withdrawal_password, currency = 'USDT', network = 'TRC20' } = req.body;

    // 1. Input Validation
    if (!amount || !withdrawal_password) {
        return res.status(400).json({ message: 'Amount and withdrawal password are required.' });
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid withdrawal amount.' });
    }

    const withdrawalAmount = parseFloat(amount);

    // Start transaction using db.beginTransaction
    db.beginTransaction(err => {
        if (err) {
            console.error("Error starting transaction:", err);
            return res.status(500).json({ message: 'Database transaction error.' });
        }

        // MODIFIED: Fetch user data including `uncompleted_orders` using db.query (callback-based)
        db.query('SELECT wallet_balance, withdrawal_password, withdrawal_wallet_address, uncompleted_orders FROM users WHERE id = ? FOR UPDATE', [userId], (err, userRows) => {
            if (err) {
                return db.rollback(() => {
                    console.error('Error fetching user for withdrawal:', err);
                    res.status(500).json({ message: 'Failed to fetch user data.' });
                });
            }

            if (userRows.length === 0) {
                return db.rollback(() => {
                    res.status(404).json({ message: 'User not found.' });
                });
            }

            const user = userRows[0];

            // --- VALIDATION 1: Check for uncompleted tasks ---
            if (user.uncompleted_orders > 0) {
                return db.rollback(() => {
                    res.status(400).json({ message: 'You must complete all daily tasks before withdrawing funds.' });
                });
            }

            // --- VALIDATION 2: Ensure a withdrawal wallet address is set ---
            if (!user.withdrawal_wallet_address) {
                return db.rollback(() => {
                    res.status(400).json({ message: 'Withdrawal wallet address not set. Please set it in your profile.' });
                });
            }

            // --- REMOVED: Basic validation for the withdrawal address (TRC20 USDT) ---
            // The following block has been removed as per your request.
            /*
            if (network === 'TRC20' && (!validator.isAlphanumeric(user.withdrawal_wallet_address) || !user.withdrawal_wallet_address.startsWith('T') || user.withdrawal_wallet_address.length !== 34)) {
                return db.rollback(() => {
                    res.status(400).json({ message: 'Invalid TRC20 withdrawal wallet address format configured for your account.' });
                });
            }
            */

            // Verify withdrawal password
            bcrypt.compare(withdrawal_password, user.withdrawal_password, (err, isPasswordMatch) => {
                if (err) {
                    return db.rollback(() => {
                        console.error('Error comparing password:', err);
                        res.status(500).json({ message: 'Password verification failed.' });
                    });
                }
                if (!isPasswordMatch) {
                    return db.rollback(() => {
                        res.status(401).json({ message: 'Incorrect withdrawal password.' });
                    });
                }

                // Check sufficient balance
                if (parseFloat(user.wallet_balance) < withdrawalAmount) {
                    return db.rollback(() => {
                        res.status(400).json({ message: 'Insufficient balance for withdrawal.' });
                    });
                }

                // Deduct amount from user's balance
                db.query(
                    'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?',
                    [withdrawalAmount, userId],
                    (err, updateResult) => {
                        if (err) {
                            return db.rollback(() => {
                                console.error('Error deducting balance:', err);
                                res.status(500).json({ message: 'Failed to update user balance during withdrawal.' });
                            });
                        }

                        if (updateResult.affectedRows === 0) {
                            return db.rollback(() => {
                                res.status(500).json({ message: 'Failed to update user balance during withdrawal (no rows affected).' });
                            });
                        }

                        // Record the withdrawal request
                        db.query(
                            'INSERT INTO withdrawals (user_id, amount, currency, network, to_address, status) VALUES (?, ?, ?, ?, ?, ?)',
                            [userId, withdrawalAmount, currency, network, user.withdrawal_wallet_address, 'pending'],
                            (err, withdrawalResult) => {
                                if (err) {
                                    return db.rollback(() => {
                                        console.error('Error recording withdrawal:', err);
                                        res.status(500).json({ message: 'Failed to record withdrawal request.' });
                                    });
                                }

                                const withdrawalId = withdrawalResult.insertId;

                                // !!! SIMULATED BLOCKCHAIN TRANSFER !!!
                                // This would be replaced by actual blockchain integration.
                                db.query(
                                    'UPDATE withdrawals SET status = ? WHERE id = ?',
                                    ['completed', withdrawalId],
                                    (err, finalUpdateResult) => {
                                        if (err) {
                                            return db.rollback(() => {
                                                console.error('Error updating withdrawal status:', err);
                                                res.status(500).json({ message: 'Failed to finalize withdrawal status.' });
                                            });
                                        }

                                        db.commit(err => {
                                            if (err) {
                                                return db.rollback(() => {
                                                    console.error('Error committing transaction:', err);
                                                    res.status(500).json({ message: 'Withdrawal transaction failed to commit.' });
                                                });
                                            }

                                            res.status(200).json({
                                                message: 'Withdrawal request initiated successfully. Funds will be sent shortly.',
                                                withdrawalId: withdrawalId,
                                                amount: withdrawalAmount,
                                                to_address: user.withdrawal_wallet_address,
                                                currency: currency,
                                                network: network,
                                                status: 'completed'
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    });
};

exports.getWithdrawalHistory = (req, res) => {
    const userId = req.user.id;

    // Assuming Withdrawal.findByUserId also uses callback-based db.query
    Withdrawal.findByUserId(userId, (err, withdrawals) => {
        if (err) {
            console.error('Error fetching withdrawal history:', err);
            return res.status(500).json({ message: 'Failed to fetch withdrawal history.' });
        }
        res.status(200).json({ withdrawals });
    });
};