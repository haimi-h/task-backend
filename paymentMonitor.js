// paymentMonitor.js
const tronWeb = require('./tron');
const db = require('./models/db'); // We need the database connection here

// This function now checks for pending transactions and updates them
async function checkTRXPayments() {
  try {
    // 1. Find all 'pending' recharge transactions
    const [pendingTxs] = await db.promise().query("SELECT * FROM recharge_transactions WHERE status = 'pending' AND currency = 'TRX'");

    if (pendingTxs.length === 0) {
      // console.log('[Monitor] No pending TRX transactions to check.');
      return;
    }

    console.log(`[Monitor] Found ${pendingTxs.length} pending TRX transaction(s).`);

    for (const tx of pendingTxs) {
      try {
        const balanceInSun = await tronWeb.trx.getBalance(tx.to_address);
        const balanceInTRX = parseFloat(tronWeb.fromSun(balanceInSun));

        // 2. Check if the received amount is sufficient
        // For simplicity, we check if the current balance can cover the expected amount.
        // A more robust system would track the balance *before* and *after*.
        if (balanceInTRX >= tx.amount_expected) {
          console.log(`✅ Payment detected for user ${tx.user_id} at address ${tx.to_address}! Amount: ${balanceInTRX} TRX.`);

          // 3. Use a DB transaction to ensure data integrity
          const connection = await db.promise().getConnection();
          await connection.beginTransaction();

          try {
            // Credit the user's main wallet balance
            await connection.query(
              'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
              [tx.amount_expected, tx.user_id]
            );

            // Mark the transaction as 'completed'
            await connection.query(
              "UPDATE recharge_transactions SET status = 'completed' WHERE id = ?",
              [tx.id]
            );

            await connection.commit();
            console.log(`[Monitor] Successfully credited ${tx.amount_expected} TRX to user ${tx.user_id} and closed transaction ${tx.id}.`);
          } catch (updateError) {
            await connection.rollback();
            console.error(`[Monitor] DB Transaction failed for user ${tx.user_id}:`, updateError);
          } finally {
            connection.release();
          }
        }
      } catch (error) {
        console.error(`[Monitor] Error checking address ${tx.to_address}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error in checkTRXPayments:', error);
  }
}

// In the future, you would add a similar function for USDT
// async function checkUSDTTRC20Payments() { ... }

module.exports = { checkTRXPayments }; // Export the new function