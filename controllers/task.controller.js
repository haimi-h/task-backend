const Task = require('../models/task.model');
const User = require('../models/user.model'); // Import the User model

exports.getTask = (req, res) => {
    const userId = req.user.id;

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }

    // Before fetching a task, check if the user has any uncompleted daily orders left
    User.findById(userId, (err, user) => {
        if (err) {
            console.error("Error fetching user for getTask validation:", err);
            return res.status(500).json({ message: "Error fetching user details." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        console.log(`[Task Controller - getTask] Raw user object from findById for User ${userId}:`, user); // DEBUG LOG

        // Ensure these are treated as numbers
        const currentUncompleted = parseInt(user.uncompleted_orders || 0);
        const dailyLimit = parseInt(user.daily_orders || 0);

        console.log(`[Task Controller - getTask] User ${userId} - Daily Limit: ${dailyLimit}, Current Uncompleted: ${currentUncompleted}`); // DEBUG LOG

        if (currentUncompleted <= 0) {
            console.log(`[Task Controller - getTask] User ${userId} has no uncompleted daily tasks left. Returning "completed all daily tasks" message.`); // DEBUG LOG
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null });
        }
        
        // If uncompleted tasks are available, proceed to fetch a product
        Task.getTaskForUser(userId, (err, task) => {
            if (err) {
                console.error("Error fetching task:", err);
                return res.status(500).json({ message: "Error fetching task", error: err.message });
            }
            if (!task) {
                // This scenario means there are uncompleted orders in the user's record,
                // but no new products that haven't been rated 5 stars yet.
                // This could happen if the user rated all products but not all to 5 stars,
                // or if the product list is smaller than daily_orders.
                console.log(`[Task Controller - getTask] User ${userId} has uncompleted orders (${currentUncompleted}) but Task.getTaskForUser returned no task. Returning "no new products" message.`); // DEBUG LOG
                return res.status(200).json({ message: "No new products available for rating. You might have already rated all products.", task: null });
            }
            console.log(`[Task Controller - getTask] User ${userId} - Task fetched:`, task.name); // DEBUG LOG
            res.status(200).json({ task });
        });
    });
};

exports.submitTaskRating = (req, res) => {
    const userId = req.user.id;
    const { productId, rating } = req.body;

    console.log(`[Task Controller - submitTaskRating] User ${userId} submitting rating for Product ${productId} with rating ${rating}`);

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }

    if (!productId || typeof rating === 'undefined' || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Product ID and a valid rating (1-5) are required." });
    }

    User.findById(userId, (err, user) => {
        if (err) {
            console.error("Error fetching user for task submission validation:", err);
            return res.status(500).json({ message: "Error processing task submission." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Ensure these are treated as numbers for calculations
        let currentCompleted = parseInt(user.completed_orders || 0);
        let currentUncompleted = parseInt(user.uncompleted_orders || 0);
        const dailyLimit = parseInt(user.daily_orders || 0);

        console.log(`[Task Controller - submitTaskRating] User ${userId} current counts: Daily=${dailyLimit}, Completed=${currentCompleted}, Uncompleted=${currentUncompleted}`);

        const isCompletedRating = (rating === 5); // Is this a 5-star rating?

        // Record the product rating first
        Task.recordProductRating(userId, productId, rating, (recordErr, recordResult) => {
            if (recordErr) {
                console.error("Error submitting task rating:", recordErr);
                return res.status(500).json({ message: "Error submitting rating.", error: recordErr.message });
            }

            let message = "Rating submitted.";
            let shouldUpdateUserCounts = false; // Flag to decide if user counts need updating

            // Logic to update user's completed/uncompleted counts
            // Only update if it's a 5-star rating AND the user has uncompleted tasks left
            if (isCompletedRating && currentUncompleted > 0) {
                currentCompleted++; // Increment completed tasks
                currentUncompleted--; // Decrement uncompleted tasks
                shouldUpdateUserCounts = true;
                message = "Task completed successfully and counts updated!";
            } else if (isCompletedRating && currentUncompleted <= 0) {
                // This means user completed a task but already hit their daily limit.
                // The frontend should ideally prevent this, but backend handles it as a safeguard.
                message = "Task completed, but you've already reached your daily task limit.";
            }

            console.log(`[Task Controller - submitTaskRating] Rating recorded. isCompletedRating: ${isCompletedRating}. Should update user counts: ${shouldUpdateUserCounts}`);
            console.log(`[Task Controller - submitTaskRating] User ${userId} calculated new counts: Completed=${currentCompleted}, Uncompleted=${currentUncompleted}`);

            if (shouldUpdateUserCounts) {
                User.updateUserTaskCounts(userId, currentCompleted, currentUncompleted, (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error("Error updating user task counts in users table after rating:", updateErr);
                        // Log error but don't prevent the rating submission success
                    } else {
                        console.log(`[Task Controller - submitTaskRating] User ${userId} task counts updated successfully. Affected rows: ${updateResult ? updateResult.affectedRows : 'N/A'}`);
                    }
                    // Send response AFTER user counts are attempted to be updated
                    res.status(200).json({ message, isCompleted: isCompletedRating });
                });
            } else {
                // If no count update is needed (e.g., <5 star rating, or already exceeded limit)
                res.status(200).json({ message, isCompleted: isCompletedRating });
            }
        });
    });
};

exports.getDashboardSummary = (req, res) => {
    const userId = req.user.id;

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }

    Task.getDashboardCountsForUser(userId, (err, counts) => {
        if (err) {
            console.error("Error fetching dashboard summary:", err);
            return res.status(500).json({ message: "Error fetching dashboard summary", error: err.message });
        }
        if (!counts || counts.length === 0) {
             return res.status(200).json({ completedOrders: 0, uncompletedOrders: 0, dailyOrders: 0 });
        }

        const { completed_orders, uncompleted_orders, daily_orders } = counts[0];
        res.status(200).json({
            completedOrders: completed_orders,
            uncompletedOrders: uncompleted_orders,
            dailyOrders: daily_orders
        });
    });
};