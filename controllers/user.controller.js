const User = require('../models/user.model');
const db = require('../models/db');
const jwt = require('jsonwebtoken');
const validator = require('validator'); // Required for validation
const bcrypt = require('bcryptjs'); // Required for password comparison

exports.getUserProfile = (req, res) => {
    const userId = req.user.id;

    User.findById(userId, (err, user) => {
        if (err) {
            console.error("Error fetching user profile from DB:", err);
            return res.status(500).json({ message: "Failed to fetch user profile." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({
            user: {
                id: user.id,
                username: user.username,
                phone: user.phone,
                email: user.email || null,
                invitation_code: user.invitation_code || null,
                vip_level: user.vip_level || 'Bronze',
                daily_orders: user.daily_orders || 0,
                completed_orders: user.completed_orders || 0,
                uncompleted_orders: user.uncompleted_orders || 0,
                wallet_balance: user.wallet_balance || 0,
                walletAddress: user.walletAddress || null,
                withdrawal_wallet_address: user.withdrawal_wallet_address || null, // NEW: Include this
                role: user.role || 'user'
            }
        });
    });
};

exports.getMyReferrals = (req, res) => {
    const userId = req.user.id;

    db.query(
        "SELECT id, username, phone, created_at FROM users WHERE referrer_id = ?",
        [userId],
        (err, results) => {
            if (err) {
                console.error("Error fetching referrals from DB:", err);
                return res.status(500).json({ message: "Failed to fetch referrals." });
            }
            res.status(200).json({ referrals: results });
        }
    );
};

exports.getLoggedInUser = (req, res) => {
    const userId = req.user.id;

    User.findById(userId, (err, user) => {
        if (err) {
            console.error('Error fetching logged-in user for /me endpoint:', err);
            return res.status(500).json({ message: 'Failed to fetch user data.' });
        }
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json(user);
    });
};

/**
 * NEW: Endpoint to set or update a user's permanent withdrawal wallet address.
 * Requires user ID from token, the new address, and the withdrawal password for verification.
 */
exports.setWithdrawalWalletAddress = async (req, res) => {
    const userId = req.user.id;
    const { new_address, withdrawal_password } = req.body;
    const network = 'TRC20'; // Hardcoded for now, assuming TRC20 USDT

    if (!new_address || !withdrawal_password) {
        return res.status(400).json({ message: 'New wallet address and withdrawal password are required.' });
    }

    // Basic TRC20 address validation
    if (network === 'TRC20' && (!validator.isAlphanumeric(new_address) || !new_address.startsWith('T') || new_address.length !== 34)) {
        return res.status(400).json({ message: 'Invalid TRC20 wallet address format.' });
    }

    try {
        // Fetch user to verify withdrawal password
        const user = await new Promise((resolve, reject) => {
            User.findById(userId, (err, result) => {
                if (err) return reject(err);
                if (!result) return reject(new Error('User not found.'));
                resolve(result);
            });
        });

        // Verify withdrawal password
        const isPasswordMatch = await bcrypt.compare(withdrawal_password, user.withdrawal_password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Incorrect withdrawal password.' });
        }

        // Update the withdrawal wallet address
        await new Promise((resolve, reject) => {
            User.updateWithdrawalWalletAddress(userId, new_address, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.status(200).json({ message: 'Withdrawal wallet address updated successfully.', newAddress: new_address });

    } catch (error) {
        console.error('Error setting withdrawal wallet address:', error);
        res.status(500).json({ message: error.message || 'Failed to update withdrawal wallet address.' });
    }
};