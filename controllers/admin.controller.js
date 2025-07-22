const Admin = require('../models/admin.model');
const User = require('../models/user.model');
const Task = require('../models/task.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const tronWeb = require('../tron');
require('dotenv').config();

/**
 * Middleware to check if the authenticated user has an 'admin' role.
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
 * Fetches all users for the admin dashboard with pagination and filtering.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.getAllUsers = async (req, res) => { // Made async to use await
    console.log(`[Admin Controller - getAllUsers] Fetching users for admin with filters:`, req.query);
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Build filter object from query parameters
        const filters = {};
        if (req.query.username) filters.username = req.query.username;
        if (req.query.phone) filters.phone = req.query.phone;
        if (req.query.code) filters.invitation_code = req.query.code;
        if (req.query.wallet) filters.walletAddress = req.query.wallet;

        // Call the new model method to get paginated users and total count
        const { users, totalUsers } = await Admin.getPaginatedUsersForAdmin(filters, skip, limit); // Calling new model method

        // If successful, users array will contain the walletAddress field due to model update
        // Send the response in the expected format: { users: [], totalUsers: N }
        res.json({ users, totalUsers });

    } catch (error) {
        console.error('Error fetching users for admin:', error);
        res.status(500).json({ message: "Failed to retrieve users.", error: error.message });
    }
};

/**
 * Updates a user's daily_orders count.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.updateUserDailyOrders = (req, res) => {
    const { userId } = req.params;
    const { daily_orders } = req.body;

    if (typeof daily_orders === 'undefined' || isNaN(daily_orders) || daily_orders < 0) {
        return res.status(400).json({ message: "Invalid daily orders value." });
    }

    Admin.updateUserDailyOrders(userId, daily_orders, (err, result) => {
        if (err) {
            console.error(`Error updating daily orders for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to update daily orders.", error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.json({ message: "Daily orders updated successfully." });
    });
};

/**
 * Injects (adds) an amount to a user's wallet balance.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.injectWallet = (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;

    console.log(`[Admin Controller - injectWallet] Received request for User ID: ${userId}, Amount: ${amount}`);

    // Basic validation
    if (typeof amount === 'undefined' || isNaN(amount) || parseFloat(amount) <= 0) {
        console.log(`[Admin Controller - injectWallet] Invalid amount: ${amount}`);
        return res.status(400).json({ message: "Invalid amount. Must be a positive number." });
    }

    Admin.injectWalletBalance(userId, parseFloat(amount), (err, result) => {
        if (err) {
            console.error(`Error injecting wallet for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to inject wallet balance.", error: err.message });
        }
        if (result.affectedRows === 0) {
            console.log(`[Admin Controller - injectWallet] User ${userId} not found or no changes made.`);
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        console.log(`[Admin Controller - injectWallet] Wallet balance injected successfully for user ${userId}. Affected rows: ${result.affectedRows}`);
        res.json({ message: "Wallet balance injected successfully." });
    });
};

/**
 * Updates a user's profile information, including wallet address and password.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.updateUserProfile = (req, res) => {
    const { userId } = req.params;
    const { username, phone, walletAddress, new_password } = req.body;

    console.log(`[Admin Controller - updateUserProfile] Received request for User ID: ${userId}, Data:`, { username, phone, walletAddress, new_password: new_password ? '***' : 'N/A' });

    const updateData = { username, phone, walletAddress };

    if (new_password) {
        bcrypt.hash(new_password, 10, (err, hashedPassword) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ message: 'Failed to hash password.' });
            }
            updateData.password = hashedPassword;
            Admin.updateUser(userId, updateData, (err, result) => {
                if (err) {
                    console.error(`Error updating user profile for user ${userId}:`, err);
                    return res.status(500).json({ message: "Failed to update user profile.", error: err.message });
                }
                if (result.affectedRows === 0) {
                    console.log(`[Admin Controller - updateUserProfile] User ${userId} not found or no changes made.`);
                    return res.status(404).json({ message: "User not found or no changes made." });
                }
                console.log(`[Admin Controller - updateUserProfile] User profile updated successfully for user ${userId}.`);
                res.json({ message: "User profile updated successfully." });
            });
        });
    } else {
        Admin.updateUser(userId, updateData, (err, result) => {
            if (err) {
                console.error(`Error updating user profile for user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to update user profile.", error: err.message });
            }
            if (result.affectedRows === 0) {
                console.log(`[Admin Controller - updateUserProfile] User ${userId} not found or no changes made.`);
                return res.status(404).json({ message: "User not found or no changes made." });
            }
            console.log(`[Admin Controller - updateUserProfile] User profile updated successfully for user ${userId}.`);
            res.json({ message: "User profile updated successfully." });
        });
    }
};

/**
 * Generates a new Tron wallet address and assigns it to a specific user.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.generateAndAssignWallet = async (req, res) => {
    const { userId } = req.params;
    console.log(`[Admin Controller - generateAndAssignWallet] Request to generate and assign wallet for User ID: ${userId}`);

    try {
        const account = await tronWeb.createAccount();
        const newWalletAddress = account.address.base58;
        const newPrivateKey = account.privateKey;

        Admin.assignWalletAddress(userId, newWalletAddress, newPrivateKey, (err, result) => {
            if (err) {
                console.error(`Error assigning wallet to user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to assign wallet address.", error: err.message });
            }
            if (result.affectedRows === 0) {
                console.log(`[Admin Controller - generateAndAssignWallet] User ${userId} not found or no changes made.`);
                return res.status(404).json({ message: "User not found or no changes made." });
            }
            console.log(`[Admin Controller - generateAndAssignWallet] Wallet address ${newWalletAddress} assigned to user ${userId}.`);
            res.json({ message: "Wallet address assigned successfully.", walletAddress: newWalletAddress });
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
            if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.errno === 1451) {
                return res.status(409).json({ message: "Cannot delete user: related records exist in other tables. Please delete them first or configure CASCADE DELETE." });
            }
            return res.status(500).json({ message: "Failed to delete user.", error: err.message });
        }
        if (result.affectedRows === 0) {
            console.log(`[Admin Controller - deleteUser] User ${userId} not found.`);
            return res.status(404).json({ message: "User not found." });
        }
        console.log(`[Admin Controller - deleteUser] User ${userId} deleted successfully.`);
        res.json({ message: "User deleted successfully." });
    });
};