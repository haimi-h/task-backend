const db = require('./db');


class RechargeTransaction {
  /**
   * Finds recharge transactions by user ID.
   * @param {number} userId - The ID of the user.
   * @returns {Promise<Array>} A promise that resolves to an array of recharge transactions.
   */
  static async findByUserId(userId) {
    try {
      const transactions = await knex('recharge_transactions')
        .where({ user_id: userId })
        .select('*') // Select all columns, or specify which ones you need
        .orderBy('created_at', 'desc'); // Order by most recent first
      return transactions;
    } catch (error) {
      console.error('Error fetching recharge transactions by user ID:', error);
      throw error; // Re-throw to be caught by the route handler
    }
  }

  // You might have other methods here for creating, updating, deleting transactions
  // e.g., static async create(data) { ... }
}

module.exports = RechargeTransaction;
