const db = require('./db'); // Ensure this path is correct to your database connection

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
                u.wallet_balance,
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
            SET daily_orders = ?, uncompleted_orders = ?
            WHERE id = ?;
        `;
        console.log(`[Admin Model - updateUserDailyOrders] Executing SQL: ${sql}`); // DEBUG LOG
        console.log(`[Admin Model - updateUserDailyOrders] Parameters: [${newDailyOrders}, ${newDailyOrders}, ${userId}]`); // DEBUG LOG

        db.query(sql, [newDailyOrders, newDailyOrders, userId], (err, result) => {
            if (err) {
                console.error(`[Admin Model - updateUserDailyOrders] Database error for User ${userId}:`, err); // DEBUG LOG
                return callback(err);
            }
            console.log(`[Admin Model - updateUserDailyOrders] Database query result for User ${userId}:`, result); // DEBUG LOG
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
            if (err) return callback(err);
            callback(null, results[0] || null);
        });
    }
};

module.exports = Admin;