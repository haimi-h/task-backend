// your-project/models/rechargeRequest.model.js
const db = require('./db');

const RechargeRequest = {
    /**
     * Creates a new recharge request.
     * @param {number} userId - The ID of the user initiating the recharge.
     * @param {number} amount - The amount recharged.
     * @param {string} currency - The currency (e.g., 'USDT', 'TRX').
     * @param {string|null} receiptImageUrl - URL to the uploaded receipt image.
     * @param {string|null} whatsappNumber - User's WhatsApp number for receipt.
     * @param {number|null} injectionPlanId - The ID of the lucky order plan, if applicable.
     * @param {function} callback - Callback function (err, result)
     */
    create: (userId, amount, currency, receiptImageUrl, whatsappNumber, injectionPlanId, callback) => {
        const sql = `
            INSERT INTO recharge_requests (user_id, amount, currency, receipt_image_url, whatsapp_number, status, injection_plan_id)
            VALUES (?, ?, ?, ?, ?, 'pending', ?);
        `;
        // Ensure optional fields are explicitly null
        db.query(sql, [userId, amount, currency, receiptImageUrl || null, whatsappNumber || null, injectionPlanId || null], callback);
    },

    /**
     * NEW FUNCTION: Checks if an approved recharge exists for a specific injection plan.
     * @param {number} userId - The ID of the user.
     * @param {number} injectionPlanId - The ID of the lucky order plan.
     * @param {function} callback - Callback function (err, result)
     */
    findApprovedByInjectionPlanId: (userId, injectionPlanId, callback) => {
        const sql = `
            SELECT id FROM recharge_requests
            WHERE user_id = ? AND injection_plan_id = ? AND status = 'approved'
            LIMIT 1;
        `;
        db.query(sql, [userId, injectionPlanId], (err, results) => {
            if (err) return callback(err);
            // Return true if a matching approved request is found, otherwise false
            callback(null, results.length > 0);
        });
    },

    /**
     * Fetches all pending recharge requests for admin review.
     * Includes user details.
     * @param {function} callback - Callback function (err, requests)
     */
    getPendingRequests: (callback) => {
        const sql = `
            SELECT
                rr.id,
                rr.user_id,
                u.username,
                u.phone,
                rr.amount,
                rr.currency,
                rr.receipt_image_url,
                rr.whatsapp_number,
                rr.created_at
            FROM
                recharge_requests rr
            JOIN
                users u ON rr.user_id = u.id
            WHERE
                rr.status = 'pending'
            ORDER BY
                rr.created_at DESC;
        `;
        db.query(sql, callback);
    },
    
    getHistoryByUserId: (userId, callback) => {
        const sql = `
            SELECT
                id,
                amount,
                currency,
                status,
                admin_notes,
                created_at,
                updated_at,
                injection_plan_id
            FROM
                recharge_requests
            WHERE
                user_id = ?
            ORDER BY
                created_at DESC;
        `;
        db.query(sql, [userId], callback);
    },

    /**
     * Updates the status of a recharge request.
     * @param {number} requestId - The ID of the recharge request.
     * @param {string} status - New status ('approved' or 'rejected').
     * @param {string} [adminNotes] - Optional notes from the admin.
     * @param {function} callback - Callback function (err, result)
     */
    updateStatus: (requestId, status, adminNotes, callback) => {
        const sql = `
            UPDATE recharge_requests
            SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?;
        `;
        db.query(sql, [status, adminNotes, requestId], callback);
    },

    /**
     * Fetches a single recharge request by ID.
     * @param {number} requestId - The ID of the recharge request.
     * @param {function} callback - Callback function (err, request)
     */
    findById: (requestId, callback) => {
        const sql = `
            SELECT
                rr.id,
                rr.user_id,
                u.username,
                u.phone,
                rr.amount,
                rr.currency,
                rr.receipt_image_url,
                rr.whatsapp_number,
                rr.status,
                rr.admin_notes,
                rr.created_at,
                rr.updated_at,
                rr.injection_plan_id
            FROM
                recharge_requests rr
            JOIN
                users u ON rr.user_id = u.id
            WHERE
                rr.id = ?;
        `;
        db.query(sql, [requestId], (err, results) => {
            if (err) return callback(err);
            callback(null, results[0]);
        });
    },

    /**
     * Fetches a user's recharge requests, optionally filtered by status.
     * @param {number} userId - The ID of the user.
     * @param {string} [status] - Optional status to filter by (e.g., 'rejected', 'approved').
     * @param {function} callback - Callback function (err, requests)
     */
    getRequestsByUserId: (userId, status, callback) => {
        let sql = `
            SELECT
                id,
                amount,
                currency,
                receipt_image_url,
                status,
                admin_notes,
                created_at
            FROM
                recharge_requests
            WHERE
                user_id = ?
        `;
        const params = [userId];

        if (status) {
            sql += ` AND status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY created_at DESC;`;
        db.query(sql, params, callback);
    }
};

module.exports = RechargeRequest;