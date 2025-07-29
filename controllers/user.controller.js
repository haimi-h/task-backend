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
                withdrawal_wallet_address: user.withdrawal_wallet_address || null,
                role: user.role, // Added role
                // default_task_profit: user.default_task_profit // Added default profit
            }
        });
    });
};

exports.updateUserProfile = async (req, res) => {
    const userId = req.params.userId;
    const { username, phone, email, walletAddress, newPassword, currentPassword, role, withdrawal_wallet_address, new_withdrawal_password, current_withdrawal_password } = req.body;

    try {
        const user = await new Promise((resolve, reject) => {
            User.findById(userId, (err, result) => {
                if (err) return reject(err);
                if (!result) return reject(new Error('User not found.'));
                resolve(result);
            });
        });

        // Object to store fields that will be updated
        const updatedFields = {};

        if (username !== undefined && username !== user.username) {
            updatedFields.username = username;
        }
        if (phone !== undefined && phone !== user.phone) {
            updatedFields.phone = phone;
        }
        if (email !== undefined && email !== user.email) {
            updatedFields.email = email;
        }
        if (walletAddress !== undefined && walletAddress !== user.walletAddress) {
            updatedFields.walletAddress = walletAddress;
        }
        // if (default_task_profit !== undefined && default_task_profit !== user.default_task_profit) {
        //     updatedFields.default_task_profit = default_task_profit;
        // }
        if (role !== undefined && role !== user.role) {
            updatedFields.role = role;
        }
        if (withdrawal_wallet_address !== undefined && withdrawal_wallet_address !== user.withdrawal_wallet_address) {
            updatedFields.withdrawal_wallet_address = withdrawal_wallet_address;
        }


        // Handle main password change
        if (newPassword && currentPassword) {
            const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isPasswordMatch) {
                return res.status(401).json({ message: 'Incorrect current password.' });
            }
            updatedFields.password = await bcrypt.hash(newPassword, 10);
        } else if (newPassword || currentPassword) {
            return res.status(400).json({ message: 'Both current password and new password are required to change password.' });
        }

        // Handle withdrawal password change
        if (new_withdrawal_password && current_withdrawal_password) {
            const isWithdrawalPasswordMatch = await bcrypt.compare(current_withdrawal_password, user.withdrawal_password);
            if (!isWithdrawalPasswordMatch) {
                return res.status(401).json({ message: 'Incorrect current withdrawal password.' });
            }
            updatedFields.withdrawal_password = await bcrypt.hash(new_withdrawal_password, 10);
        } else if (new_withdrawal_password || current_withdrawal_password) {
            return res.status(400).json({ message: 'Both current withdrawal password and new withdrawal password are required to change withdrawal password.' });
        }

        if (Object.keys(updatedFields).length === 0) {
            return res.status(200).json({ message: 'No changes detected.' });
        }

        await new Promise((resolve, reject) => {
            User.updateProfile(userId, updatedFields, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.status(200).json({ message: 'User profile updated successfully.' });

    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ message: error.message || 'Failed to update user profile.' });
    }
};
// NEW function for a user to update their own profile (e.g., password)
exports.updateOwnProfile = async (req, res) => {
    // Get user ID from the authenticated token, not params
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    // Check if this is a password change request
    if (newPassword && currentPassword) {
        try {
            // Fetch the user's current data from the database
            const user = await new Promise((resolve, reject) => {
                User.findById(userId, (err, result) => {
                    if (err) return reject(err);
                    if (!result) return reject(new Error('User not found.'));
                    resolve(result);
                });
            });

            // Verify the current password
            const isPasswordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isPasswordMatch) {
                return res.status(401).json({ message: 'Incorrect current password.' });
            }

            // Hash the new password
            const hashedPassword = await bcrypt.hash(newPassword, 10);
            
            // Update the user's profile with the new hashed password
            await new Promise((resolve, reject) => {
                User.updateProfile(userId, { password: hashedPassword }, (err, result) => {
                    if (err) return reject(err);
                    resolve(result);
                });
            });

            return res.status(200).json({ message: 'Password updated successfully.' });

        } catch (error) {
            console.error('Error updating password:', error);
            return res.status(500).json({ message: 'Failed to update password.' });
        }
    }

    // You can extend this function to handle other profile updates (e.g., username)
    return res.status(400).json({ message: 'No valid update data provided.' });
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
        // The frontend might expect the full user object or a simplified one.
        // This sends the full object, which is generally fine.
        res.json(user); 
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
/**
 * Handles the setting or updating of a user's withdrawal wallet address.
 * This function also verifies the user's withdrawal password.
 */
exports.setWithdrawalWalletAddress = async (req, res) => {
    const userId = req.user.id; // From authenticateToken middleware
    
    // This line is the key. It must match what the frontend sends.
    const { withdrawal_wallet_address, withdrawal_password } = req.body;

    // This check now correctly validates the right fields.
    if (!withdrawal_wallet_address || !withdrawal_password) {
        return res.status(400).json({ message: 'Wallet address and withdrawal password are required.' });
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
            User.updateWithdrawalWalletAddress(userId, withdrawal_wallet_address, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.status(200).json({ message: 'Withdrawal wallet address updated successfully.', newAddress: withdrawal_wallet_address });

    } catch (error) {
        console.error('Error setting withdrawal wallet address:', error);
        res.status(500).json({ message: 'Failed to set withdrawal address.', error: error.message });
    }
};

/**
 * Handles user withdrawal requests.
 * Expects amount, withdrawal_password, currency, and network in req.body.
 * The `to_address` is now fetched from the user's profile.
 */
exports.initiateWithdrawal = async (req, res) => {
    const userId = req.user.id;
    const { amount, withdrawal_password, currency = 'USDT', network = 'TRC20' } = req.body;

    // Input Validation
    if (!amount || !withdrawal_password) {
        return res.status(400).json({ message: 'Amount and withdrawal password are required.' });
    }
    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: 'Invalid withdrawal amount.' });
    }
    const withdrawalAmount = parseFloat(amount);

    try {
        // Fetch user data including balance, withdrawal password, and withdrawal address
        const user = await new Promise((resolve, reject) => {
            User.findById(userId, (err, result) => {
                if (err) return reject(err);
                if (!result) return reject(new Error('User not found.'));
                resolve(result);
            });
        });

        // 1. Verify withdrawal password
        const isPasswordMatch = await bcrypt.compare(withdrawal_password, user.withdrawal_password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: 'Incorrect withdrawal password.' });
        }

        // 2. Check if a withdrawal address is set
        if (!user.withdrawal_wallet_address) {
            return res.status(400).json({ message: 'No withdrawal wallet address set. Please set one before withdrawing.' });
        }

        // 3. Check sufficient balance
        if (user.wallet_balance < withdrawalAmount) {
            return res.status(400).json({ message: 'Insufficient balance.' });
        }

        // All checks passed, proceed with withdrawal
        // In a real application, you would now interact with a blockchain
        // or a payment gateway here to process the actual transfer.
        // For this example, we'll just simulate the deduction.

        const newBalance = user.wallet_balance - withdrawalAmount;

        await new Promise((resolve, reject) => {
            User.updateWalletBalance(userId, newBalance, (err, result) => {
                if (err) return reject(err);
                resolve(result);
            });
        });

        res.status(200).json({ message: 'Withdrawal successful. Funds will be transferred to your registered address.', newBalance: newBalance });

    } catch (error) {
        console.error('Withdrawal processing error:', error);
        res.status(500).json({ message: error.message || 'Withdrawal failed.' });
    }
};