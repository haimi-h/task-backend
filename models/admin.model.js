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
                u.walletAddress,    -- ADDED: to fetch the new wallet address column (recharge wallet)
                u.withdrawal_wallet_address, -- ADDED: to fetch the withdrawal wallet address
                u.role,
                u.created_at
                
            FROM
                users u
            LEFT JOIN
                users r ON u.referrer_id = r.id
            WHERE 1=1
        `;
        let countSql = `
            SELECT COUNT(*) AS totalCount
            FROM users u
            WHERE 1=1
        `;
        const params = [];
        const countParams = [];

        if (filters.username) {
            sql += ` AND u.username LIKE ?`;
            countSql += ` AND u.username LIKE ?`;
            params.push(`%${filters.username}%`);
            countParams.push(`%${filters.username}%`);
        }
        if (filters.phone) {
            sql += ` AND u.phone LIKE ?`;
            countSql += ` AND u.phone LIKE ?`;
            params.push(`%${filters.phone}%`);
            countParams.push(`%${filters.phone}%`);
        }
        if (filters.code) {
            sql += ` AND u.invitation_code LIKE ?`;
            countSql += ` AND u.invitation_code LIKE ?`;
            params.push(`%${filters.code}%`);
            countParams.push(`%${filters.code}%`);
        }
        if (filters.wallet) { // This filter will likely search on 'walletAddress' (recharge wallet)
            sql += ` AND u.walletAddress LIKE ?`;
            countSql += ` AND u.walletAddress LIKE ?`;
            params.push(`%${filters.wallet}%`);
            countParams.push(`%${filters.wallet}%`);
        }
        // You could add a filter for withdrawal_wallet_address here if needed in the future
        // if (filters.withdrawalWallet) {
        //     sql += ` AND u.withdrawal_wallet_address LIKE ?`;
        //     countSql += ` AND u.withdrawal_wallet_address LIKE ?`;
        //     params.push(`%${filters.withdrawalWallet}%`);
        //     countParams.push(`%${filters.withdrawalWallet}%`);
        // }


        sql += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        db.query(countSql, countParams, (err, countResult) => {
            if (err) {
                return callback(err, null, 0);
            }
            const totalCount = countResult[0].totalCount;

            db.query(sql, params, (err, results) => {
                if (err) {
                    return callback(err, null, 0);
                }
                callback(null, results, totalCount);
            });
        });
    },

    /**
     * Updates a user's daily_orders count.
     * FIX: Also sets uncompleted_orders to daily_orders when updating to reflect new daily tasks.
     * @param {number} userId - The ID of the user to update.
     * @param {number} newDailyOrders - The new value for daily_orders.
     * @param {function} callback - Callback function (err, result)
     */
    updateUserDailyOrders: (userId, newDailyOrders, callback) => {
        // When daily_orders are updated, uncompleted_orders should be reset to this new value
        const sql = `UPDATE users SET daily_orders = ?, uncompleted_orders = ? WHERE id = ?`;
        db.query(sql, [newDailyOrders, newDailyOrders, userId], callback);
    },

    /**
     * Updates a user's profile information.
     * Handles username, phone, password, wallet address, role, and various order counts.
     * ADDED: wallet_balance to be updated.
     * ADDED: default_task_profit for non-lucky orders.
     * ADDED: withdrawal_wallet_address update capability (keeping this for future use if admin needs to manage it)
     *
     * @param {number} userId - The ID of the user to update.
     * @param {object} updates - An object containing fields to update (e.g., { username: 'newname', phone: '12345' }).
     * @param {function} callback - Callback function (err, result)
     */
    updateUserProfile: (userId, updates, callback) => {
        const updateFields = [];
        const params = [];

        if (updates.username !== undefined) {
            updateFields.push('username = ?');
            params.push(updates.username);
        }
        if (updates.phone !== undefined) {
            updateFields.push('phone = ?');
            params.push(updates.phone);
        }
        if (updates.password !== undefined) {
            updateFields.push('password = ?');
            params.push(updates.password);
        }
        if (updates.withdrawal_password !== undefined) {
            updateFields.push('withdrawal_password = ?');
            params.push(updates.withdrawal_password);
        }
        if (updates.role !== undefined) {
            updateFields.push('role = ?');
            params.push(updates.role);
        }
        if (updates.walletAddress !== undefined) {
            updateFields.push('walletAddress = ?');
            params.push(updates.walletAddress);
        }
        // ADDED: withdrawal_wallet_address update capability (this will not interfere with tasking)
        if (updates.withdrawal_wallet_address !== undefined) {
            updateFields.push('withdrawal_wallet_address = ?');
            params.push(updates.withdrawal_wallet_address);
        }
        if (updates.daily_orders !== undefined) {
            updateFields.push('daily_orders = ?');
            params.push(updates.daily_orders);
        }
        if (updates.completed_orders !== undefined) {
            updateFields.push('completed_orders = ?');
            params.push(updates.completed_orders);
        }
        if (updates.uncompleted_orders !== undefined) {
            updateFields.push('uncompleted_orders = ?');
            params.push(updates.uncompleted_orders);
        }
        // ADDED: wallet_balance update
        if (updates.wallet_balance !== undefined) {
            updateFields.push('wallet_balance = ?');
            params.push(updates.wallet_balance);
        }
        // ADDED: default_task_profit update
        // if (updates.defaultTaskProfit !== undefined) {
        //     updateFields.push('default_task_profit = ?');
        //     params.push(updates.defaultTaskProfit);
        // }


        if (updateFields.length === 0) {
            return callback(null, { affectedRows: 0 }); // Nothing to update
        }

        const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
        params.push(userId);

        db.query(sql, params, callback);
    },

    /**
     * Injects (adds) funds to a user's wallet balance.
     * @param {number} userId - The ID of the user to update.
     * @param {number} amount - The amount to add to the wallet balance.
     * @param {function} callback - Callback function (err, result)
     */
    injectWalletBalance: (userId, amount, callback) => {
        const sql = `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`;
        db.query(sql, [amount, userId], callback);
    },

    /**
     * Assigns a newly generated TRC20 wallet address and its private key to a user.
     * Only updates if walletAddress is not already set or is empty.
     *
     * @param {number} userId - The ID of the user to update.
     * @param {string} walletAddress - The TRC20 wallet address.
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