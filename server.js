const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const { setIo } = require('./utils/socket');
const { checkTRXPayments } = require('./paymentMonitor');

const User = require('./models/user.model');
const Admin = require('./models/admin.model');
const ChatMessage = require('./models/chat.model');

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://shopify-clone-orpin.vercel.app', 'https://admin-backend-lake.vercel.app']
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed from this origin'), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
setIo(io); // ✅ Store Socket.IO globally

// Routes
const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const injectionPlanRoutes = require('./routes/injectionPlan.routes');
const paymentRoutes = require('./routes/payment.routes');
const chatRoutes = require('./routes/chat.routes');
const rechargeRoutes = require('./routes/recharge.routes');



app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/injection-plans', injectionPlanRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/chat', chatRoutes);

// Serve products.json
app.get('/api/products', (req, res) => {
  const filePath = path.join(__dirname, 'products.json');
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ message: 'Error loading products' });
    try {
      res.json(JSON.parse(data));
    } catch (parseErr) {
      res.status(500).json({ message: 'Error parsing product data' });
    }
  });
});

// --- Socket.IO Events ---
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('sendMessage', (data) => {
  const { userId, senderId, senderRole, messageText, tempId } = data;
  if (!userId || !senderId || !senderRole || !messageText) return;

  // FIX: Pass 'null' for the imageUrl argument to match the new function signature
  ChatMessage.create(userId, senderId, senderRole, messageText, null, (err, result) => { //
    if (err) {
      // This will now log the TypeError if it happens, but the fix above should prevent it.
      console.error('Socket msg save error:', err);
      return; 
    }

    const newMsg = {
      id: result.insertId,
      user_id: userId,
      sender_id: senderId,
      sender_role: senderRole,
      message_text: messageText,
      image_url: null, // Ensure the broadcasted message also has this field
      timestamp: new Date().toISOString(),
      tempId,
    };

    io.to(`user-${userId}`).emit('receiveMessage', newMsg);
    io.to('admins').emit('receiveMessage', newMsg);
    if (senderRole === 'user') {
      io.to('admins').emit('unreadConversationUpdate', { userId, hasUnread: true });
    }
  });
});

  socket.on('joinRoom', (room) => socket.join(room));
  socket.on('leaveRoom', (room) => socket.leave(room));
  socket.on('identifyAdmin', (adminId) => {
    socket.join('admins');
    console.log(`Admin ${adminId} joined 'admins' room.`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// --- Payment monitoring loop ---
setInterval(async () => {
  console.log('💲 Checking for payments...');
  await checkTRXPayments();
}, 15000);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = { app, io, server };
