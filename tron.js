
const { TronWeb } = require('tronweb'); 

const privateKey = process.env.TRON_PRIVATE_KEY;
const apiKey = process.env.TRONGRID_API_KEY;



const tronWeb = new TronWeb(
  'https://api.shasta.trongrid.io', // fullNode
  'https://api.shasta.trongrid.io', // solidityNode (often same for testnets)
  'https://api.shasta.trongrid.io', // eventServer (often same for testnets)
  privateKey 
);

tronWeb.setHeader({'TRON-PRO-API-KEY': apiKey});

module.exports = tronWeb;

// const TronWeb = require('tronweb');
// const TronWeb = require('tronweb').default;
// const { TronWeb } = require('tronweb'); 
// // const TronWeb = require('tronweb');


// const tronWeb = new TronWeb({
//   // fullHost: 'https://api.trongrid.io',
//   fullHost: 'https://api.shasta.trongrid.io',
//   headers: { 'TRON-PRO-API-KEY': apikey }
// });

// module.exports = tronWeb;