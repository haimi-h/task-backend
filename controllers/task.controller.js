// your-project/controllers/task.controller.js
const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model');
const RechargeRequest = require('../models/rechargeRequest.model');
const { getIo } = require('../utils/socket');
const REFERRAL_PROFIT_PERCENTAGE = 0.10;

/**
 * Helper function to fetch and send task data to the client.
 * It now consistently sends task data, using flags to control UI states.
 */
function fetchAndSendTask(res, user, isLucky, injectionPlan, luckyOrderRequiresRecharge = false, injectionPlanId = null, product_profit_from_plan = 0) {
    Task.getTaskForUser(user.id, (taskErr, task) => {
        if (taskErr) {
            console.error("Error fetching task:", taskErr);
            return res.status(500).json({ message: "Error fetching task", error: taskErr.message });
        }
        if (!task) {
            return res.status(200).json({ message: "No new products available for rating.", task: null });
        }

        const taskToSend = {
            id: task.id,
            name: task.name,
            image_url: task.image_url || task.image,
            description: task.description,
            price: parseFloat(task.price) || 0,
            profit: isLucky ? product_profit_from_plan : (parseFloat(task.profit) || 0)
        };

        res.status(200).json({
            task: taskToSend,
            balance: parseFloat(user.wallet_balance) || 0,
            isLuckyOrder: isLucky,
            luckyOrderRequiresRecharge: luckyOrderRequiresRecharge, // This flag tells the frontend to show the on-card warning
            luckyOrderCapitalRequired: isLucky ? (parseFloat(injectionPlan.injections_amount) || 0) : 0,
            luckyOrderProfit: isLucky ? product_profit_from_plan : 0,
            injectionPlanId: injectionPlanId,
            taskCount: parseInt(user.completed_orders || 0, 10),
        });
    });
}

/**
 * MODIFICATION: This function no longer locks the task for lucky orders with insufficient balance.
 * It now always shows the task but sets a flag (`luckyOrderRequiresRecharge`) to true,
 * which the frontend uses to display an on-card warning message instead of a full-page block.
 */
exports.getTask = (req, res) => {
    const userId = req.user.id;

    if (!userId) {
        return res.status(401).json({ message: "User not authenticated." });
    }

    User.findById(userId, (err, user) => {
        if (err || !user) {
            return res.status(500).json({ message: "Error fetching user details." });
        }

        if (parseInt(user.uncompleted_orders || 0) <= 0) {
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null });
        }

        const nextTaskNumber = parseInt(user.completed_orders || 0, 10) + 1;

        InjectionPlan.findByUserId(userId, (planErr, injectionPlans) => {
            if (planErr) {
                return res.status(500).json({ message: "Error fetching injection plans.", error: planErr.message });
            }

            const matchingInjectionPlan = injectionPlans.find(plan =>
                parseInt(plan.injection_order, 10) === nextTaskNumber && plan.status !== 'used'
            );

            if (matchingInjectionPlan) {
                // For a lucky order, check if the user's current balance is sufficient.
                const capitalRequired = parseFloat(matchingInjectionPlan.injections_amount);
                const hasSufficientBalance = parseFloat(user.wallet_balance) >= capitalRequired;

                // If balance is insufficient, we still show the task but set the recharge flag to true.
                // This prevents locking the UI and shows the on-card warning instead.
                const needsRecharge = !hasSufficientBalance;

                fetchAndSendTask(
                    res,
                    user,
                    true, // isLucky
                    matchingInjectionPlan,
                    needsRecharge, // luckyOrderRequiresRecharge
                    matchingInjectionPlan.id,
                    parseFloat(matchingInjectionPlan.commission_rate)
                );
            } else {
                // This is a normal task.
                fetchAndSendTask(res, user, false, null);
            }
        });
    });
};

/**
 * This function includes the fix from the previous request.
 * It correctly calculates profit for standard tasks based on the product's profit value,
 * not as a percentage of the user's wallet.
 */
