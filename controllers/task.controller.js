const Task = require('../models/task.model');
const User = require('../models/user.model');
const { io } = require('../server'); // Assuming 'io' can be imported or passed (see server.js update below)

exports.getTask = (req, res) => {
    const userId = req.user.id;

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }

    User.findById(userId, (err, user) => {
        if (err) {
            console.error("Error fetching user for getTask validation:", err);
            return res.status(500).json({ message: "Error fetching user details." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        console.log(`[Task Controller - getTask] Raw user object from findById for User ${userId}:`, user);

        const currentUncompleted = parseInt(user.uncompleted_orders || 0);
        const dailyLimit = parseInt(user.daily_orders || 0);

        console.log(`[Task Controller - getTask] User ${userId} - Daily Limit: ${dailyLimit}, Current Uncompleted: ${currentUncompleted}`);

        if (currentUncompleted <= 0) {
            console.log(`[Task Controller - getTask] User ${userId} has no uncompleted daily tasks left. Returning "completed all daily tasks" message.`);
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null });
        }
        
        Task.getTaskForUser(userId, (err, task) => {
            if (err) {
                console.error("Error fetching task:", err);
                return res.status(500).json({ message: "Error fetching task", error: err.message });
            }
            if (!task) {
                console.log(`[Task Controller - getTask] User ${userId} has uncompleted orders (${currentUncompleted}) but Task.getTaskForUser returned no task. Returning "no new products" message.`);
                return res.status(200).json({ message: "No new products available for rating. You might have already rated all products.", task: null });
            }
            console.log(`[Task Controller - getTask] User ${userId} - Task fetched:`, task.name, "Lucky Order:", task.isLuckyOrder);
            res.status(200).json({ task });
        });
    });
};

exports.submitTaskRating = (req, res) => {
    const userId = req.user.id;
    // Expect new fields from frontend for lucky orders
    const { productId, rating, isLuckyOrder, capitalRequired, commissionRate } = req.body;
    console.log(`[Task Controller - submitTaskRating] User ${userId} submitting rating for Product ${productId} with rating ${rating}. Lucky Order: ${isLuckyOrder}, Capital: ${capitalRequired}, Commission: ${commissionRate}`);

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }
    if (!productId || typeof rating === 'undefined' || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Product ID and a valid rating (1-5) are required." });
    }

    User.findById(userId, (err, user) => {
        if (err) {
            console.error("Error fetching user for submitTaskRating validation:", err);
            return res.status(500).json({ message: "Error fetching user details." });
        }
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        let currentCompleted = parseInt(user.completed_orders || 0);
        let currentUncompleted = parseInt(user.uncompleted_orders || 0);
        const isCompletedRating = (rating === 5); // A task is considered completed if rated 5 stars

        Task.recordProductRating(userId, productId, rating, (recordErr, recordResult) => {
            if (recordErr) {
                console.error("Error recording product rating:", recordErr);
                return res.status(500).json({ message: "Failed to submit rating.", error: recordErr.message });
            }

            let message = "Rating submitted.";
            
            if (isCompletedRating && currentUncompleted > 0) {
                currentCompleted++;
                currentUncompleted--;

                if (isLuckyOrder) {
                    const parsedCapitalRequired = parseFloat(capitalRequired);
                    const parsedCommissionRate = parseFloat(commissionRate);

                    if (isNaN(parsedCapitalRequired) || parsedCapitalRequired <= 0 ||
                        isNaN(parsedCommissionRate) || parsedCommissionRate <= 0) {
                        return res.status(400).json({ message: "Invalid capital or commission rate for lucky order." });
                    }

                    if (user.wallet_balance < parsedCapitalRequired) {
                        // User doesn't have enough balance for lucky order
                        console.log(`User ${userId} - Insufficient balance for lucky order: ${user.wallet_balance} < ${parsedCapitalRequired}`);
                        return res.status(400).json({ message: "Insufficient balance for this lucky order.", isCompleted: false });
                    }

                    // 1. Deduct capital immediately
                    User.updateBalanceAndTaskCount(userId, parsedCapitalRequired, 'deduct', currentCompleted, currentUncompleted, (deductErr, deductResult) => {
                        if (deductErr) {
                            console.error("Error deducting capital for lucky order:", deductErr);
                            return res.status(500).json({ message: "Failed to process lucky order (deduction).", error: deductErr.message });
                        }
                        console.log(`Lucky order capital ${parsedCapitalRequired} deducted from user ${userId}.`);
                        
                        // Emit balance update to frontend immediately after deduction
                        // if (io) {
                        //     io.to(`user-${userId}`).emit('balanceUpdate', { newBalance: user.wallet_balance - parsedCapitalRequired });
                        // }

                        message = "Lucky task submitted! Capital deducted. Profit will be credited shortly.";
                        res.status(200).json({ message, isCompleted: isCompletedRating }); // Respond immediately

                        // 2. Schedule profit addition after a delay
                        const profit = parsedCapitalRequired * parsedCommissionRate;
                        const returnAmount = parsedCapitalRequired + profit; // Return capital + profit

                        console.log(`Scheduling credit of ${returnAmount} (capital ${parsedCapitalRequired} + profit ${profit}) for user ${userId}.`);

                        setTimeout(() => {
                            User.updateBalanceAndTaskCount(userId, returnAmount, 'add', currentCompleted, currentUncompleted, (addErr, addResult) => {
                                if (addErr) {
                                    console.error(`Error adding profit for lucky order for user ${userId}:`, addErr);
                                } else {
                                    console.log(`Lucky order profit and capital credited to user ${userId}. Total: ${returnAmount}.`);
                                    // Emit final balance update to frontend
                                    // if (io) {
                                    //     io.to(`user-${userId}`).emit('balanceUpdate', { newBalance: user.wallet_balance - parsedCapitalRequired + returnAmount });
                                    // }
                                }
                            });
                        }, 5000); // 5-second delay for simulation
                    });
                } else {
                    // Standard 5-star rating: only update task counts
                    User.updateUserTaskCounts(userId, currentCompleted, currentUncompleted, (updateErr, updateResult) => {
                        if (updateErr) {
                            console.error("Error updating user task counts after rating:", updateErr);
                            // Even if there's an error here, the rating was recorded, so we might still send success but log the issue
                            return res.status(500).json({ message: "Task completed, but failed to update user counts accurately.", error: updateErr.message, isCompleted: isCompletedRating });
                        } else {
                            console.log(`[Task Controller - submitTaskRating] User ${userId} task counts updated successfully. Affected rows: ${updateResult ? updateResult.affectedRows : 'N/A'}`);
                            res.status(200).json({ message: "Task completed successfully and counts updated!", isCompleted: isCompletedRating });
                        }
                    });
                }
            } else {
                // If no count update is needed (e.g., <5 star rating, or no uncompleted tasks left)
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