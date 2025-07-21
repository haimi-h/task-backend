const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model'); // Assuming you have this model
const Product = require('../models/product.model'); // Assuming you have a Product model
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

        const currentCompletedTasks = parseInt(user.completed_orders || 0);
        const dailyLimit = parseInt(user.daily_orders || 0);

        console.log(`[Task Controller - getTask] User ${userId} - Daily Limit: ${dailyLimit}, Current Completed: ${currentCompletedTasks}`);

        // Check if user has completed all their daily tasks
        if (currentCompletedTasks >= dailyLimit) {
            console.log(`[Task Controller - getTask] User ${userId} has completed all their daily tasks. Returning "completed all daily tasks" message.`);
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null, taskCount: currentCompletedTasks, isLuckyOrder: false, luckyOrderCapitalRequired: 0 });
        }

        // --- NEW LOGIC FOR LUCKY ORDER ---
        let isLuckyOrder = false;
        let luckyOrderCapitalRequired = 0;
        let luckyOrderProfit = 0;
        const nextTaskNumber = currentCompletedTasks + 1;

        // Fetch injection plans for the current user
        InjectionPlan.findByUserId(userId, (planErr, injectionPlans) => { // Assuming findByUserId method exists on InjectionPlan model
            if (planErr) {
                console.error("Error fetching injection plans:", planErr);
                return res.status(500).json({ message: "Error fetching injection plans.", error: planErr.message });
            }

            const matchingInjectionPlan = injectionPlans.find(plan =>
                parseInt(plan.injection_order, 10) === nextTaskNumber
            );

            if (matchingInjectionPlan) {
                isLuckyOrder = true;
                luckyOrderCapitalRequired = parseFloat(matchingInjectionPlan.injections_amount);
                luckyOrderProfit = parseFloat(matchingInjectionPlan.commission_rate);
                console.log(`[Task Controller - getTask] Lucky order found for user ${userId} at task ${nextTaskNumber}. Capital: ${luckyOrderCapitalRequired}, Profit: ${luckyOrderProfit}`);
            }

            // Fetch a task (product) for the user
            Task.getTaskForUser(userId, (taskErr, task) => { // This should ideally return a product
                if (taskErr) {
                    console.error("Error fetching task:", taskErr);
                    return res.status(500).json({ message: "Error fetching task", error: taskErr.message });
                }
                if (!task) {
                    console.log(`[Task Controller - getTask] User ${userId} has uncompleted orders (${dailyLimit - currentCompletedTasks}) but Task.getTaskForUser returned no task. Returning "no new products" message.`);
                    return res.status(200).json({ message: "No new products available for rating. You might have already rated all products.", task: null, taskCount: currentCompletedTasks, isLuckyOrder: false, luckyOrderCapitalRequired: 0 });
                }

                // Construct the task object to send to frontend, overriding with lucky order details if applicable
                const taskToSend = {
                    id: task.id,
                    name: task.name,
                    image_url: task.image_url || task.image, // Use image_url or image based on your product schema
                    description: task.description,
                    price: task.price,
                    // Apply lucky order capital/profit if applicable
                    capital_required: isLuckyOrder ? luckyOrderCapitalRequired : (task.capital_required || 0),
                    profit: isLuckyOrder ? luckyOrderProfit : (task.profit || 0)
                };

                console.log(`[Task Controller - getTask] User ${userId} - Task fetched:`, taskToSend.name, "Is Lucky Order:", isLuckyOrder);

                // Send the full response including taskCount and lucky order details
                res.status(200).json({
                    task: taskToSend,
                    balance: user.wallet_balance || 0, // Assuming user.wallet_balance holds the balance
                    taskCount: currentCompletedTasks, // Send the current completed task count
                    isLuckyOrder: isLuckyOrder,
                    luckyOrderCapitalRequired: luckyOrderCapitalRequired
                });
            });
        });
    });
};

