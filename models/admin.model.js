// admin.model.js
const db = require('./db'); // Ensure this path is correct to your database connection
const bcrypt = require('bcryptjs'); // Assuming you use bcrypt for password hashing in controller

const Admin = {
    /**
     * Fetches a list of all users with relevant details for the admin table.
     * Includes counts for daily, completed, and uncompleted orders, and wallet balance.
     * Also includes the username of the referrer if available.
     *
     * @param {object} filters - Object containing filter criteria (username, phone, code, wallet)
     * @param {number} limit - Number of users to return per page.
     * @param {number} offset - Offset for pagination.
     * @param {function} callback - Callback function (err, results, totalCount)
     */
    getAllUsersForAdmin: (filters, limit, offset, callback) => {
        let sql = `
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
                u.walletAddress,    -- This is likely the "recharging" address, keep for completeness
                u.withdrawal_wallet_address, -- ADDED: To fetch the withdrawal wallet address
                u.role,
                u.created_at,
                u.default_task_profit -- Default profit for a task
            FROM users u
            LEFT JOIN users r ON u.referrer_id = r.id
        `;

        const queryParams = [];
        const conditions = [];

        // Build WHERE clause based on filters
        if (filters.username) {
            conditions.push(`u.username LIKE ?`);
            queryParams.push(`%${filters.username}%`);
        }
        if (filters.phone) {
            conditions.push(`u.phone LIKE ?`);
            queryParams.push(`%${filters.phone}%`);
        }
        if (filters.invitation_code) {
            conditions.push(`u.invitation_code = ?`);
            queryParams.push(filters.invitation_code);
        }
        // MODIFIED: If filtering by 'wallet', it should filter on withdrawal_wallet_address now
        // if your UI filter input is for 'withdrawal_wallet_address'.
        // If it's for 'walletAddress' (recharging address), keep it as is.
        // Assuming 'wallet' filter in UI now refers to withdrawal wallet address for admin's view
        if (filters.wallet) {
            conditions.push(`u.withdrawal_wallet_address LIKE ?`);
            queryParams.push(`%${filters.wallet}%`);
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }

        // Add ORDER BY clause for consistent sorting (e.g., by creation date)
        sql += ` ORDER BY u.created_at DESC`; // Order by newest users first

        // Add LIMIT and OFFSET for pagination
        sql += ` LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        // First, get the total count for pagination (before applying LIMIT/OFFSET)
        let countSql = `SELECT COUNT(u.id) AS totalUsers FROM users u`;
        if (conditions.length > 0) {
            countSql += ` WHERE ` + conditions.join(' AND ');
        }

        db.query(countSql, queryParams.slice(0, queryParams.length - 2), (err, countResults) => { // Remove limit and offset for count query
            if (err) {
                console.error('Error fetching total user count:', err);
                return callback(err);
            }
            const totalUsersCount = countResults[0].totalUsers;

            // Then, get the paginated user data
            db.query(sql, queryParams, (err, results) => {
                if (err) {
                    console.error('Error fetching paginated user data:', err);
                    return callback(err);
                }
                callback(null, results, totalUsersCount);
            });
        });
    },

    /**
     * UPDATED: Updates a user's daily orders.
     * @param {number} userId - The ID of the user.
     * @param {number} dailyOrders - The new number of daily orders.
     * @param {function} callback - Callback function (err, result)
     */
    updateUserDailyOrders: (userId, dailyOrders, callback) => {
        const sql = `UPDATE users SET daily_orders = ? WHERE id = ?`;
        db.query(sql, [dailyOrders, userId], callback);
    },

    /**
     * UPDATED: Injects (adds) balance to a user's wallet.
     * @param {number} userId - The ID of the user.
     * @param {number} amount - The amount to add.
     * @param {function} callback - Callback function (err, result)
     */
    injectWallet: (userId, amount, callback) => {
        // Ensure amount is positive and valid
        if (typeof amount !== 'number' || amount <= 0) {
            return callback(new Error('Invalid injection amount. Must be a positive number.'));
        }
        const sql = `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`;
        db.query(sql, [amount, userId], callback);
    },

    /**
     * ADDED: Updates a user's profile with provided data.
     * This is a general-purpose update function, including walletAddress, withdrawal_password, etc.
     * @param {number} userId - The ID of the user to update.
     * @param {object} userData - An object containing the fields to update (e.g., { username: 'newname', default_task_profit: 35.00 }).
     * @param {function} callback - Callback function (err, result)
     */
    updateUserProfile: (userId, userData, callback) => {
        const fields = [];
        const values = [];

        for (const key in userData) {
            if (userData.hasOwnProperty(key)) {
                fields.push(`${key} = ?`);
                values.push(userData[key]);
            }
        }

        if (fields.length === 0) {
            return callback(new Error('No fields provided for update.'), null);
        }

        const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
        values.push(userId);

        db.query(sql, values, callback);
    },

    /**
     * ADDED: Assigns a new wallet address and its private key to a user.
     * This is specifically for the system-generated 'recharging' wallet address.
     * @param {number} userId - The ID of the user.
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