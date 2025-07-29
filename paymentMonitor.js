// your-project/paymentMonitor.js
const tronWeb = require('./tron'); // Assuming tron is correctly configured
const db = require('./models/db'); // We need the database connection here

// This function will periodically check for pending TRX payments (simulated for now)
// Original was async, converting to use callbacks for consistency with db.js
const checkTRXPayments = () => {
    console.log('💲 Checking for payments...');
    try {
        // Find pending transactions with callbacks
        db.query("SELECT * FROM recharge_transactions WHERE status = 'pending' AND currency = 'TRX'", (err, pendingTxs) => {
            if (err) {
                console.error('❌ Error fetching pending TRX transactions:', err);
                return;
            }

            if (!pendingTxs || pendingTxs.length === 0) {
                return;
            }

            console.log(`[Monitor] Found ${pendingTxs.length} pending TRX transaction(s).`);

            // Use a loop to process each transaction
            pendingTxs.forEach(tx => {
                // In a real application, you would integrate with a TRX API here.
                // For example: tronWeb.trx.getBalance(tx.to_address);
                // And then verify incoming transactions.

                // For now, we simulate success or use a placeholder for TronWeb calls.
                // Replace this with your actual TronWeb integration.
                console.log(`[Monitor] Simulating payment check for transaction ID: ${tx.id}, User: ${tx.user_id}`);

                // --- Simulated Payment Detection ---
                // Replace this with real TronWeb balance/transaction checks
                // For demonstration, let's assume it always "finds" the payment for now
                const paymentDetected = true; // Placeholder: Replace with actual tronWeb.trx.getBalance logic

                if (paymentDetected) {
                    console.log(`✅ Payment detected for user ${tx.user_id} at address ${tx.to_address}! Simulating amount: ${tx.amount_expected} TRX.`);

                    // --- Transaction Logic using callbacks (similar to rechargeRequest.controller) ---
                    db.getConnection((connErr, connection) => {
                        if (connErr) {
                            console.error('[Monitor] Error getting DB connection for payment processing:', connErr);
                            return;
                        }

                        connection.beginTransaction(transErr => {
                            if (transErr) {
                                connection.release();
                                console.error('[Monitor] Error beginning transaction for payment processing:', transErr);
                                return;
                            }

                            // 1. Credit the user's main wallet balance
                            connection.query(
                                'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
                                [tx.amount_expected, tx.user_id],
                                (updateUserErr, updateUserResult) => {
                                    if (updateUserErr) {
                                        return connection.rollback(() => {
                                            connection.release();
                                            console.error(`[Monitor] DB Transaction FAILED (user update) for user ${tx.user_id}.`, updateUserErr);
                                        });
                                    }

                                    // 2. Mark the transaction as 'completed'
                                    connection.query(
                                        "UPDATE recharge_transactions SET status = 'completed' WHERE id = ?",
                                        [tx.id],
                                        (updateTxErr, updateTxResult) => {
                                            if (updateTxErr) {
                                                return connection.rollback(() => {
                                                    connection.release();
                                                    console.error(`[Monitor] DB Transaction FAILED (tx update) for user ${tx.user_id}.`, updateTxErr);
                                                });
                                            }

                                            // 3. Commit the transaction
                                            connection.commit(commitErr => {
                                                if (commitErr) {
                                                    return connection.rollback(() => {
                                                        connection.release();
                                                        console.error('[Monitor] Error committing transaction for payment processing:', commitErr);
                                                    });
                                                }

                                                connection.release();
                                                console.log(`[Monitor] Successfully credited ${tx.amount_expected} TRX to user ${tx.user_id} and closed transaction ${tx.id}.`);
                                            });
                                        }
                                    );
                                }
                            );
                        });
                    });
                } else {
                    // Payment not yet detected, do nothing or log
                    // console.log(`Payment not yet received for transaction ID: ${tx.id}`);
                }
            });

        });

    } catch (error) {
        // This catch block handles synchronous errors within checkTRXPayments,
        // but most DB errors will now be in the callbacks.
        console.error('❌ Error in the main checkTRXPayments function:', error);
    }
};

module.exports = { checkTRXPayments };