exports.submitTaskRating = (req, res) => {
    const userId = req.user.id;
    // Expect new fields from frontend for lucky orders
    // Note: The frontend sends `capitalRequired` and `profitAmount` as `capitalRequired` and `profitAmount`
    // but the backend expects `commissionRate` for the lucky order profit.
    // Let's adjust the backend to expect `profitAmount` for lucky orders.
    const { productId, rating, isLuckyOrder, capitalRequired, profitAmount } = req.body;
    console.log(`[Task Controller - submitTaskRating] User ${userId} submitting rating for Product ${productId} with rating ${rating}. Lucky Order: ${isLuckyOrder}, Capital: ${capitalRequired}, Profit: ${profitAmount}`);

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
                    const parsedProfitAmount = parseFloat(profitAmount); // Use profitAmount from frontend

                    if (isNaN(parsedCapitalRequired) || parsedCapitalRequired <= 0 ||
                        isNaN(parsedProfitAmount) || parsedProfitAmount <= 0) {
                        return res.status(400).json({ message: "Invalid capital or profit amount for lucky order." });
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
                        if (io) {
                            io.to(`user-${userId}`).emit('balanceUpdate', { newBalance: user.wallet_balance - parsedCapitalRequired });
                        }

                        message = "Lucky task submitted! Capital deducted. Profit will be credited shortly.";
                        res.status(200).json({ message, isCompleted: isCompletedRating }); // Respond immediately

                        // 2. Schedule profit addition after a delay
                        const returnAmount = parsedCapitalRequired + parsedProfitAmount; // Return capital + profit

                        console.log(`Scheduling credit of ${returnAmount} (capital ${parsedCapitalRequired} + profit ${parsedProfitAmount}) for user ${userId}.`);

                        setTimeout(() => {
                            User.updateBalanceAndTaskCount(userId, returnAmount, 'add', currentCompleted, currentUncompleted, (addErr, addResult) => {
                                if (addErr) {
                                    console.error(`Error adding profit for lucky order for user ${userId}:`, addErr);
                                } else {
                                    console.log(`Lucky order profit and capital credited to user ${userId}. Total: ${returnAmount}.`);
                                    // Emit final balance update to frontend
                                    if (io) {
                                        // Fetch latest user balance after credit to ensure accuracy
                                        User.findById(userId, (fetchUserErr, updatedUser) => {
                                            if (!fetchUserErr && updatedUser) {
                                                io.to(`user-${userId}`).emit('balanceUpdate', { newBalance: updatedUser.wallet_balance });
                                            } else {
                                                console.error("Error fetching updated user balance for socket emit:", fetchUserErr);
                                            }
                                        });
                                    }
                                }
                            });
                            // IMPORTANT: Mark the injection plan as used/completed here
                            // Assuming you have a way to identify and update the specific injection plan
                            // For example:
                            InjectionPlan.markAsUsed(userId, nextTaskNumber, (markErr, markResult) => {
                                if (markErr) {
                                    console.error(`Error marking injection plan for user ${userId} task ${nextTaskNumber} as used:`, markErr);
                                } else {
                                    console.log(`Injection plan for user ${userId} task ${nextTaskNumber} marked as used.`);
                                }
                            });

                        }, 5000); // 5-second delay for simulation
                    });
                } else {
                    // Standard 5-star rating: only update task counts and add regular profit
                    // You need to get the profit for the standard product here
                    Task.getProductProfit(productId, (profitErr, productProfit) => { // Assuming a method to get product profit
                        if (profitErr) {
                            console.error("Error fetching product profit:", profitErr);
                            return res.status(500).json({ message: "Failed to get product profit.", error: profitErr.message });
                        }
                        const profitToAdd = productProfit || 0; // Default to 0 if no profit found

                        User.updateBalanceAndTaskCount(userId, profitToAdd, 'add', currentCompleted, currentUncompleted, (updateErr, updateResult) => {
                            if (updateErr) {
                                console.error("Error updating user task counts and balance after rating:", updateErr);
                                return res.status(500).json({ message: "Task completed, but failed to update user counts/balance accurately.", error: updateErr.message, isCompleted: isCompletedRating });
                            } else {
                                console.log(`[Task Controller - submitTaskRating] User ${userId} task counts and balance updated successfully. Affected rows: ${updateResult ? updateResult.affectedRows : 'N/A'}`);
                                // Emit balance update for standard tasks as well
                                if (io) {
                                     User.findById(userId, (fetchUserErr, updatedUser) => {
                                        if (!fetchUserErr && updatedUser) {
                                            io.to(`user-${userId}`).emit('balanceUpdate', { newBalance: updatedUser.wallet_balance });
                                        } else {
                                            console.error("Error fetching updated user balance for socket emit:", fetchUserErr);
                                        }
                                    });
                                }
                                res.status(200).json({ message: "Task completed successfully and counts updated!", isCompleted: isCompletedRating });
                            }
                        });
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
