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
    console.log(`[Admin Controller - getAllUsers] Admin fetching all users.`);
    // Get pagination and filter parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const filters = {
        username: req.query.username || '',
        phone: req.query.phone || '',
        code: req.query.code || '',
        wallet: req.query.wallet || ''
    };

    Admin.getAllUsersForAdmin(filters, limit, offset, (err, results, totalCount) => {
        if (err) {
            console.error("Error fetching all users for admin:", err);
            return res.status(500).json({ message: "Failed to retrieve users." });
        }
        res.status(200).json({
            users: results,
            totalUsers: totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit)
        });
    });
};

/**
 * Updates a user's daily_orders count.
 * This endpoint should be protected by checkAdminRole middleware.
 */
exports.updateUserDailyOrders = (req, res) => {
    const { userId } = req.params;
    const { daily_orders } = req.body; // Expecting daily_orders to be sent

    if (typeof daily_orders !== 'number' || daily_orders < 0) {
        return res.status(400).json({ message: "Invalid daily orders value." });
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
 */
exports.injectWallet = (req, res) => {
    const { userId } = req.params;
    const { amount } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount. Must be a positive number." });
    }

    Admin.injectWallet(userId, amount, (err, result) => {
        if (err) {
            console.error(`Error injecting wallet for user ${userId}:`, err);
            return res.status(500).json({ message: "Failed to inject wallet balance." });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found or no changes made." });
        }
        res.status(200).json({ message: "Wallet balance injected successfully." });
    });
};

/**
 * UPDATED: Updates a user's full profile including wallet balance.
 * This will be called by the SettingModal.
 */
exports.updateUserProfile = (req, res) => {
    const { userId } = req.params;
    // EXTENDED: Added wallet_balance to destructuring
    const { username, phone, password, withdrawal_password, role, walletAddress, daily_orders, completed_orders, uncompleted_orders, wallet_balance } = req.body;

    const updates = {
        username,
        phone,
        role,
        walletAddress,
        daily_orders,
        completed_orders,
        uncompleted_orders,
        wallet_balance, // ADDED: wallet_balance to updates object
    };

    if (password) {
        // Hash new password if provided
        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) {
                console.error('Error hashing password:', err);
                return res.status(500).json({ message: 'Failed to process password.' });
            }
            updates.password = hashedPassword;
            // Proceed with update after hashing
            Admin.updateUserProfile(userId, updates, (err, result) => {
                if (err) {
                    console.error(`Error updating user profile for user ${userId}:`, err);
                    return res.status(500).json({ message: "Failed to update user profile." });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: "User not found or no changes made." });
                }
                res.status(200).json({ message: "User profile updated successfully." });
            });
        });
    } else if (withdrawal_password) {
         // Hash new withdrawal password if provided
         bcrypt.hash(withdrawal_password, 10, (err, hashedWithdrawalPassword) => {
            if (err) {
                console.error('Error hashing withdrawal password:', err);
                return res.status(500).json({ message: 'Failed to process withdrawal password.' });
            }
            updates.withdrawal_password = hashedWithdrawalPassword;
            // Proceed with update after hashing
            Admin.updateUserProfile(userId, updates, (err, result) => {
                if (err) {
                    console.error(`Error updating user profile for user ${userId}:`, err);
                    return res.status(500).json({ message: "Failed to update user profile." });
                }
                if (result.affectedRows === 0) {
                    return res.status(404).json({ message: "User not found or no changes made." });
                }
                res.status(200).json({ message: "User profile updated successfully." });
            });
        });
    }
    else {
        // If no password or withdrawal password is being changed, update directly
        Admin.updateUserProfile(userId, updates, (err, result) => {
            if (err) {
                console.error(`Error updating user profile for user ${userId}:`, err);
                return res.status(500).json({ message: "Failed to update user profile." });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: "User not found or no changes made." });
            }
            res.status(200).json({ message: "User profile updated successfully." });
        });
    }
};

/**
 * Generates and assigns a new wallet address to a specific user.
 * This will be called from the frontend when a user needs a wallet address assigned.
 */
exports.generateAndAssignWallet = async (req, res) => {
    const { userId } = req.params;
    console.log(`[Admin Controller - generateAndAssignWallet] Request to generate wallet for User ID: ${userId}`);

    try {
        // 1. Generate new TRON wallet
        const newAccount = tronWeb.createAccount();
        const walletAddress = newAccount.address.base58;
        const privateKey = newAccount.privateKey;

        // 2. Assign wallet to user in DB
        Admin.assignWalletAddress(userId, walletAddress, privateKey, (err, result) => {
            if (err) {
                console.error('Database error assigning wallet:', err);
                return res.status(500).json({ message: 'Failed to assign wallet address in database.' });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'User not found or wallet already assigned.' });
            }
            res.status(200).json({
                message: 'Wallet address generated and assigned successfully!',
                walletAddress: walletAddress,
                privateKey: privateKey // In a real app, be very cautious about returning private key to client
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
        res.status(200).json({ message: "User deleted successfully." });
    });
};