exports.submitTaskRating = (req, res) => {
    const userId = req.user.id;
    const { productId, rating } = req.body;

    if (!userId) return res.status(401).json({ message: "User not authenticated." });
    if (!productId || rating !== 5) {
        return res.status(400).json({ message: "A 5-star rating is required to complete the task." });
    }

    User.findById(userId, (err, user) => {
        if (err || !user) return res.status(500).json({ message: "Error fetching user details." });

        if (parseInt(user.uncompleted_orders || 0) <= 0) {
            return res.status(400).json({ message: "You have already completed all your daily tasks." });
        }

        Task.recordProductRating(userId, productId, rating, (recordErr) => {
            if (recordErr) return res.status(500).json({ message: "Failed to submit rating." });

            const nextTaskNumber = parseInt(user.completed_orders || 0, 10) + 1;
            InjectionPlan.findByUserIdAndOrder(userId, nextTaskNumber, (planErr, luckyPlan) => {
                if (planErr) return res.status(500).json({ message: "Error checking for lucky order." });

                // Logic for a LUCKY order
                if (luckyPlan) {
                    const capitalRequired = parseFloat(luckyPlan.injections_amount);
                    const profitAmount = parseFloat(luckyPlan.commission_rate);

                    if (parseFloat(user.wallet_balance) < capitalRequired) {
                        return res.status(400).json({ message: `Insufficient balance for this lucky order. You need $${capitalRequired.toFixed(2)}. Please recharge.` });
                    }

                    User.updateBalanceAndTaskCount(userId, capitalRequired, 'deduct', (deductErr) => {
                        if (deductErr) return res.status(500).json({ message: "Failed to process lucky order deduction." });

                        InjectionPlan.markAsUsed(userId, nextTaskNumber, (markErr) => {
                            if (markErr) console.error("Failed to mark lucky plan as used:", markErr);
                        });

                        const returnAmount = capitalRequired + profitAmount;
                        setTimeout(() => {
                            User.updateBalanceAndTaskCount(userId, returnAmount, 'add', (addErr) => {
                                if (addErr) console.error(`Error adding profit for lucky order user ${userId}:`, addErr);
                                else console.log(`Lucky order capital and profit credited to user ${userId}.`);
                                
                                User.findUsersByReferrerId(userId, (findReferralsErr, referredUsers) => {
                                    if (findReferralsErr) {
                                        console.error(`[Task Controller] Error finding referred users for inviter ${userId}:`, findReferralsErr);
                                    } else if (referredUsers && referredUsers.length > 0) {
                                        const profitForReferrals = profitAmount * REFERRAL_PROFIT_PERCENTAGE;
                                        referredUsers.forEach(referredUser => {
                                            User.updateWalletBalance(referredUser.id, profitForReferrals, 'add', (referredUpdateErr) => {
                                                if (referredUpdateErr) {
                                                    console.error(`[Task Controller] Error adding referral profit to user ${referredUser.id}:`, referredUpdateErr);
                                                }
                                            });
                                        });
                                    }
                                });
                            });
                        }, 2000);

                        res.status(200).json({ message: `Lucky task completed! $${returnAmount.toFixed(2)} will be credited shortly.`, isCompleted: true });
                    });

                } else {
                    // Logic for a NORMAL task (Corrected Profit Calculation)
                    Task.getProductProfit(productId, (profitErr, productProfit) => {
                        if (profitErr || productProfit === null) {
                            console.error(`Error fetching profit for product ${productId}:`, profitErr);
                            return res.status(500).json({ message: "Task completed, but failed to retrieve product profit." });
                        }

                        const profitToAdd = parseFloat(productProfit);

                        User.updateBalanceAndTaskCount(userId, profitToAdd, 'add', (updateErr) => {
                            if (updateErr) return res.status(500).json({ message: "Task completed, but failed to update user data." });

                            User.findUsersByReferrerId(userId, (findReferralsErr, referredUsers) => {
                                if (findReferralsErr) {
                                     console.error(`[Task Controller] Error finding referred users for inviter ${userId}:`, findReferralsErr);
                                } else if (referredUsers && referredUsers.length > 0) {
                                    const profitForReferrals = profitToAdd * REFERRAL_PROFIT_PERCENTAGE;
                                    referredUsers.forEach(referredUser => {
                                        User.updateWalletBalance(referredUser.id, profitForReferrals, 'add', (referredUpdateErr) => {
                                            if (referredUpdateErr) {
                                                console.error(`[Task Controller] Error adding referral profit to user ${referredUser.id}:`, referredUpdateErr);
                                            }
                                        });
                                    });
                                }
                            });
                            res.status(200).json({ message: `Task completed! You earned $${profitToAdd.toFixed(2)}.`, isCompleted: true });
                        });
                    });
                }
            });
        });
    });
};

exports.getDashboardSummary = (req, res) => {
    const userId = req.user.id;
    Task.getDashboardCountsForUser(userId, (err, counts) => {
        if (err || !counts || !counts.length) {
             return res.status(200).json({ completedOrders: 0, uncompletedOrders: 0, dailyOrders: 0 });
        }
        const { completed_orders, uncompleted_orders, daily_orders } = counts[0];
        res.status(200).json({ completedOrders: completed_orders, uncompletedOrders: uncompleted_orders, dailyOrders: daily_orders });
    });
};