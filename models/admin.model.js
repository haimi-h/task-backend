// admin.model.js
const db = require('./db'); // Ensure this path is correct to your database connection
const bcrypt = require('bcryptjs'); // Assuming you use bcrypt for password hashing in controller

const Admin = {
    // ... (Your existing methods like getAllUsersForAdmin, updateUserDailyOrders, injectWalletBalance, etc.)

    /**
     * Fetches a paginated list of users with relevant details for the admin table, applying filters.
     * Includes counts for daily, completed, and uncompleted orders, and wallet balance.
     * Also includes the username of the referrer if available.
     *
     * @param {Object} filters - An object containing filter criteria (e.g., { username: 'john', phone: '123' }).
     * @param {number} skip - The number of records to skip for pagination (offset).
     * @param {number} limit - The maximum number of records to return (limit).
     * @returns {Promise<{users: Array, totalUsers: number}>} - A promise resolving to an object with paginated users and their total count.
     */
    getPaginatedUsersForAdmin: (filters, skip, limit) => {
        return new Promise((resolve, reject) => {
            let filterConditions = [];
            let queryParams = [];

            // Build filter conditions
            if (filters.username) {
                filterConditions.push("u.username LIKE ?");
                queryParams.push(`%${filters.username}%`);
            }
            if (filters.phone) {
                filterConditions.push("u.phone = ?");
                queryParams.push(filters.phone);
            }
            if (filters.invitation_code) { // This maps to 'code' filter from frontend
                filterConditions.push("u.invitation_code = ?");
                queryParams.push(filters.invitation_code);
            }
            if (filters.walletAddress) { // This maps to 'wallet' filter from frontend
                filterConditions.push("u.walletAddress = ?");
                queryParams.push(filters.walletAddress);
            }

            const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

            // 1. Query to get total count of users matching filters
            const countSql = `SELECT COUNT(*) AS total FROM users u ${whereClause};`;
            db.query(countSql, queryParams, (err, countResults) => {
                if (err) {
                    console.error("[Admin Model - getPaginatedUsersForAdmin] Error counting users:", err);
                    return reject(err);
                }
                const totalUsers = countResults[0].total;

                // 2. Query to get paginated users
                const usersSql = `
                    SELECT
                        u.id,
                        u.username,
                        u.phone,
                        u.invitation_code,
                        r.username AS invited_by,
                        u.daily_orders,
                        u.completed_orders,
                        u.uncompleted_orders,
                        u.wallet_balance,
                        u.walletAddress,
                        u.role,
                        u.created_at
                    FROM
                        users u
                    LEFT JOIN
                        users r ON u.referrer_id = r.id
                    ${whereClause}
                    ORDER BY u.created_at DESC -- Order by creation date, newest first
                    LIMIT ? OFFSET ?;
                `;
                // Append limit and skip to the query parameters for the second query
                const paginatedQueryParams = [...queryParams, limit, skip];

                db.query(usersSql, paginatedQueryParams, (err, usersResults) => {
                    if (err) {
                        console.error("[Admin Model - getPaginatedUsersForAdmin] Error fetching paginated users:", err);
                        return reject(err);
                    }
                    resolve({ users: usersResults, totalUsers: totalUsers });
                });
            });
        });
    },

    // ... (Keep the rest of your existing Admin model methods below this)

    /**
     * Original getAllUsersForAdmin kept here for reference if other parts of code still use it directly
     * It's recommended to replace direct calls to this with getPaginatedUsersForAdmin where pagination is needed.
     */
    getAllUsersForAdmin: (callback) => {
        const sql = `
            SELECT
                u.id,
                u.username,
                u.phone,
                u.invitation_code,
                r.username AS invited_by,
                u.daily_orders,
                u.completed_orders,
                u.uncompleted_orders,
                u.wallet_balance,
                u.walletAddress,
                u.role,
                u.created_at
            FROM
                users u
            LEFT JOIN
                users r ON u.referrer_id = r.id;
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
                uncompleted_orders = ?
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
            callback(null, results[0]);
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

        if (updateData.username !== undefined) {
            fields.push('username = ?');
            values.push(updateData.username);
        }
        if (updateData.phone !== undefined) {
            fields.push('phone = ?');
            values.push(updateData.phone);
        }
        if (updateData.walletAddress !== undefined) {
            fields.push('walletAddress = ?');
            values.push(updateData.walletAddress);
        }
        if (updateData.password !== undefined) {
            fields.push('password = ?');
            values.push(updateData.password);
        }

        if (fields.length === 0) {
            return callback(null, { affectedRows: 0 });
        }

        const sql = `
            UPDATE users
            SET ${fields.join(', ')}
            WHERE id = ?;
        `;
        values.push(userId);

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
        const sql = `
            UPDATE users
            SET walletAddress = ?,
                privateKey = ?
            WHERE id = ? AND (walletAddress IS NULL OR walletAddress = '');
        `;
        db.query(sql, [walletAddress, privateKey, userId], callback);
    },

    /**
     * Deletes a user from the database.
     * @param {number} userId - The ID of the user to delete.
     * @param {function} callback - Callback function (err, result)
     */
    deleteUser: (userId, callback) => {
        const sql = `DELETE FROM users WHERE id = ?;`;
        db.query(sql, [userId], callback);
    },
};

module.exports = Admin;