const db = require('./db'); // Ensure this path is correct

const User = {
    create: (userData, callback) => {
        // IMPORTANT: Added 'referrer_id', 'daily_orders', 'completed_orders', 'uncompleted_orders'
        const sql = `INSERT INTO users (username, phone, password, withdrawal_password, invitation_code, referrer_id, role, daily_orders, completed_orders, uncompleted_orders)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        db.query(sql, [
            userData.username,
            userData.phone,
            userData.password,
            userData.withdrawal_password,
            userData.invitation_code,
            userData.referrer_id, // Added this
            userData.role,        // Added this
            userData.daily_orders,    // FIX: Added this
            userData.completed_orders, // FIX: Added this
            userData.uncompleted_orders // FIX: Added this
        ], callback);
    },

    findByPhone: (phone, callback) => {
        db.query(`SELECT * FROM users WHERE phone = ?`, [phone], callback);
    },

    // NEW METHOD: Find a user by their invitation code
    findByInvitationCode: (code, callback) => {
        db.query("SELECT id, username, phone, invitation_code FROM users WHERE invitation_code = ?", [code], callback);
    },

    // NEW METHOD: Find a user by their ID (for profile fetching)
    findById: (id, callback) => {
        // UPDATED: Include walletAddress and privateKey in the SELECT statement
        const sql = "SELECT id, username, phone, invitation_code, daily_orders, completed_orders, uncompleted_orders, wallet_balance, walletAddress, privateKey, role FROM users WHERE id = ?";
        db.query(sql, [id], (err, results) => {
            if (err) {
                console.error(`[User Model - findById] Database error for User ${id}:`, err); // DEBUG LOG
                return callback(err);
            }
            const user = results[0] || null;
            console.log(`[User Model - findById] Fetched user data for ID ${id}:`, user); // DEBUG LOG
            callback(null, user);
        });
    },

    /**
     * NEW METHOD: Updates a user's completed_orders and uncompleted_orders counts.
     * This is crucial for synchronizing the admin table with actual user activity.
     *
     * @param {number} userId - The ID of the user to update.
     * @param {number} completedCount - The new count for completed orders.
     * @param {number} uncompletedCount - The new count for uncompleted orders.
     * @param {function} callback - Callback function (err, result)
     */
    updateUserTaskCounts: (userId, completedCount, uncompletedCount, callback) => {
        const sql = `
            UPDATE users
            SET completed_orders = ?, uncompleted_orders = ?
            WHERE id = ?;
        `;
        db.query(sql, [completedCount, uncompletedCount, userId], callback);
    }
};

module.exports = User;
