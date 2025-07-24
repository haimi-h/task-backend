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
        // MODIFIED: Ensure withdrawal_password is explicitly selected
        const sql = "SELECT id, username, phone, invitation_code, daily_orders, completed_orders, uncompleted_orders, wallet_balance, walletAddress, privateKey, role, default_task_profit, withdrawal_password FROM users WHERE id = ?";
        db.query(sql, [id], (err, results) => {
            if (err) {
                return callback(err);
            }
            callback(null, results[0]);
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

    /**
     * MODIFIED: Atomically updates a user's wallet balance and task counts.
     * This method is crucial for handling lucky order deductions and additions.
     * It now also updates `daily_orders` to 0 if `uncompleted_orders` becomes 0.
     * @param {number} userId - The ID of the user to update.
     * @param {number} amount - The amount to add or deduct from the balance.
     * @param {string} type - 'add' or 'deduct'.
     * @param {number} completedCount - The new completed orders count.
     * @param {number} uncompletedCount - The new uncompleted orders count.
     * @param {function} callback - Callback function (err, result)
     */
    updateBalanceAndTaskCount: (userId, amount, type, completedCount, uncompletedCount, callback) => {
        let sql;
        // Determine the SQL query based on the type ('add' or 'deduct')
        const balanceUpdate = (type === 'add') ? 'wallet_balance = wallet_balance + ?' :
                              (type === 'deduct') ? 'wallet_balance = wallet_balance - ?' :
                              null;

        if (!balanceUpdate) {
            return callback(new Error('Invalid update type for balance.'), null);
        }

        // The daily_orders column will be set to 0 if uncompleted_orders is 0, otherwise it retains its current value.
        sql = `
            UPDATE users
            SET
                ${balanceUpdate},
                completed_orders = ?,\
                uncompleted_orders = ?,\
                daily_orders = CASE
                    WHEN ? = 0 THEN 0 -- If uncompleted_orders becomes 0, set daily_orders to 0
                    ELSE daily_orders -- Otherwise, keep current daily_orders value
                END
            WHERE id = ?;
        `;

        // Parameters for the query: [amount, completedCount, uncompletedCount, uncompletedCount (for CASE), userId]
        db.query(sql, [amount, completedCount, uncompletedCount, uncompletedCount, userId], callback);
    },

    /**
     * NEW METHOD: Atomically deducts a specified amount from a user's wallet balance.
     * Ensures the balance does not go below zero.
     * @param {number} userId - The ID of the user.
     * @param {number} amount - The amount to deduct.
     * @param {function} callback - Callback function (err, result)
     */
    deductBalance: (userId, amount, callback) => {
        // Use a transaction to ensure atomicity
        db.getConnection((err, connection) => {
            if (err) return callback(err);

            connection.beginTransaction(err => {
                if (err) {
                    connection.release();
                    return callback(err);
                }

                // Check current balance first
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

                    // Deduct the balance
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

    /**
     * NEW METHOD: Updates a user's profile with provided data.
     * This is a general-purpose update function.
     * @param {number} userId - The ID of the user to update.
     * @param {object} userData - An object containing the fields to update (e.g., { username: 'newname', default_task_profit: 35.00 }).
     * @param {function} callback - Callback function (err, result)
     */
    updateProfile: (userId, userData, callback) => {
        const fields = [];
        const values = [];

        // Build the SET clause dynamically based on provided userData
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
        values.push(userId); // Add userId to the end of values for the WHERE clause

        db.query(sql, values, callback);
    }
};

module.exports = User;