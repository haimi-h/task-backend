// paymentMonitor.js
const tronWeb = require('./tron');
const db = require('./models/db'); // We need the database connection here

async function checkTRXPayments() {
  try {
    const [pendingTxs] = await db.promise().query("SELECT * FROM recharge_transactions WHERE status = 'pending' AND currency = 'TRX'");

    if (pendingTxs.length === 0) {
      return;
    }

    console.log(`[Monitor] Found ${pendingTxs.length} pending TRX transaction(s).`);

    for (const tx of pendingTxs) {
      try {
        const balanceInSun = await tronWeb.trx.getBalance(tx.to_address);
        const balanceInTRX = parseFloat(tronWeb.fromSun(balanceInSun));

        if (balanceInTRX >= tx.amount_expected) {
          console.log(`✅ Payment detected for user ${tx.user_id} at address ${tx.to_address}! Amount: ${balanceInTRX} TRX.`);

          // --- THIS IS THE CORRECTED TRANSACTION LOGIC ---
          try {
            // 1. Start the transaction on the main 'db' connection
            await db.promise().beginTransaction();

            // 2. Credit the user's main wallet balance
            await db.promise().query(
              'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
              [tx.amount_expected, tx.user_id]
            );

            // 3. Mark the transaction as 'completed'
            await db.promise().query(
              "UPDATE recharge_transactions SET status = 'completed' WHERE id = ?",
              [tx.id]
            );

            // 4. If both queries succeed, commit the transaction
            await db.promise().commit();
            console.log(`[Monitor] Successfully credited ${tx.amount_expected} TRX to user ${tx.user_id} and closed transaction ${tx.id}.`);
          
          } catch (updateError) {
            // 5. If any query fails, roll back the changes
            await db.promise().rollback();
            console.error(`[Monitor] DB Transaction FAILED for user ${tx.user_id}. Changes were rolled back.`, updateError);
          }
        }
      } catch (error) {
        // This catch block now correctly handles errors from the tronWeb API call
        console.error(`[Monitor] Error checking address ${tx.to_address}:`, error.message);
      }
    }
  } catch (error) {
    console.error('❌ Error in the main checkTRXPayments function:', error);
  }
}

// Keep the module.exports the same
module.exports = { checkTRXPayments };