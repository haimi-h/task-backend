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
                JOIN user_product_ratings upr ON p.id = upr.product_id AND upr.user_id = ?
                WHERE upr.is_completed = FALSE
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

                // If no unrated or non-completed products, return null
                console.log(`[Task Model - getTaskForUser] No unrated or non-completed products found for User ${userId}.`);
                callback(null, null);
            });
        });
    },

    // Records or updates a user's rating for a product
    recordProductRating: (userId, productId, rating, callback) => {
        const isCompleted = (rating === 5); // Task is completed if rating is 5 stars
        console.log(`[Task Model - recordProductRating] Recording rating for User ${userId}, Product ${productId}. Rating: ${rating}, Is Completed: ${isCompleted}`);

        // Check if a rating already exists for this user and product
        db.query(
            `SELECT id FROM user_product_ratings WHERE user_id = ? AND product_id = ?`,
            [userId, productId],
            (err, results) => {
                if (err) {
                    console.error(`[Task Model - recordProductRating] Error checking existing rating for User ${userId}, Product ${productId}:`, err);
                    return callback(err, null);
                }

                if (results.length > 0) {
                    // Update existing rating
                    const sql = `
                        UPDATE user_product_ratings
                        SET rating = ?, is_completed = ?, rated_at = CURRENT_TIMESTAMP
                        WHERE id = ?;
                    `;
                    console.log(`[Task Model - recordProductRating] Updating existing rating ID ${results[0].id} for User ${userId}.`);
                    db.query(sql, [rating, isCompleted, results[0].id], callback);
                } else {
                    // Insert new rating
                    const sql = `
                        INSERT INTO user_product_ratings (user_id, product_id, rating, is_completed)
                        VALUES (?, ?, ?, ?);
                    `;
                    console.log(`[Task Model - recordProductRating] Inserting new rating for User ${userId}, Product ${productId}.`);
                    db.query(sql, [userId, productId, rating, isCompleted], callback);
                }
            }
        );
    },

    /**
     * Gets the counts for the dashboard: Uncompleted, Completed, Daily.
     * Reads completed_orders, uncompleted_orders, and daily_orders directly from the users table.
     *
     * @param {number} userId - The ID of the user.
     * @param {function} callback - Callback function (err, counts)
     */
    getDashboardCountsForUser: (userId, callback) => {
        const sql = `
            SELECT
                completed_orders,
                uncompleted_orders,
                daily_orders
            FROM
                users
            WHERE id = ?;
        `;
        db.query(sql, [userId], (err, results) => {
            if (err) {
                console.error(`[Task Model - getDashboardCountsForUser] Error fetching counts for User ${userId}:`, err);
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
    }
};

module.exports = Task;