const Admin = require('../models/admin.model');
const User = require('../models/user.model'); // Ensure this imports your main User model if different
const Task = require('../models/task.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // Assuming you use bcrypt for password hashing
const tronWeb = require('../tron'); // Import tronWeb for wallet generation
require('dotenv').config();

/**
 * Middleware to check if the authenticated user has an 'admin' role.
 * This will be used to protect all admin routes.
 * Assumes req.user is populated by authenticateToken middleware.
 */
exports.checkAdminRole = (req, res, next) => {
    console.log(`[Admin Controller - checkAdminRole] User ID: ${req.user ? req.user.id : 'N/A'}, Role: ${req.user ? req.user.role : 'N/A'}`);
    if (!req.user || req.user.role !== 'admin') {
        console.warn(`Unauthorized access attempt by user ID: ${req.user ? req.user.id : 'N/A'}, role: ${req.user ? req.user.role : 'N/A'}`);
        return res.status(403).json({ message: "Access denied. Administrator privileges required." });
    }
    next();
};

/**
 * Fetches all users for the admin dashboard.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.getAllUsers = (req, res) => {
    console.log(`[Admin Controller - getAllUsers] Admin User ID: ${req.user.id}`);
    const filters = {
        username: req.query.username,
        phone: req.query.phone,
        code: req.query.code,
        wallet: req.query.wallet,
    };
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    Admin.getAllUsersForAdmin(filters, limit, offset, (err, users, totalCount) => {
        if (err) {
            console.error('Error fetching users:', err);
            return res.status(500).json({ message: "Failed to retrieve users." });
        }
        // res.status(200).json({ users, totalCount, page, limit });
        // res.status(200).json({ users, totalUsers: totalCount, page, limit });
        res.status(200).json({ users, totalCount, page, limit });
    });
};

/**
 * Updates a user's daily orders.
 * This endpoint should be protected by checkAdminRole middleware.
 * Expects { daily_orders: number } in req.body.
 */
exports.updateUserDailyOrders = (req, res) => {
    const { userId } = req.params;
    const { daily_orders } = req.body;

    if (daily_orders === undefined || daily_orders < 0) {
        return res.status(400).json({ message: "Daily orders must be a non-negative number." });
    }

    Admin.updateUserDailyOrders(userId, daily_orders, (err, result) => {
        if (err) {
            console.error(`Error updating daily orders for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to update daily orders." });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.status(200).json({ message: "Daily orders updated successfully." });
    });
};

/**
 * Injects (adds) funds to a user's wallet balance.
 * This endpoint should be protected by checkAdminRole middleware.
 * Expects { amount: number } in req.body.
 */
exports.injectWallet = (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;

    if (amount === undefined || amount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number." });
    }

    Admin.injectWalletBalance(userId, amount, (err, result) => {
        if (err) {
            console.error(`Error injecting wallet for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to inject wallet balance." });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found." });
        }
        res.status(200).json({ message: "Wallet balance updated successfully." });
    });
};

/**
 * Updates a user's profile information, including wallet address and password.
 * This endpoint should be protected by checkAdminRole middleware.
 * Fields that can be updated: username, phone, new_password, walletAddress, defaultTaskProfit.
 */
exports.updateUserProfile = async (req, res) => {
    const userId = req.params.userId;
    // Include walletAddress and wallet_balance in destructuring
    const { username, phone, email, walletAddress, new_password, current_password, withdrawal_wallet_address, new_withdrawal_password, current_withdrawal_password, wallet_balance } = req.body;

    try {
        const user = await new Promise((resolve, reject) => {
            User.findById(userId, (err, result) => {
                if (err) return reject(err);
                if (!result) return reject(new Error('User not found.'));
                resolve(result);
            });
        });

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
        // Handle recharge wallet address
        if (walletAddress !== undefined && walletAddress !== user.walletAddress) {
            updatedFields.walletAddress = walletAddress;
        }
        // Handle withdrawal wallet address
        if (withdrawal_wallet_address !== undefined && withdrawal_wallet_address !== user.withdrawal_wallet_address) {
            updatedFields.withdrawal_wallet_address = withdrawal_wallet_address;
        }
        // Handle wallet balance update
        if (wallet_balance !== undefined && parseFloat(wallet_balance) !== parseFloat(user.wallet_balance)) {
            updatedFields.wallet_balance = parseFloat(wallet_balance);
        }
        // REMOVED: default_task_profit as per your request

        // Handle main password change
        if (new_password && current_password) {
            const isPasswordMatch = await bcrypt.compare(current_password, user.password);
            if (!isPasswordMatch) {
                return res.status(401).json({ message: 'Incorrect current password.' });
            }
            updatedFields.password = await bcrypt.hash(new_password, 10);
        } else if (new_password || current_password) {
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


/**
 * Generates a new TRC20 wallet address and assigns it to a specific user.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.generateAndAssignWallet = async (req, res) => {
    const { userId } = req.params;

    if (!tronWeb) {
        return res.status(500).json({ error: 'TRON_WEB_HOST not configured. Cannot generate wallet.' });
    }

    try {
        const newAccount = await tronWeb.createAccount();
        const walletAddress = newAccount.address.base58;
        const privateKey = newAccount.privateKey;

        Admin.assignWalletAddress(userId, walletAddress, privateKey, (err, result) => {
            if (err) {
                console.error(`Error assigning wallet to user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to assign wallet address." });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "User not found or wallet already assigned." });
            }
            res.status(200).json({
                message: "Wallet address generated and assigned successfully.",
                walletAddress: walletAddress,
                // In a real app, be very cautious about returning private key to client
            });
        });

    } catch (error) {
        console.error('Error generating or assigning wallet:', error);
        res.status(500).json({ error: 'Failed to generate and assign wallet address.' });
    }
};

/**
 * ADDED: Deletes a user from the database.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.deleteUser = (req, res) => {
    const { userId } = req.params;
    console.log(`[Admin Controller - deleteUser] Request to delete User ID: ${userId}`);

    Admin.deleteUser(userId, (err, result) => {
        if (err) {
            console.error(`Error deleting user ${userId}:`, err);
            // Check for specific foreign key constraint error (e.g., MySQL error code 1451)
            if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
                return res.status(409).json({ message: "Cannot delete user: related records exist in other tables. Please delete them first or configure CASCADE DELETE." });
            }
            return res.status(500).json({ message: "Failed to delete user.", error: err.message });
        }
        if (result.affectedRows === 0) {
            console.log(`[Admin Controller - deleteUser] User ${userId} not found.`);
            return res.status(404).json({ message: "User not found." });
        }
        console.log(`[Admin Controller - deleteUser] Successfully deleted user ${userId}.`);
        res.status(200).json({ message: "User deleted successfully." });
    });
};