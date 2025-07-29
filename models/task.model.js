// your-project/models/task.model.js
const db = require('./db');

const Task = {
    // Fetches a single product for a user to rate,
    // prioritizing products they haven't rated as 5 stars yet.
    // This simulates getting "a task" to complete.
    getTaskForUser: (userId, callback) => {
        console.log(`[Task Model - getTaskForUser] Attempting to fetch task for User ${userId}`);

        // First, try to find a product the user hasn't rated at all
        const sqlFindUnrated = `
            SELECT p.*, NULL AS user_rating, FALSE AS is_completed
            FROM products p
            WHERE p.id NOT IN (SELECT product_id FROM user_product_ratings WHERE user_id = ?)
            LIMIT 1;
        `;
        db.query(sqlFindUnrated, [userId], (err, results) => {
            if (err) {
                console.error(`[Task Model - getTaskForUser] Error finding unrated product for User ${userId}:`, err);
                return callback(err, null);
            }
            if (results.length > 0) {
                console.log(`[Task Model - getTaskForUser] Found unrated product for User ${userId}:`, results[0].name);
                return callback(null, results[0]);
            }

            // If no completely unrated products, try to find a product rated less than 5 stars
            const sqlFindNonCompleted = `
                SELECT p.*, upr.rating AS user_rating, upr.is_completed
                FROM products p
                JOIN user_product_ratings upr ON p.id = upr.product_id
                WHERE upr.user_id = ? AND upr.is_completed = 0 AND upr.rating < 5
                LIMIT 1;
            `;
            db.query(sqlFindNonCompleted, [userId], (err, results) => {
                if (err) {
                    console.error(`[Task Model - getTaskForUser] Error finding non-completed product for User ${userId}:`, err);
                    return callback(err, null);
                }
                if (results.length > 0) {
                    console.log(`[Task Model - getTaskForUser] Found non-completed product for User ${userId}:`, results[0].name);
                    return callback(null, results[0]);
                }

                // If all products are either unrated or completed by user, return null for task
                console.log(`[Task Model - getTaskForUser] No unrated or non-completed products found for User ${userId}.`);
                callback(null, null);
            });
        });
    },

    /**
     * NEW METHOD: Submits or updates a product rating for a user.
     * Marks the task as completed if the rating is 5 stars.
     * @param {number} userId - The ID of the user submitting the rating.
     * @param {number} productId - The ID of the product being rated.
     * @param {number} rating - The star rating (1-5).
     * @param {function} callback - Callback function (err, message, isCompleted)
     */
    submitRating: (userId, productId, rating, callback) => {
        const isCompleted = rating === 5 ? 1 : 0; // 1 for true, 0 for false in database

        // Check if a rating already exists for this user and product
        const sqlCheckExisting = `SELECT id FROM user_product_ratings WHERE user_id = ? AND product_id = ?;`;
        db.query(sqlCheckExisting, [userId, productId], (err, results) => {
            if (err) {
                console.error(`[Task Model - submitRating] Error checking existing rating for User ${userId}, Product ${productId}:`, err);
                return callback(err, "Database error checking existing rating.", false);
            }

            if (results.length > 0) {
                // If rating exists, update it
                const ratingId = results[0].id;
                const sqlUpdate = `UPDATE user_product_ratings SET rating = ?, is_completed = ?, updated_at = NOW() WHERE id = ?;`;
                db.query(sqlUpdate, [rating, isCompleted, ratingId], (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error(`[Task Model - submitRating] Error updating rating for User ${userId}, Product ${productId}:`, updateErr);
                        return callback(updateErr, "Failed to update rating.", false);
                    }
                    console.log(`[Task Model - submitRating] Updated rating for User ${userId}, Product ${productId} to ${rating} stars. Completed: ${isCompleted}`);
                    callback(null, "Rating updated successfully!", isCompleted === 1);
                });
            } else {
                // If no rating exists, insert a new one
                const sqlInsert = `INSERT INTO user_product_ratings (user_id, product_id, rating, is_completed) VALUES (?, ?, ?, ?);`;
                db.query(sqlInsert, [userId, productId, rating, isCompleted], (insertErr, insertResult) => {
                    if (insertErr) {
                        console.error(`[Task Model - submitRating] Error inserting rating for User ${userId}, Product ${productId}:`, insertErr);
                        return callback(insertErr, "Failed to submit rating.", false);
                    }
                    console.log(`[Task Model - submitRating] Inserted new rating for User ${userId}, Product ${productId} with ${rating} stars. Completed: ${isCompleted}`);
                    callback(null, "Rating submitted successfully!", isCompleted === 1);
                });
            }
        });
    },

    /**
     * Fetches the number of completed, uncompleted, and daily tasks for a user.
     * This data is used for the dashboard summary.
     * @param {number} userId - The ID of the user.
     * @param {function} callback - Callback function (err, counts)
     */
    getDashboardCountsForUser: (userId, callback) => {
        const sql = `
            SELECT
                COUNT(CASE WHEN upr.is_completed = 1 THEN 1 END) AS completed_orders,
                COUNT(CASE WHEN upr.is_completed = 0 AND upr.rating < 5 THEN 1 END) AS uncompleted_orders,
                COUNT(CASE WHEN upr.is_completed = 1 AND DATE(upr.updated_at) = CURDATE() THEN 1 END) AS daily_orders
            FROM
                users u
            LEFT JOIN
                user_product_ratings upr ON u.id = upr.user_id
            WHERE
                u.id = ?;
        `;
        db.query(sql, [userId], (err, results) => {
            if (err) {
                console.error(`[Task Model - getDashboardCountsForUser] Error fetching dashboard counts for User ${userId}:`, err);
                return callback(err, null);
            }
            console.log(`[Task Model - getDashboardCountsForUser] Dashboard counts for User ${userId}:`, results[0]);
            callback(null, results);
        });
    },

    /**
     * Fetches the total count of products in the 'products' table.
     * @param {function} callback - Callback function (err, count)
     */
    getTotalProductCount: (callback) => {
        const sql = `SELECT COUNT(*) AS total_products FROM products;`;
        db.query(sql, (err, results) => {
            if (err) return callback(err, 0);
            callback(null, results[0].total_products);
        });
    },

    /**
     * NEW METHOD: Fetches the profit for a specific product.
     * This is needed for standard (non-lucky) task completions.
     * @param {number} productId - The ID of the product.
     * @param {function} callback - Callback function (err, profit)
     */
    getProductProfit: (productId, callback) => {
        const sql = `SELECT profit FROM products WHERE id = ?;`;
        db.query(sql, [productId], (err, results) => {
            if (err) {
                console.error(`[Task Model - getProductProfit] Error fetching profit for Product ${productId}:`, err);
                return callback(err, null);
            }
            // Return the profit, or null if product not found
            callback(null, results.length > 0 ? results[0].profit : null);
        });
    },
};

module.exports = Task;