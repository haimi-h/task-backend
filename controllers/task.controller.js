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

    const walletBalance = parseFloat(user.wallet_balance || 0);
    const minimumBalanceRequired = 2.00;

    if (walletBalance < minimumBalanceRequired) {
        console.log(`[Task Controller - getTask] User ${userId} blocked from starting task. Balance ${walletBalance} is less than minimum ${minimumBalanceRequired}.`);
        return res.status(200).json({
            message: "You can't evaluate products with the current amount. At least you should recharge $2 minimum.",
            task: null,
            errorCode: 'INSUFFICIENT_BALANCE_FOR_TASKS',
            balance: walletBalance // Pass current balance to frontend
        });
    }

    // Calculate the next expected task order for lucky orders
    const nextTaskOrder = user.completed_orders + 1; // Assuming injection_order corresponds to completed tasks + 1

    Task.getTaskForUser(userId, (err, task) => {
        if (err) {
            console.error("Error getting task for user:", err);
            return res.status(500).json({ message: "Failed to load task." });
        }

        // Check if there's an active lucky order plan for this user at the next task order
        InjectionPlan.findByUserIdAndOrder(userId, nextTaskOrder, (luckyErr, luckyPlan) => { // FIXED: Passed nextTaskOrder
            if (luckyErr) {
                console.error("Error checking for lucky plan:", luckyErr);
                // Decide how to handle this error. For now, proceed as non-lucky.
            }

            let isLuckyOrder = false;
            let luckyOrderCapitalRequired = 0;
            let luckyOrderCommissionRate = 0;

            if (luckyPlan) {
                isLuckyOrder = true;
                luckyOrderCapitalRequired = parseFloat(luckyPlan.injections_amount);
                luckyOrderCommissionRate = parseFloat(luckyPlan.commission_rate);
                console.log(`[Task Controller - getTask] Lucky Order detected for User ${userId}. Capital: ${luckyOrderCapitalRequired}, Commission: ${luckyOrderCommissionRate}`);
            }

            if (!task && !isLuckyOrder) { // If no regular task and no lucky order active
                return res.status(200).json({ message: "No new tasks available.", task: null, balance: walletBalance });
            }

            // If a lucky order is active but no regular task is found, we should still return the lucky order details
            if (isLuckyOrder && !task) {
                // Create a dummy task object for lucky order if no product is available for rating
                // This assumes lucky orders don't necessarily involve a product image/name
                // If lucky orders *do* require a specific product, you'd need to fetch one here.
                task = {
                    id: 'lucky-order-placeholder', // A unique ID for lucky orders
                    name: 'Lucky Order Task',
                    image_url: '[https://via.placeholder.com/150?text=Lucky+Order](https://via.placeholder.com/150?text=Lucky+Order)', // Placeholder image
                    price: luckyOrderCapitalRequired, // Display capital as price for lucky order
                    description: `Complete this lucky order to earn ${luckyOrderCommissionRate} USD profit!`,
                    isLuckyOrder: true,
                    luckyOrderCapitalRequired: luckyOrderCapitalRequired
                };
            } else if (task) {
                // For regular tasks, attach lucky order info (even if false) for the frontend to render correctly
                task.isLuckyOrder = isLuckyOrder;
                task.luckyOrderCapitalRequired = luckyOrderCapitalRequired;
            }
            
            res.status(200).json({ task, balance: walletBalance, isLuckyOrder, luckyOrderCapitalRequired });
        });
    });
});
};

