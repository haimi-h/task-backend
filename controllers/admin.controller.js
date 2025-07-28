const Admin = require('../models/admin.model');
const User = require('../models/user.model');
const Task = require('../models/task.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const tronWeb = require('../tron');
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
    console.log(`[Admin Controller - getAllUsers] Admin ID: ${req.user.id} requesting all users.`);
    const filters = {
        username: req.query.username || '',
        phone: req.query.phone || '',
        code: req.query.code || '',
        wallet: req.query.wallet || '',
    };
    const limit = parseInt(req.query.limit) || 10;
    const offset = (parseInt(req.query.page || 1) - 1) * limit;

    Admin.getAllUsersForAdmin(filters, limit, offset, (err, users, totalCount) => {
        if (err) {
            console.error('Error fetching users for admin:', err);
            return res.status(500).json({ message: "Failed to fetch users." });
        }
        res.status(200).json({ users, totalCount });
    });
};

/**
 * Injects (adds) funds to a user's wallet balance.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.injectWallet = (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body; // Amount to inject

    if (isNaN(amount) || parseFloat(amount) <= 0) {
        return res.status(400).json({ message: "Invalid amount provided." });
    }

    User.findById(userId, (err, user) => {
        if (err) {
            console.error(`Error finding user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to find user." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        const newBalance = user.wallet_balance + parseFloat(amount);

        User.updateWalletBalance(userId, newBalance, (err, result) => {
            if (err) {
                console.error(`Error updating wallet balance for user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to update wallet balance." });
            }
            res.status(200).json({ message: `Successfully injected ${amount} to user ${user.username}'s wallet. New balance: ${newBalance.toFixed(2)}` });
        });
    });
};

/**
 * Updates a user's daily orders count.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.updateUserDailyOrders = (req, res) => {
    const { userId } = req.params;
    const { dailyOrders } = req.body;

    if (isNaN(dailyOrders) || dailyOrders < 0) {
        return res.status(400).json({ message: "Invalid daily orders count." });
    }

    User.updateDailyOrders(userId, dailyOrders, (err, result) => {
        if (err) {
            console.error(`Error updating daily orders for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to update daily orders." });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.status(200).json({ message: "User daily orders updated successfully!" });
    });
};


/**
 * Updates a user's profile information.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.updateUserProfile = async (req, res) => {
    const { userId } = req.params;
    // MODIFIED: Ensure walletAmount is destructured from req.body
    const { username, phone, walletAddress, new_password, new_withdrawal_password, walletAmount } = req.body;
    console.log(`[Admin Controller - updateUserProfile] Updating profile for User ID: ${userId}`);
    console.log("Received data:", { username, phone, walletAddress, walletAmount, hasNewPass: !!new_password, hasNewWithdrawalPass: !!new_withdrawal_password });

    const userDataToUpdate = {};

    if (username !== undefined) userDataToUpdate.username = username;
    if (phone !== undefined) userDataToUpdate.phone = phone;
    if (walletAddress !== undefined) userDataToUpdate.walletAddress = walletAddress;

    // MODIFIED: Map walletAmount from frontend to wallet_balance for the database
    if (walletAmount !== undefined) {
        // Ensure it's a number, handle potential string conversion
        userDataToUpdate.wallet_balance = parseFloat(walletAmount);
        if (isNaN(userDataToUpdate.wallet_balance)) {
             return res.status(400).json({ message: "Invalid wallet amount provided." });
        }
    }

    try {
        if (new_password) {
            if (new_password.length < 6) { // Example validation
                return res.status(400).json({ message: "New password must be at least 6 characters long." });
            }
            const hashedPassword = await bcrypt.hash(new_password, 10);
            userDataToUpdate.password = hashedPassword;
        }

        if (new_withdrawal_password) {
            if (new_withdrawal_password.length < 6) { // Example validation
                return res.status(400).json({ message: "New withdrawal password must be at least 6 characters long." });
            }
            const hashedWithdrawalPassword = await bcrypt.hash(new_withdrawal_password, 10);
            userDataToUpdate.withdrawal_password = hashedWithdrawalPassword;
        }

        if (Object.keys(userDataToUpdate).length === 0) {
            return res.status(400).json({ message: "No valid fields provided for update." });
        }

        User.updateProfile(userId, userDataToUpdate, (err, result) => {
            if (err) {
                console.error(`Error updating user profile ${userId}:`, err);
                return res.status(500).json({ message: "Failed to update user profile.", error: err.message });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "User not found or no changes made." });
            }
            res.status(200).json({ message: "User profile updated successfully!" });
        });
    } catch (error) {
        console.error('Error in updateUserProfile:', error);
        res.status(500).json({ message: 'Server error during password hashing or profile update.' });
    }
};

/**
 * Generates and assigns a new TronLink wallet address and private key to a specific user.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.generateAndAssignWallet = async (req, res) => {
    const { userId } = req.params;
    console.log(`[Admin Controller - generateAndAssignWallet] Generating wallet for User ID: ${userId}`);

    try {
        // Generate a new TronLink wallet
        const newAccount = await tronWeb.createAccount();
        const walletAddress = newAccount.address.base58;
        const privateKey = newAccount.privateKey;

        // Assign the generated wallet to the user in the database
        Admin.assignWalletAddress(userId, walletAddress, privateKey, (err, result) => {
            if (err) {
                console.error('Error assigning wallet address:', err);
                return res.status(500).json({ message: 'Failed to assign wallet address.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'User not found or wallet already assigned.' });
            }
            res.status(200).json({ message: 'Wallet address generated and assigned successfully.', walletAddress });
        });

    } catch (error) {
        console.error('Error generating or assigning wallet:', error);
        res.status(500).json({ error: 'Failed to generate and assign wallet address.' });
    }
};

/**
 * Deletes a user from the database.
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
        res.status(200).json({ message: "User deleted successfully." });
    });
};