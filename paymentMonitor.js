// paymentMonitor.js
const tronWeb = require('./tron');

async function checkTRXPayment(address) {
  try {
    const balanceInSun = await tronWeb.trx.getBalance(address);
    const balanceInTRX = tronWeb.fromSun(balanceInSun);

    console.log(`TRX Balance for ${address}: ${balanceInTRX} TRX`);

    if (parseFloat(balanceInTRX) > 0) {
      console.log(`✅ TRX payment received!`);
    }
  } catch (error) {
    console.error('❌ Error checking TRX payment:', error);
  }
}

module.exports = { checkTRXPayment };
