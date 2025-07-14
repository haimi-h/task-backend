
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
            (user_id, injection_order, commission_rate, injections_amount)
            VALUES (?, ?, ?, ?)
        `;
        db.query(
            sql,
            [
                planData.user_id,
                planData.injection_order,
                planData.commission_rate,
                planData.injections_amount,
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
        const sql = `SELECT * FROM injection_plans WHERE user_id = ? ORDER BY injection_order ASC`;
        db.query(sql, [userId], callback);
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
};

module.exports = InjectionPlan;