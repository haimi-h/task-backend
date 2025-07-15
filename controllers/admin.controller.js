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
    console.log(`[Admin Controller - getAllUsers] Fetching all users for admin.`);
    Admin.getAllUsersForAdmin((err, users) => {
        if (err) {
            console.error('Error fetching users for admin:', err);
            return res.status(500).json({ message: "Failed to retrieve users.", error: err.message });
        }
        // If successful, users array will contain the walletAddress field due to model update
        res.json(users);
    });
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
        // 1. Generate a new Tron account (address + private key)
        const account = await tronWeb.createAccount();
        const newWalletAddress = account.address.base58;
        const newPrivateKey = account.privateKey;

        // 2. Assign this generated address and private key to the user in the database
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
        console.log(`[Admin Controller - deleteUser] User ${userId} deleted successfully.`);
        res.json({ message: "User deleted successfully." });
    });
};
