const Admin = require('../models/admin.model');
const User = require('../models/user.model');
const Task = require('../models/task.model'); // Import Task model to get total product count
const jwt = require('jsonwebtoken');
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
            console.error("Error fetching all users for admin:", err);
            return res.status(500).json({ message: "Error fetching users.", error: err.message });
        }
        console.log(`[Admin Controller - getAllUsers] Successfully fetched ${users.length} users.`);
        res.status(200).json(users);
    });
};

/**
 * Updates a specific user's daily_orders.
 * This endpoint should be protected by checkAdminRole middleware.
 * Includes validation to ensure daily_orders does not exceed total products.
 */
exports.updateUserDailyOrders = (req, res) => {
    const { userId } = req.params;
    const { daily_orders } = req.body;

    console.log(`[Admin Controller - updateUserDailyOrders] Received request for User ID: ${userId}, Raw Daily Orders from body: ${daily_orders}`); // DEBUG LOG

    // Basic validation for input type and non-negativity
    if (typeof daily_orders === 'undefined' || isNaN(parseInt(daily_orders)) || parseInt(daily_orders) < 0) {
        console.log(`[Admin Controller - updateUserDailyOrders] Invalid daily_orders value: ${daily_orders}`);
        return res.status(400).json({ message: "Invalid daily_orders value. Must be a non-negative number." });
    }

    const newDailyOrdersInt = parseInt(daily_orders);
    console.log(`[Admin Controller - updateUserDailyOrders] Parsed daily_orders (integer): ${newDailyOrdersInt}`); // DEBUG LOG

    // Get total product count for validation
    Task.getTotalProductCount((err, totalProducts) => {
        if (err) {
            console.error("Error fetching total product count for validation:", err);
            return res.status(500).json({ message: "Internal server error during validation." });
        }
        console.log(`[Admin Controller - updateUserDailyOrders] Total products: ${totalProducts}`);

        // Perform the validation
        if (newDailyOrdersInt > totalProducts) {
            console.log(`[Admin Controller - updateUserDailyOrders] Daily orders (${newDailyOrdersInt}) exceed total products (${totalProducts}).`);
            return res.status(400).json({ message: `Daily orders cannot exceed the total number of products (${totalProducts}).` });
        }

        Admin.updateUserDailyOrders(userId, newDailyOrdersInt, (err, result) => {
            if (err) {
                console.error(`Error updating daily orders for user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to update daily orders.", error: err.message });
            }
            if (result.affectedRows === 0) {
                console.log(`[Admin Controller - updateUserDailyOrders] User ${userId} not found or no changes made.`);
                return res.status(404).json({ message: "User not found or no changes made." });
            }
            console.log(`[Admin Controller - updateUserDailyOrders] Daily orders updated successfully for user ${userId}. Affected rows: ${result.affectedRows}`);
            res.status(200).json({ message: "Daily orders updated successfully." });
        });
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
        res.status(200).json({ message: "Wallet balance injected successfully." });
    });
};
