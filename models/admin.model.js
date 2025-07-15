// admin.model.js
const db = require('./db'); // Ensure this path is correct to your database connection
const bcrypt = require('bcryptjs'); // Assuming you use bcrypt for password hashing in controller

const Admin = {
    /**
     * Fetches a list of all users with relevant details for the admin table.
     * Includes counts for daily, completed, and uncompleted orders, and wallet balance.
     * Also includes the username of the referrer if available.
     *
     * @param {function} callback - Callback function (err, results)
     */
    getAllUsersForAdmin: (callback) => {
        const sql = `
            SELECT
                u.id,
                u.username,
                u.phone,
                u.invitation_code,
                r.username AS invited_by, -- Get referrer's username
                u.daily_orders,
                u.completed_orders,
                u.uncompleted_orders,
                u.wallet_balance,   -- Keep this if it's the numerical app balance
                u.walletAddress,    -- ADDED: to fetch the new wallet address column
                u.role,
                u.created_at
            FROM
                users u
            LEFT JOIN
                users r ON u.referrer_id = r.id; -- Join to get referrer's username
        `;
        db.query(sql, callback);
    },

    /**
     * Updates a user's daily_orders count.
     * FIX: Also sets uncompleted_orders to the same value when daily_orders are set.
     *
     * @param {number} userId - The ID of the user to update.
     * @param {number} newDailyOrders - The new value for daily_orders.
     * @param {function} callback - Callback function (err, result)
     */
    updateUserDailyOrders: (userId, newDailyOrders, callback) => {
        const sql = `
            UPDATE users
            SET daily_orders = ?,
                uncompleted_orders = ? -- Set uncompleted to new daily orders
            WHERE id = ?;
        `;
        db.query(sql, [newDailyOrders, newDailyOrders, userId], (err, result) => {
            if (err) {
                console.error(`[Admin Model - updateUserDailyOrders] Database error for User ${userId}:`, err);
                return callback(err);
            }
            console.log(`[Admin Model - updateUserDailyOrders] Database query result for User ${userId}:`, result);
            callback(null, result);
        });
    },

    /**
     * Injects (adds) an amount to a user's wallet balance.
     *
     * @param {number} userId - The ID of the user whose wallet to update.
     * @param {number} amount - The amount to add to the wallet.
     * @param {function} callback - Callback function (err, result)
     */
    injectWalletBalance: (userId, amount, callback) => {
        const sql = `
            UPDATE users
            SET wallet_balance = wallet_balance + ?
            WHERE id = ?;
        `;
        db.query(sql, [amount, userId], callback);
    },

    /**
     * Fetches a single user by ID, specifically for admin actions.
     * @param {number} userId - The ID of the user to fetch.
     * @param {function} callback - Callback function (err, user)
     */
    findById: (userId, callback) => {
        const sql = `SELECT * FROM users WHERE id = ?`;
        db.query(sql, [userId], (err, results) => {
            if (err) {
                return callback(err);
            }
            callback(null, results[0]); // Return the first result (the user object)
        });
    },

    /**
     * Updates a user's general profile information.
     * @param {number} userId - The ID of the user to update.
     * @param {object} updateData - An object containing fields to update (e.g., { username, phone, walletAddress, password }).
     * @param {function} callback - Callback function (err, result)
     */
    updateUser: (userId, updateData, callback) => {
        const fields = [];
        const values = [];

        // Dynamically build the SET clause based on provided updateData
        if (updateData.username !== undefined) {
            fields.push('username = ?');
            values.push(updateData.username);
        }
        if (updateData.phone !== undefined) {
            fields.push('phone = ?');
            values.push(updateData.phone);
        }
        if (updateData.walletAddress !== undefined) {
            fields.push('walletAddress = ?'); // Update the new column
            values.push(updateData.walletAddress);
        }
        if (updateData.password !== undefined) { // This should be the HASHED password
            fields.push('password = ?');
            values.push(updateData.password);
        }

        // If no fields are provided for update, return immediately
        if (fields.length === 0) {
            return callback(null, { affectedRows: 0 }); // Indicate no changes were made
        }

        // Construct the SQL query
        const sql = `
            UPDATE users
            SET ${fields.join(', ')}
            WHERE id = ?;
        `;
        values.push(userId); // Add userId to the end of values for the WHERE clause

        // Execute the query
        db.query(sql, values, callback);
    },

    /**
     * Assigns a generated wallet address and its private key to a user.
     * @param {number} userId - The ID of the user to update.
     * @param {string} walletAddress - The generated public wallet address.
     * @param {string} privateKey - The private key associated with the wallet address.
     * @param {function} callback - Callback function (err, result)
     */
    assignWalletAddress: (userId, walletAddress, privateKey, callback) => {
        // IMPORTANT SECURITY NOTE: Storing private keys in your database is highly sensitive.
        // Ensure your database is extremely secure and consider encryption for this field.
        // For production, you might use a separate key management system or only store public addresses.
        const sql = `
            UPDATE users
            SET walletAddress = ?,
                privateKey = ? -- Assuming you added a privateKey column (VARCHAR)
            WHERE id = ? AND (walletAddress IS NULL OR walletAddress = ''); -- Only update if not already set
        `;
        db.query(sql, [walletAddress, privateKey, userId], callback);
    },

    /**
     * ADDED: Deletes a user from the database.
     * @param {number} userId - The ID of the user to delete.
     * @param {function} callback - Callback function (err, result)
     */
    deleteUser: (userId, callback) => {
        // IMPORTANT: Consider foreign key constraints. If other tables reference this user,
        // you might need to delete related records first or set up CASCADE DELETE in your DB schema.
        const sql = `DELETE FROM users WHERE id = ?;`;
        db.query(sql, [userId], callback);
    },
};

module.exports = Admin;
