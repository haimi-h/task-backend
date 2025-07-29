// your-project/models/user.model.js
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
        const sql = "SELECT id, username, phone, invitation_code, daily_orders, completed_orders, uncompleted_orders, wallet_balance, walletAddress, privateKey, withdrawal_wallet_address, role, withdrawal_password FROM users WHERE id = ?";
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

    // MODIFIED: This function now correctly handles order count updates
    updateBalanceAndTaskCount: (userId, amount, type, callback) => {
        let sql;
        let params;

        if (type === 'add') { // This means a task has just been successfully completed (profit added)
            // REMOVED: daily_orders decrement from here.
            // daily_orders should only be set/updated by admin actions.
            sql = `
                UPDATE users
                SET
                    wallet_balance = wallet_balance + ?,
                    completed_orders = completed_orders + 1,
                    uncompleted_orders = CASE WHEN uncompleted_orders > 0 THEN uncompleted_orders - 1 ELSE 0 END,
                    last_activity_at = NOW()
                WHERE id = ?;
            `;
            params = [amount, userId];
        } else if (type === 'deduct') { // This is for lucky order capital deduction (no order count change here)
             sql = `
                UPDATE users
                SET
                    wallet_balance = wallet_balance - ?,
                    last_activity_at = NOW()
                WHERE id = ?;
            `;
            params = [amount, userId];
        } else {
            return callback(new Error('Invalid update type for balance.'), null);
        }

        db.query(sql, params, callback);
    },

    /**
     * NEW METHOD: A simpler function to update only the wallet balance.
     * Used for recharge approvals and other direct balance adjustments.
     * @param {number} userId - The ID of the user whose wallet to update.
     * @param {number} amount - The amount to add or deduct.
     * @param {string} type - 'add' or 'deduct'.
     * @param {function} callback - Callback function (err, result)
     */
    updateWalletBalance: (userId, amount, type, callback) => {
        let sql;
        if (type === 'add') {
            sql = `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`;
        } else if (type === 'deduct') {
            sql = `UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?`;
        } else {
            return callback(new Error('Invalid update type for wallet balance. Must be "add" or "deduct".'));
        }
        db.query(sql, [amount, userId], callback);
    },

    deductBalance: (userId, amount, callback) => {
        db.getConnection((err, connection) => {
            if (err) return callback(err);

            connection.beginTransaction(err => {
                if (err) {
                    connection.release();
                    return callback(err);
                }

                connection.query('SELECT wallet_balance FROM users WHERE id = ? FOR UPDATE', [userId], (err, results) => {
                    if (err) {
                        return connection.rollback(() => {
                            connection.release();
                            callback(err);
                        });
                    }

                    if (results.length === 0) {
                        return connection.rollback(() => {
                            connection.release();
                            callback(new Error('User not found.'));
                        });
                    }

                    const currentBalance = parseFloat(results[0].wallet_balance);
                    if (currentBalance < amount) {
                        return connection.rollback(() => {
                            connection.release();
                            callback(new Error('Insufficient balance.'));
                        });
                    }

                    connection.query(
                        'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?',
                        [amount, userId],
                        (err, updateResult) => {
                            if (err) {
                                return connection.rollback(() => {
                                    connection.release();
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
                        }
                    );
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
