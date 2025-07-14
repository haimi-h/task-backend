// your-project/server.js
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const userRoutes = require('./routes/user.routes'); // <--- ADD THIS LINE
const adminRoutes = require('./routes/admin.routes');
// const injectionPlanRoutes = require('./routes/injectionPlan.routes');
const injectionPlanRoutes = require('./routes/injectionPlan.routes');
const paymentRoutes = require('./routes/payment.routes');
// const { checkPayment } = require('./paymentMonitor');
const { checkTRXPayment } = require('./paymentMonitor');
// const { checkUSDTTRC20Payment } = require('./paymentMonitor');
const testAddress = 'TPXiVEAJU3s94Tm4rDsMCZRHNbd9hmRSXn';
// const adminRoutes = require('./routes/adminRoutes'); 
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes); 
app.use('/api/admin', adminRoutes);
app.use('/api/injection-plans', injectionPlanRoutes); 
app.use('/api/payment', paymentRoutes);


// Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
const addressesToMonitor = [];

addressesToMonitor.push(testAddress);

setInterval(() => {
  console.log('💲 Checking for  payments...'); 
  
  checkTRXPayment(testAddress); 
}, 10000);