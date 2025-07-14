const InjectionPlan = require('../models/injectionPlan.model');

/**
 * Creates a new injection for a user.
 * Expects user_id in params and injection data in the body.
 */
exports.createInjection = (req, res) => {
    const { userId } = req.params;
    // Ensure all fields are extracted from req.body
    const { injection_order, commission_rate, injections_amount } = req.body;

    // Basic validation
    if (!injection_order || !injections_amount || commission_rate === undefined || commission_rate === null) {
        return res.status(400).json({ message: 'Injection order, commission rate, and amount are required.' });
    }

    // You might want more robust validation here, e.g., checking if they are numbers and positive.
    if (isNaN(injection_order) || parseInt(injection_order) <= 0 ||
        isNaN(commission_rate) || parseFloat(commission_rate) <= 0 ||
        isNaN(injections_amount) || parseFloat(injections_amount) <= 0) {
        return res.status(400).json({ message: 'Injection order, commission rate, and amount must be positive numbers.' });
    }

    const newInjection = {
        user_id: userId,
        injection_order: parseInt(injection_order), // Ensure it's an integer
        commission_rate: parseFloat(commission_rate), // Ensure it's a float
        injections_amount: parseFloat(injections_amount), // Ensure it's a float
    };

    InjectionPlan.create(newInjection, (err, result) => {
    if (err) {
        console.error("Error creating injection plan:", err); // <--- This is the key!
        return res.status(500).json({ message: 'Failed to create injection plan.', error: err.message });
    }
    res.status(201).json({ message: 'Injection created successfully.', id: result.insertId });
});
};

/**
 * Gets all injection plans for a specific user.
 * Expects user_id in the params.
 */
exports.getInjectionsByUserId = (req, res) => {
    const { userId } = req.params;

    InjectionPlan.findByUserId(userId, (err, results) => {
        if (err) {
            console.error(`Error fetching injection plans for user ${userId}:`, err);
            return res.status(500).json({ message: 'Failed to fetch injection plans.', error: err.message });
        }
        res.status(200).json(results);
    });
};

/**
 * Updates an existing injection plan.
 * Expects injectionId in params and updated data in the body.
 */
exports.updateInjection = (req, res) => {
    const { injectionId } = req.params;
    const { injection_order, commission_rate, injections_amount } = req.body;

    if (!injection_order || !injections_amount) {
        return res.status(400).json({ message: 'Injection order and amount are required.' });
    }

    const updatedData = {
        injection_order,
        commission_rate,
        injections_amount,
    };

    InjectionPlan.update(injectionId, updatedData, (err, result) => {
        if (err) {
            console.error(`Error updating injection plan ${injectionId}:`, err);
            return res.status(500).json({ message: 'Failed to update injection plan.', error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Injection plan not found.' });
        }
        res.status(200).json({ message: 'Injection plan updated successfully.' });
    });
};

/**
 * Deletes an injection plan.
 * Expects injectionId in the params.
 */
exports.deleteInjection = (req, res) => {
    const { injectionId } = req.params;

    InjectionPlan.delete(injectionId, (err, result) => {
        if (err) {
            console.error(`Error deleting injection plan ${injectionId}:`, err);
            return res.status(500).json({ message: 'Failed to delete injection plan.', error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Injection plan not found.' });
        }
        res.status(200).json({ message: 'Injection plan deleted successfully.' });
    });
};
