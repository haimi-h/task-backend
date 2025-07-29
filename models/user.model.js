// your-project/models/user.model.js
const db = require('./db'); // Ensure this path is correct
const bcrypt = require('bcryptjs'); // For password comparison if needed elsewhere, good to keep it consistent

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

    findByUsername: (username, callback) => {
        db.query(`SELECT * FROM users WHERE username = ?`, [username], callback);
    },

    findByInvitationCode: (code, callback) => {
        db.query("SELECT id, username, phone, invitation_code FROM users WHERE invitation_code = ?", [code], callback);
    },

    findById: (id, callback) => {
        db.query(`SELECT * FROM users WHERE id = ?`, [id], callback);
    },

    /**
     * Updates user's wallet balance.
     * @param {number} userId - The ID of the user.
     * @param {number} newBalance - The new balance to set for the user.
     * @param {function} callback - Callback function (err, result)
     */
    updateWalletBalance: (userId, newBalance, callback) => {
        const sql = `UPDATE users SET wallet_balance = ? WHERE id = ?`;
        db.query(sql, [newBalance, userId], callback);
    },

    /**
     * Updates user's wallet balance and increments/decrements task counts.
     * This method handles both balance updates and task count increments/decrements in one go.
     * It uses a transaction to ensure atomicity.
     *
     * @param {number} userId - The ID of the user.
     * @param {number} newBalance - The new balance to set for the user.
     * @param {boolean} incrementCompleted - True to increment completed_orders.
     * @param {boolean} incrementDaily - True to increment daily_orders.
     * @param {boolean} decrementUncompleted - True to decrement uncompleted_orders.
     * @param {function} callback - Callback function (err, result)
     */
    updateBalanceAndTaskCount: (userId, newBalance, incrementCompleted, incrementDaily, decrementUncompleted, callback) => {
        // Defensive check for callback
        if (typeof callback !== 'function') {
            console.error("[User Model - updateBalanceAndTaskCount] Callback is not a function.");
            // In a real app, you might throw an error or handle this more gracefully if no callback is critical.
            // For now, we'll just return to prevent a TypeError.
            return;
        }

        db.getConnection((err, connection) => {
            if (err) {
                console.error("[User Model - updateBalanceAndTaskCount] Error getting database connection:", err);
                return callback(err);
            }

            connection.beginTransaction(err => {
                if (err) {
                    connection.release();
                    console.error("[User Model - updateBalanceAndTaskCount] Error beginning transaction:", err);
                    return callback(err);
                }

                // First, update the balance
                const updateBalanceSql = `UPDATE users SET wallet_balance = ? WHERE id = ?`;
                connection.query(updateBalanceSql, [newBalance, userId], (err, balanceUpdateResult) => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            console.error("[User Model - updateBalanceAndTaskCount] Error updating balance:", err);
                            callback(err);
                        });
                    }

                    // Then, update task counts based on flags
                    let updateTaskCountsSql = `UPDATE users SET`;
                    const updateTaskCountsValues = [];
                    const updates = [];

                    if (incrementCompleted) {
                        updates.push(`completed_orders = completed_orders + 1`);
                    }
                    if (incrementDaily) {
                        updates.push(`daily_orders = daily_orders + 1`);
                    }
                    if (decrementUncompleted) {
                        updates.push(`uncompleted_orders = GREATEST(0, uncompleted_orders - 1)`);
                    }

                    if (updates.length > 0) {
                        updateTaskCountsSql += ` ${updates.join(', ')} WHERE id = ?`;
                        updateTaskCountsValues.push(userId);

                        connection.query(updateTaskCountsSql, updateTaskCountsValues, (err, updateResult) => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
                                    console.error("[User Model - updateBalanceAndTaskCount] Error updating task counts:", err);
                                    callback(err);
                                });
                            }

                            connection.commit(err => {
                                if (err) {
                                    return connection.rollback(() => {
                                        connection.release();
                                        callback(err);
                                    });
                                }
                                connection.release();
                                callback(null, updateResult);
                            });
                        });
                    } else {
                        // If no task counts need updating, just commit the balance change
                        connection.commit(err => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
                                    callback(err);
                                });
                            }
                            connection.release();
                            callback(null, balanceUpdateResult); // Line 86 could be this one if updates.length is 0
                        });
                    }
                });
            });
        });
    },

    updateProfile: (userId, userData, callback) => {
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

    updateWithdrawalWalletAddress: (userId, newAddress, callback) => {
        const sql = `UPDATE users SET withdrawal_wallet_address = ? WHERE id = ?`;
        db.query(sql, [newAddress, userId], callback);
    }
};

module.exports = User;