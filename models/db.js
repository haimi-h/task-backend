// your-project/models/db.js
const mysql = require('mysql2');
require('dotenv').config(); // Make sure your .env file is loaded

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Adjust this based on your expected load
    queueLimit: 0
});

// Optional: Add event listeners for connection pool monitoring
pool.on('connection', (connection) => {
    console.log('Database connected from pool!');
});

pool.on('error', (err) => {
    console.error('Database pool error:', err.code);
    // Depending on the error, you might want to restart the application
    // or log more details for debugging production issues.
});

// Export methods with 'this' context bound to the pool instance.
// This is crucial to prevent "TypeError: this.onResult is not a function"
// and other context-related errors when db.query is called.
module.exports = {
  query: pool.query.bind(pool),
  getConnection: pool.getConnection.bind(pool)
};