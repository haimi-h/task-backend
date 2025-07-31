// your-project/controllers/task.controller.js
const Task = require('../models/task.model');
const User = require('../models/user.model');
const InjectionPlan = require('../models/injectionPlan.model');
const RechargeRequest = require('../models/rechargeRequest.model'); // Import RechargeRequest model
const { getIo } = require('../utils/socket'); // Assuming socket might be used later

// Helper function to keep code DRY
function fetchAndSendTask(res, user, isLucky, injectionPlan) {
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
            profit: isLucky ? (parseFloat(injectionPlan.commission_rate) || 0) : (parseFloat(task.profit) || 0)
        };

        res.status(200).json({
            task: taskToSend,
            balance: parseFloat(user.wallet_balance) || 0,
            isLuckyOrder: isLucky,
            luckyOrderCapitalRequired: isLucky ? (parseFloat(injectionPlan.injections_amount) || 0) : 0,
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

                    if (!isApproved) {
                        console.log(`[Task Controller] User ${userId} blocked. Recharge for plan ${matchingInjectionPlan.id} not approved.`);
                        return res.status(200).json({
                            task: null,
                            isLuckyOrder: true,
                            luckyOrderRequiresRecharge: true,
                            luckyOrderCapitalRequired: parseFloat(matchingInjectionPlan.injections_amount) || 0,
                            luckyOrderProfit: parseFloat(matchingInjectionPlan.commission_rate) || 0,
                            injectionPlanId: matchingInjectionPlan.id,
                            // --- THIS IS THE FIXED LINE ---
                            message: `A recharge of $${(parseFloat(matchingInjectionPlan.injections_amount) || 0).toFixed(2)} is required for this lucky order. Please recharge and wait for admin approval.`
                        });
                    }

                    if (parseFloat(user.wallet_balance) < parseFloat(matchingInjectionPlan.injections_amount)) {
                         return res.status(400).json({ message: `Your balance is insufficient for this lucky order, even after recharge. Please contact support.` });
                    }
                    
                    fetchAndSendTask(res, user, true, matchingInjectionPlan);
                });
            } else {
                fetchAndSendTask(res, user, false, null);
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

                    if (parseFloat(user.wallet_balance) < capitalRequired) {
                        return res.status(400).json({ message: `Insufficient balance for this lucky order. You need $${capitalRequired.toFixed(2)}.` });
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
                            });
                        }, 2000);

                        res.status(200).json({ message: `Lucky task completed! $${returnAmount.toFixed(2)} credited to your account.`, isCompleted: true });
                    });

                } else {
                    const PROFIT_PERCENTAGE = 0.05;
                    const profitToAdd = parseFloat(user.wallet_balance) * PROFIT_PERCENTAGE;

                    User.updateBalanceAndTaskCount(userId, profitToAdd, 'add', (updateErr) => {
                        if (updateErr) return res.status(500).json({ message: "Task completed, but failed to update user data." });
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