const db = require('./db');

const Withdrawal = {
    /**
     * Records a new withdrawal request in the database.
     * @param {object} withdrawalData - Object containing withdrawal details.
     * @param {number} withdrawalData.user_id - ID of the user requesting withdrawal.
     * @param {number} withdrawalData.amount - Amount of cryptocurrency to withdraw.
     * @param {string} withdrawalData.currency - The currency being withdrawn (e.g., 'USDT').
     * @param {string} withdrawalData.network - The blockchain network (e.g., 'TRC20').
     * @param {string} withdrawalData.to_address - The customer's external wallet address.
     * @param {function} callback - Callback function (err, result)
     */
    create: (withdrawalData, callback) => {
        const sql = `INSERT INTO withdrawals (user_id, amount, currency, network, to_address)
                     VALUES (?, ?, ?, ?, ?)`;
        db.query(sql, [
            withdrawalData.user_id,
            withdrawalData.amount,
            withdrawalData.currency,
            withdrawalData.network,
            withdrawalData.to_address
        ], callback);
    },

    /**
     * Updates the status and optionally the transaction ID of a withdrawal request.
     * @param {number} withdrawalId - The ID of the withdrawal request.
     * @param {string} status - The new status (e.g., 'processing', 'completed', 'failed').
     * @param {string} [transactionId] - Optional blockchain transaction ID.
     * @param {function} callback - Callback function (err, result)
     */
    updateStatus: (withdrawalId, status, transactionId, callback) => {
        let sql = 'UPDATE withdrawals SET status = ?';
        const params = [status];

        if (transactionId) {
            sql += ', transaction_id = ?';
            params.push(transactionId);
        }

        sql += ' WHERE id = ?';
        params.push(withdrawalId);

        db.query(sql, params, callback);
    },

    /**
     * Finds withdrawal records for a specific user.
     * @param {number} userId - The ID of the user.
     * @param {function} callback - Callback function (err, results)
     */
    findByUserId: (userId, callback) => {
        db.query('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC', [userId], callback);
    },

    /**
     * Finds a withdrawal record by its ID.
     * @param {number} withdrawalId - The ID of the withdrawal record.
     * @param {function} callback - Callback function (err, result)
     */
    findById: (withdrawalId, callback) => {
        db.query('SELECT * FROM withdrawals WHERE id = ?', [withdrawalId], (err, results) => {
            if (err) return callback(err);
            callback(null, results[0]);
        });
    }
};

module.exports = Withdrawal;