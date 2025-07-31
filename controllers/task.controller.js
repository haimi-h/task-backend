// your-project/controllers/task.controller.js
const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model');
const RechargeRequest = require('../models/rechargeRequest.model');
const { getIo } = require('../utils/socket'); // Assuming socket might be used later
// In task.controller.js, at the top with other constants
const REFERRAL_PROFIT_PERCENTAGE = 0.10; // 10% for the invited customer

// Helper function to keep code DRY and include new lucky order states
// Added `luckyOrderRequiresRecharge`, `injectionPlanId`, `product_profit` as parameters
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
            // Use profit from injectionPlan if it's a lucky order, otherwise from task
            profit: isLucky ? product_profit_from_plan : (parseFloat(task.profit) || 0)
        };

        res.status(200).json({
            task: taskToSend,
            balance: parseFloat(user.wallet_balance) || 0,
            isLuckyOrder: isLucky,
            luckyOrderRequiresRecharge: luckyOrderRequiresRecharge, // This flag is now dynamically passed
            luckyOrderCapitalRequired: isLucky ? (parseFloat(injectionPlan.injections_amount) || 0) : 0,
            luckyOrderProfit: isLucky ? product_profit_from_plan : 0, // Explicitly pass lucky order profit
            injectionPlanId: injectionPlanId, // Pass the injectionPlanId
            taskCount: parseInt(user.completed_orders || 0, 10),
        });
    });
}


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

        const currentUncompletedTasks = parseInt(user.uncompleted_orders || 0, 10);
        if (currentUncompletedTasks <= 0) {
            return res.status(200).json({ message: "You have completed all your daily tasks.", task: null });
        }

        const nextTaskNumber = parseInt(user.completed_orders || 0, 10) + 1;

        InjectionPlan.findByUserId(userId, (planErr, injectionPlans) => {
            if (planErr) {
                console.error("Error fetching injection plans:", planErr);
                return res.status(500).json({ message: "Error fetching injection plans.", error: planErr.message });
            }

            const matchingInjectionPlan = injectionPlans.find(plan =>
                parseInt(plan.injection_order, 10) === nextTaskNumber && plan.status !== 'used'
            );

            if (matchingInjectionPlan) {
                RechargeRequest.findApprovedByInjectionPlanId(userId, matchingInjectionPlan.id, (rechargeErr, isApproved) => {
                    if (rechargeErr) {
                        return res.status(500).json({ message: "Error checking recharge status for lucky order." });
                    }

                    // --- SCENARIO A: LUCKY ORDER - RECHARGE REQUIRED & NOT APPROVED (ON-CARD MESSAGE) ---
                    // The user CAN see the task, but cannot submit until recharge is approved.
                    if (!isApproved) {
                        // Fetch the task data so it can be sent to the frontend.
                        // The frontend will then display this task with the yellow "recharge" message on it.
                        Task.getTaskForUser(user.id, (taskErr, task) => {
                            if (taskErr) {
                                console.error("Error fetching task for pending lucky order:", taskErr);
                                return res.status(500).json({ message: "Error fetching task for lucky order", error: taskErr.message });
                            }
                            // If for some reason no task is found even if a plan exists, fall back to blocking.
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

                            // Send the task data along with the recharge requirement flags.
                            res.status(200).json({
                                task: {
                                    id: task.id,
                                    name: task.name,
                                    image_url: task.image_url || task.image,
                                    description: task.description,
                                    price: parseFloat(task.price) || 0,
                                    // Profit from injection plan, as this is a lucky order
                                    profit: parseFloat(matchingInjectionPlan.commission_rate) || 0
                                },
                                balance: parseFloat(user.wallet_balance) || 0,
                                isLuckyOrder: true,
                                luckyOrderRequiresRecharge: true, // Tell frontend to show on-card prompt
                                luckyOrderCapitalRequired: parseFloat(matchingInjectionPlan.injections_amount) || 0,
                                luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                                injectionPlanId: matchingInjectionPlan.id,
                                taskCount: parseInt(user.completed_orders || 0, 10),
                                // No general 'message' field here; frontend will use the flags to construct the on-card message.
                            });
                        });
                        return; // Exit after sending response for this scenario
                    }

                    // --- SCENARIO B: LUCKY ORDER - RECHARGE APPROVED BUT INSUFFICIENT BALANCE (FULL-PAGE BLOCKING) ---
                    // This means recharge was approved, but user's current wallet balance
                    // is still less than the capital required for this lucky order.
                    if (parseFloat(user.wallet_balance) < parseFloat(matchingInjectionPlan.injections_amount)) {
                         // Send a full-page blocking message, as user cannot proceed even with approved recharge.
                         return res.status(200).json({
                             task: null, // Explicitly block task display
                             balance: parseFloat(user.wallet_balance) || 0,
                             isLuckyOrder: true, // Still in a lucky order context
                             luckyOrderRequiresRecharge: true, // Still needs further action (more recharge)
                             luckyOrderCapitalRequired: parseFloat(matchingInjectionPlan.injections_amount) || 0,
                             luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                             injectionPlanId: matchingInjectionPlan.id,
                             message: `Your balance of $${(parseFloat(user.wallet_balance) || 0).toFixed(2)} is insufficient for this lucky order, which requires $${(parseFloat(matchingInjectionPlan.injections_amount) || 0).toFixed(2)}. Please recharge.`
                         });
                    }

                    // --- SCENARIO C: LUCKY ORDER - RECHARGE APPROVED AND SUFFICIENT BALANCE (READY TO SUBMIT) ---
                    // The user can now proceed with the lucky order.
                    fetchAndSendTask(res, user, true, matchingInjectionPlan, false, matchingInjectionPlan.id, parseFloat(matchingInjectionPlan.commission_rate));
                });
            } else {
                // --- SCENARIO D: NORMAL TASK (NO LUCKY ORDER) ---
                fetchAndSendTask(res, user, false, null); // Pass false for luckyOrderRequiresRecharge
            }
        });
    });
};

