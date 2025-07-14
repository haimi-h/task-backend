// your-project/routes/task.routes.js
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const authenticateToken = require('../middleware/auth.middleware'); // Import your authentication middleware

// Route to get a single task (product) for the user to rate
// This will be used for the page where the user gives stars (image_33f0df.jpg)
router.get('/task', authenticateToken, taskController.getTask);

// Route to submit a product rating
// This will be called when the user clicks 'Submit' after giving stars
router.post('/submit-rating', authenticateToken, taskController.submitTaskRating);

// Route to get the summary for the dashboard (uncompleted, completed, daily tasks)
// This will be used for the dashboard page (image_33f0d6.png)
router.get('/dashboard-summary', authenticateToken, taskController.getDashboardSummary);

module.exports = router;