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
        // const sql = "SELECT id, username, phone, invitation_code, daily_orders, completed_orders, uncompleted_orders, wallet_balance, walletAddress, privateKey, withdrawal_wallet_address, role, default_task_profit, withdrawal_password FROM users WHERE id = ?";
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

    updateDailyAndUncompletedOrders: (userId, completedCount, uncompletedCount, callback) => {
        const sql = `
            UPDATE users
            SET completed_orders = ?,
                uncompleted_orders = ?
            WHERE id = ?;
        `;
        db.query(sql, [completedCount, uncompletedCount, userId], callback);
    },

    updateBalanceAndTaskCount: (userId, amount, type, completedCount, uncompletedCount, callback) => {
        let sql;
        const balanceUpdate = (type === 'add') ? 'wallet_balance = wallet_balance + ?' :
                              (type === 'deduct') ? 'wallet_balance = wallet_balance - ?' :
                              null;

        if (!balanceUpdate) {
            return callback(new Error('Invalid update type for balance.'), null);
        }

        sql = `
            UPDATE users
            SET
                ${balanceUpdate},
                completed_orders = ?,\
                uncompleted_orders = ?,\
                daily_orders = CASE
                    WHEN ? = 0 THEN 0
                    ELSE daily_orders
                END
            WHERE id = ?;
        `;

        db.query(sql, [amount, completedCount, uncompletedCount, uncompletedCount, userId], callback);
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
