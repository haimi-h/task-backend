const db = require('./db');

const InjectionPlan = {
    /**
     * Creates a new injection plan record for a user.
     * @param {object} planData - The data for the new injection plan.
     * @param {function} callback - The callback function (err, result).
     */
    create: (planData, callback) => {
        const sql = `
            INSERT INTO injection_plans
            (user_id, injection_order, commission_rate, injections_amount, is_completed)
            VALUES (?, ?, ?, ?, ?)
        `;
        db.query(
            sql,
            [
                planData.user_id,
                planData.injection_order,
                planData.commission_rate,
                planData.injections_amount,
                0 // Default to 0 (not completed) for new plans
            ],
            callback
        );
    },

    /**
     * Finds all injection plans for a specific user.
     * @param {number} userId - The ID of the user.
     * @param {function} callback - The callback function (err, results).
     */
    findByUserId: (userId, callback) => {
        // Only fetch plans that are not completed (is_completed = 0)
        const sql = `SELECT * FROM injection_plans WHERE user_id = ? AND is_completed = 0 ORDER BY injection_order ASC`;
        db.query(sql, [userId], callback);
    },

    /**
     * Finds a specific injection plan for a user based on their user ID and the injection order.
     * This is used to determine if a given task (by its sequential order) is a lucky order.
     * @param {number} userId - The ID of the user.
     * @param {number} injectionOrder - The specific order number of the injection.
     * @param {function} callback - The callback function (err, result).
     */
    findByUserIdAndOrder: (userId, injectionOrder, callback) => {
        // Only consider plans that are not completed (is_completed = 0)
        const sql = `SELECT * FROM injection_plans WHERE user_id = ? AND injection_order = ? AND is_completed = 0 LIMIT 1`;
        db.query(sql, [userId, injectionOrder], (err, results) => {
            if (err) {
                console.error(`[InjectionPlan Model - findByUserIdAndOrder] Error fetching plan for User ${userId}, Order ${injectionOrder}:`, err);
                return callback(err, null);
            }
            callback(null, results[0] || null);
        });
    },

    /**
     * Updates an existing injection plan.
     * @param {number} id - The ID of the injection plan to update.
     * @param {object} planData - The updated data.
     * @param {function} callback - The callback function (err, result).
     */
    update: (id, planData, callback) => {
        const sql = `
            UPDATE injection_plans
            SET injection_order = ?, commission_rate = ?, injections_amount = ?
            WHERE id = ?
        `;
        db.query(
            sql,
            [
                planData.injection_order,
                planData.commission_rate,
                planData.injections_amount,
                id,
            ],
            callback
        );
    },

    /**
     * Deletes an injection plan by its ID.
     * @param {number} id - The ID of the injection plan to delete.
     * @param {function} callback - The callback function (err, result).
     */
    delete: (id, callback) => {
        const sql = `DELETE FROM injection_plans WHERE id = ?`;
        db.query(sql, [id], callback);
    },

    /**
     * NEW METHOD: Marks an injection plan as 'used' (completed) after it has been successfully processed.
     * This prevents the same lucky order from being triggered multiple times.
     * @param {number} userId - The ID of the user for whom the plan was used.
     * @param {number} injectionOrder - The order number of the plan that was used.
     * @param {function} callback - The callback function (err, result).
     */
    markAsUsed: (userId, injectionOrder, callback) => {
        const sql = `
            UPDATE injection_plans
            SET is_completed = 1
            WHERE user_id = ? AND injection_order = ? AND is_completed = 0;
        `;
        db.query(sql, [userId, injectionOrder], (err, result) => {
            if (err) {
                console.error(`[InjectionPlan Model - markAsUsed] Error marking plan for User ${userId}, Order ${injectionOrder} as used:`, err);
                return callback(err);
            }
            console.log(`[InjectionPlan Model - markAsUsed] Plan for User ${userId}, Order ${injectionOrder} marked as used. Affected rows: ${result.affectedRows}`);
            callback(null, result);
        });
    },
};

module.exports = InjectionPlan;
