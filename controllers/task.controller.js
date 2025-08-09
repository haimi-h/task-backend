// your-project/controllers/task.controller.js
const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model');
const RechargeRequest = require('../models/rechargeRequest.model');
const { getIo } = require('../utils/socket');
const REFERRAL_PROFIT_PERCENTAGE = 0.10; // 10% profit for the referrer
const NORMAL_TASK_PROFIT_PERCENTAGE = 0.009; // 5% profit for the user's own balance on normal tasks

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
            // The profit shown on the card is either the lucky plan profit or the standard profit from the product.
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
 * UPDATED: This function now includes the detailed logic to handle lucky order recharge warnings
 * based on the state of the recharge request and the user's wallet balance.
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
    const currentBalance = parseFloat(user.wallet_balance) || 0;
    return res.status(200).json({
        message: `Congratulations, you have completed your daily tasks. You now have a current balance of $${currentBalance.toFixed(2)} available for withdrawal.`,
        task: null
    });
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
                // Check if a recharge request for this plan has been approved
                RechargeRequest.findApprovedByInjectionPlanId(userId, matchingInjectionPlan.id, (rechargeErr, isApproved) => {
                    if (rechargeErr) {
                        return res.status(500).json({ message: "Error checking recharge status for lucky order." });
                    }

                    // --- SCENARIO 1: LUCKY ORDER - RECHARGE REQUIRED & NOT APPROVED (ON-CARD MESSAGE) ---
                    if (!isApproved) {
                        Task.getTaskForUser(user.id, (taskErr, task) => {
                            if (taskErr) {
                                console.error("Error fetching task for pending lucky order:", taskErr);
                                return res.status(500).json({ message: "Error fetching task for lucky order", error: taskErr.message });
                            }
                            if (!task) {
                                return res.status(200).json({
                                    task: null,
                                    isLuckyOrder: true,
                                    luckyOrderRequiresRecharge: true,
                                    luckyOrderCapitalRequired: parseFloat(matchingInjectionPlan.injections_amount) || 0,
                                    luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                                    injectionPlanId: matchingInjectionPlan.id,
                                    message: `A recharge of $${(parseFloat(matchingInjectionPlan.injections_amount) || 0).toFixed(2)} is required for this lucky order, but the task details could not be loaded. Please try again.`
                                });
                            }
                            // Send the task data along with the recharge requirement flag
                            res.status(200).json({
                                task: {
                                    id: task.id,
                                    name: task.name,
                                    image_url: task.image_url || task.image,
                                    description: task.description,
                                    price: parseFloat(task.price) || 0,
                                    profit: parseFloat(matchingInjectionPlan.commission_rate) || 0
                                },
                                balance: parseFloat(user.wallet_balance) || 0,
                                isLuckyOrder: true,
                                luckyOrderRequiresRecharge: true, // Tell frontend to show on-card prompt
                                luckyOrderCapitalRequired: parseFloat(matchingInjectionPlan.injections_amount) || 0,
                                luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                                injectionPlanId: matchingInjectionPlan.id,
                                taskCount: parseInt(user.completed_orders || 0, 10),
                            });
                        });
                        return; // Exit after sending response for this scenario
                    }

                    // --- SCENARIO 2: LUCKY ORDER - RECHARGE APPROVED BUT INSUFFICIENT BALANCE (FULL-PAGE BLOCKING) ---
                    const capitalRequired = parseFloat(matchingInjectionPlan.injections_amount);
                    if (parseFloat(user.wallet_balance) < capitalRequired) {
                        return res.status(200).json({
                            task: null, // Explicitly block task display
                            balance: parseFloat(user.wallet_balance) || 0,
                            isLuckyOrder: true,
                            luckyOrderRequiresRecharge: true, // Still needs further action (more recharge)
                            luckyOrderCapitalRequired: capitalRequired,
                            luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                            injectionPlanId: matchingInjectionPlan.id,
                            message: `Your balance of $${(parseFloat(user.wallet_balance) || 0).toFixed(2)} is insufficient for this lucky order, which requires $${capitalRequired.toFixed(2)}. Please recharge.`
                        });
                    }

                    // --- SCENARIO 3: LUCKY ORDER - RECHARGE APPROVED AND SUFFICIENT BALANCE (READY TO SUBMIT) ---
                    // The user can now proceed with the lucky order.
                    fetchAndSendTask(res, user, true, matchingInjectionPlan, false, matchingInjectionPlan.id, parseFloat(matchingInjectionPlan.commission_rate));
                });
            } else {
                // This is a normal task.
                fetchAndSendTask(res, user, false, null);
            }
        });
    });
};

/**
 * MODIFICATION: This function now correctly calculates the profit for normal tasks
 * as 5% of the user's current balance, and for lucky orders, it uses the plan's
 * commission_rate, as requested.
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

        // if (parseInt(user.uncompleted_orders || 0) <= 0) {
        //     return res.status(400).json({ message: "You have already completed all your daily tasks." });
        // }

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
                    // The 5% profit is calculated from the user's current balance.
                    const profitToAdd = parseFloat(user.wallet_balance) * NORMAL_TASK_PROFIT_PERCENTAGE;

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