exports.submitTaskRating = (req, res) => {
const userId = req.user.id;
const { productId, rating } = req.body;

if (!userId || !productId || typeof rating === 'undefined') {
    return res.status(400).json({ message: "Missing required fields: userId, productId, or rating." });
}

if (rating !== 5) {
    return res.status(400).json({ message: "Only 5-star ratings can complete a task." });
}

User.findById(userId, (userErr, user) => {
    if (userErr) {
        console.error("Error fetching user during rating submission:", userErr);
        return res.status(500).json({ message: "Error processing rating." });
    }
    if (!user) {
        return res.status(404).json({ message: "User not found." });
    }

    const userBalance = parseFloat(user.wallet_balance || 0);
    // Calculate the current task order for lucky orders, as this task is being completed
    const currentTaskOrder = user.completed_orders + 1; // Assuming injection_order corresponds to completed tasks + 1

    InjectionPlan.findByUserIdAndOrder(userId, currentTaskOrder, (luckyErr, luckyPlan) => { // FIXED: Passed currentTaskOrder
        if (luckyErr) {
            console.error("Error checking for lucky plan during rating submission:", luckyErr);
            // Decide how to handle this error. For now, proceed as non-lucky.
        }

        let isLuckyOrder = false;
        let luckyOrderCapital = 0;
        let luckyOrderCommission = 0;

        if (luckyPlan) {
            isLuckyOrder = true;
            luckyOrderCapital = parseFloat(luckyPlan.injections_amount);
            luckyOrderCommission = parseFloat(luckyPlan.commission_rate);
            console.log(`[Task Controller - submitTaskRating] Lucky Order detected for User ${userId}. Capital: ${luckyOrderCapital}, Commission: ${luckyOrderCommission}`);

            // Check balance for lucky order *again* just in case frontend check was bypassed or balance changed
            if (userBalance < luckyOrderCapital) {
                console.log(`[Task Controller - submitTaskRating] User ${userId} insufficient balance for lucky order. Balance: ${userBalance}, Required: ${luckyOrderCapital}`);
                return res.status(400).json({
                    message: `This is a lucky order! Your current balance is $${userBalance.toFixed(2)}. Please recharge the remaining $${(luckyOrderCapital - userBalance).toFixed(2)} to proceed.`,
                    errorCode: 'INSUFFICIENT_BALANCE_FOR_LUCKY_ORDER'
                });
            }
        }
        
        Task.submitRating(userId, productId, rating, (err, message, isCompleted) => {
            if (err) {
                console.error(`Error submitting rating for User ${userId}, Product ${productId}:`, err);
                return res.status(500).json({ message: "Failed to submit rating." });
            }

            let profitToAdd = 0;
            let newBalance = userBalance;

            if (isLuckyOrder) {
                // Lucky order: Deduct capital, then add capital + commission after delay
                // The frontend handles the initial balance check and recharge prompt
                // Here, we'll perform the balance update logic as per your lucky order implementation
                
                // Deduct capital immediately
                newBalance -= luckyOrderCapital;
                console.log(`[Task Controller - submitTaskRating] Lucky Order: Capital ${luckyOrderCapital} deducted from User ${userId}. New Balance: ${newBalance}`);

                // Update balance with deduction and mark task as completed (or pending return)
                User.updateBalanceAndTaskCount(userId, newBalance, true, true, false, (updateErr, updateResult) => {
                    if (updateErr) {
                        console.error(`Error updating balance after lucky order capital deduction for user ${userId}:`, updateErr);
                        return res.status(500).json({ message: "Lucky order submitted, but failed to deduct capital." });
                    }
                    
                    // Schedule the return of capital + commission after a delay
                    // This uses a setTimeout on the backend for simulation purposes.
                    // In a real system, this might be a cron job or a message queue.
                    setTimeout(() => {
                        User.updateBalance(userId, newBalance + luckyOrderCapital + luckyOrderCommission, (returnErr) => {
                            if (returnErr) {
                                console.error(`Error returning lucky order capital + commission for user ${userId}:`, returnErr);
                                // Log this for admin, perhaps revert task status, or handle through manual review
                            } else {
                                console.log(`[Task Controller - submitTaskRating] Lucky Order: Capital ${luckyOrderCapital} and Commission ${luckyOrderCommission} returned to User ${userId}.`);
                                io.to(`user-${userId}`).emit('balanceUpdate', {
                                    newBalance: newBalance + luckyOrderCapital + luckyOrderCommission,
                                    message: `Lucky order profit of $${luckyOrderCommission.toFixed(2)} received!`
                                });
                            }
                        });
                    }, luckyPlan.return_delay_ms || 30 * 1000); // Default 30 seconds delay

                    res.status(200).json({
                        message: `Lucky order submitted! Capital of $${luckyOrderCapital.toFixed(2)} deducted. Profit of $${luckyOrderCommission.toFixed(2)} will be added shortly.`,
                        isCompleted: true
                    });
                });
                return; // Exit here for lucky orders
            } else {
                // NOT a lucky order: Calculate 5% profit from user's current balance
                profitToAdd = userBalance * 0.05;
                newBalance = userBalance + profitToAdd;

                console.log(`[Task Controller - submitTaskRating] Standard Task: User ${userId} current balance: ${userBalance.toFixed(2)}. Profit (5% of balance): ${profitToAdd.toFixed(2)}. New Balance: ${newBalance.toFixed(2)}`);

                // Update user's balance and task counts
                User.updateBalanceAndTaskCount(
                    userId,
                    newBalance, // new calculated balance
                    true,       // increment completed_orders
                    true,       // increment daily_orders
                    false,      // do not decrement uncompleted_orders (if it was an uncompleted, submitRating handles it)
                    (updateErr, updateResult) => {
                        if (updateErr) {
                            console.error(`Error updating balance/task counts for user ${userId}:`, updateErr); // ADDED LOG
                            return res.status(500).json({ message: "Task completed, but failed to update user data." });
                        }
                        res.status(200).json({
                            message: `Task completed successfully! You earned $${profitToAdd.toFixed(2)}.`,
                            isCompleted: true
                        });
                    }
                );
            }
        });
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