const express = require('express');
const router = express.Router();
const injectionPlanController = require('../controllers/injectionPlan.controller');
const authenticateToken = require('../middleware/auth.middleware');
const { checkAdminRole } = require('../controllers/admin.controller');

// All injection plan routes should be protected and accessible only by admins.
router.use(authenticateToken, checkAdminRole);

/**
 * @route   POST /api/injection-plans/:userId
 * @desc    Create a new injection plan for a user
 * @access  Admin
 */
router.post('/:userId', injectionPlanController.createInjection);

/**
 * @route   GET /api/injection-plans/:userId
 * @desc    Get all injection plans for a specific user
 * @access  Admin
 */
router.get('/:userId', injectionPlanController.getInjectionsByUserId);

/**
 * @route   PUT /api/injection-plans/:injectionId
 * @desc    Update an existing injection plan
 * @access  Admin
 */
router.put('/:injectionId', injectionPlanController.updateInjection);

/**
 * @route   DELETE /api/injection-plans/:injectionId
 * @desc    Delete an injection plan
 * @access  Admin
 */
router.delete('/:injectionId', injectionPlanController.deleteInjection);

module.exports = router;