// This function remains unchanged, as it was already correct.
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

                if (luckyPlan) {
                    const capitalRequired = parseFloat(luckyPlan.injections_amount);
                    const profitAmount = parseFloat(luckyPlan.commission_rate);

                    // Re-check balance at submission, this handles cases where balance might drop after fetching task.
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
                    console.error(`[Task Controller - submitTaskRating] Error finding referred users for inviter ${userId}:`, findReferralsErr);
                } else if (referredUsers && referredUsers.length > 0) {
                    const profitForReferrals = profitAmount * REFERRAL_PROFIT_PERCENTAGE;
                    referredUsers.forEach(referredUser => {
                        User.updateWalletBalance(referredUser.id, profitForReferrals, 'add', (referredUpdateErr) => {
                            if (referredUpdateErr) {
                                console.error(`[Task Controller - submitTaskRating] Error adding referral profit to invited user ${referredUser.id}:`, referredUpdateErr);
                            } else {
                                console.log(`[Task Controller - submitTaskRating] Successfully added $${profitForReferrals.toFixed(2)} to invited user ${referredUser.username} (ID: ${referredUser.id}) from inviter ${userId}'s lucky order.`);
                            }
                        });
                    });
                } else {
                    console.log(`[Task Controller - submitTaskRating] Inviter ${userId} completed lucky order, but has no referred users.`);
                }
            });
                            });
                        }, 2000);

                        res.status(200).json({ message: `Lucky task completed! $${returnAmount.toFixed(2)} credited to your account.`, isCompleted: true });
                    });

                } else {
                    const PROFIT_PERCENTAGE = 0.05;
                    const profitToAdd = parseFloat(user.wallet_balance) * PROFIT_PERCENTAGE;

                    User.updateBalanceAndTaskCount(userId, profitToAdd, 'add', (updateErr) => {
                        if (updateErr) return res.status(500).json({ message: "Task completed, but failed to update user data." });
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
                        res.status(200).json({ message: `Task completed! You earned $${profitToAdd.toFixed(2)}.`, isCompleted: true });
                    });
                }
            });
        });
    });
};

// This function remains unchanged
exports.getDashboardSummary = (req, res) => {
    const userId = req.user.id;
    Task.getDashboardCountsForUser(userId, (err, counts) => {
        if (err || !counts || counts.length === 0) {
             return res.status(200).json({ completedOrders: 0, uncompletedOrders: 0, dailyOrders: 0 });
        }
        const { completed_orders, uncompleted_orders, daily_orders } = counts[0];
        res.status(200).json({ completedOrders: completed_orders, uncompletedOrders: uncompleted_orders, dailyOrders: daily_orders });
    });
};