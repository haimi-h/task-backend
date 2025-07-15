const db = require('./db'); // Ensure this path is correct

const User = {
    create: (userData, callback) => {
        const sql = `INSERT INTO users (username, phone, password, withdrawal_password, invitation_code, referrer_id, role, daily_orders, completed_orders, uncompleted_orders)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(sql, [
            userData.username,
            userData.phone,
            userData.password,
            userData.withdrawal_password,
            userData.invitation_code,
            userData.referrer_id,
            userData.role,
            userData.daily_orders,
            userData.completed_orders,
            userData.uncompleted_orders
        ], callback);
    },

    findByPhone: (phone, callback) => {
        db.query(`SELECT * FROM users WHERE phone = ?`, [phone], callback);
    },

    findByInvitationCode: (code, callback) => {
        db.query("SELECT id, username, phone, invitation_code FROM users WHERE invitation_code = ?", [code], callback);
    },

    findById: (id, callback) => {
        // Include wallet_balance, walletAddress, and privateKey in the SELECT statement
        const sql = "SELECT id, username, phone, invitation_code, daily_orders, completed_orders, uncompleted_orders, wallet_balance, walletAddress, privateKey, role FROM users WHERE id = ?";
        db.query(sql, [id], (err, results) => {
            if (err) {
                console.error(`[User Model - findById] Database error for User ${id}:`, err);
                return callback(err);
            }
            const user = results[0] || null;
            console.log(`[User Model - findById] Fetched user data for ID ${id}:`, user);
            callback(null, user);
        });
    },

    updateUserTaskCounts: (userId, completedCount, uncompletedCount, callback) => {
        const sql = `
            UPDATE users
            SET completed_orders = ?, uncompleted_orders = ?
            WHERE id = ?;
        `;
        db.query(sql, [completedCount, uncompletedCount, userId], callback);
    },

    /**
     * NEW METHOD: Atomically updates a user's wallet balance and task counts.
     * This method is crucial for handling lucky order deductions and additions.
     * @param {number} userId - The ID of the user to update.
     * @param {number} amount - The amount to add or deduct from the balance.
     * @param {string} type - 'add' or 'deduct'.
     * @param {number} completedCount - The new completed orders count.
     * @param {number} uncompletedCount - The new uncompleted orders count.
     * @param {function} callback - Callback function (err, result)
     */
    updateBalanceAndTaskCount: (userId, amount, type, completedCount, uncompletedCount, callback) => {
        let sql;
        if (type === 'add') {
            sql = `
                UPDATE users
                SET wallet_balance = wallet_balance + ?, completed_orders = ?, uncompleted_orders = ?
                WHERE id = ?;
            `;
        } else if (type === 'deduct') {
            sql = `
                UPDATE users
                SET wallet_balance = wallet_balance - ?, completed_orders = ?, uncompleted_orders = ?
                WHERE id = ?;
            `;
        } else {
            return callback(new Error('Invalid update type for balance.'), null);
        }
        db.query(sql, [amount, completedCount, uncompletedCount, userId], callback);
    },
};

module.exports = User;