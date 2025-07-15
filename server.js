// your-project/server.js
const express = require('express');
const cors = require('cors');
const http = require('http'); // FIX: Corrected this line
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const injectionPlanRoutes = require('./routes/injectionPlan.routes');
const paymentRoutes = require('./routes/payment.routes');
const chatRoutes = require('./routes/chat.routes');

const { checkTRXPayment, checkUSDTTRC20Payment } = require('./paymentMonitor');
const User = require('./models/user.model');
const Admin = require('./models/admin.model');
const ChatMessage = require('./models/chat.model');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Define allowed origins for CORS.
// In development, use localhost origins.
// In production, you MUST replace these with your actual deployed frontend URLs.
// Example: ['https://your-user-app.com', 'https://your-admin-app.com']
const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://your-user-frontend-domain.com', // <--- IMPORTANT: REPLACE THIS IN PRODUCTION
        'https://your-admin-frontend-domain.com'  // <--- IMPORTANT: REPLACE THIS IN PRODUCTION
      ]
    : ["http://localhost:3000", "http://localhost:3001"];

// Configure CORS middleware for HTTP requests
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE"], // Ensure all methods your API uses are listed
  credentials: true // Allow cookies/authorization headers to be sent
}));

// Configure Socket.IO server
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Use the same allowed origins for Socket.IO
    methods: ["GET", "POST"] // Methods allowed for WebSocket connections
  }
});

// Middleware
app.use(express.json()); // This should be after cors() if you want to apply cors to json parsing errors too

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/injection-plans', injectionPlanRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/chat', chatRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  socket.on('sendMessage', async (data) => {
    console.log('Backend Socket.IO: Received sendMessage event with data:', data);
    const { userId, senderId, senderRole, messageText, tempId } = data;

    if (!userId || !senderId || !senderRole || !messageText) {
      console.error('Invalid message data received via socket:', data);
      return;
    }

    try {
      console.log('Backend Socket.IO: Attempting to save message to DB...');
      ChatMessage.create(userId, senderId, senderRole, messageText, (err, result) => {
        if (err) {
          console.error('Error saving message via socket:', err);
          return;
        }
        console.log('Backend Socket.IO: Message saved to DB. Result:', result);
        const newMessage = {
          id: result.insertId,
          user_id: userId,
          sender_id: senderId,
          sender_role: senderRole,
          message_text: messageText,
          timestamp: new Date().toISOString(),
          tempId: tempId // Include tempId in the emitted message
        };

        // **Debug Log:** Verify the object being broadcasted
        console.log('BROADCASTING MESSAGE:', JSON.stringify(newMessage, null, 2));

        // Broadcast to the user's private room and the general admin room
        io.to(`user-${userId}`).emit('receiveMessage', newMessage);
        io.to('admins').emit('receiveMessage', newMessage);

        // If the user sent the message, notify admins of an unread conversation
        if (senderRole === 'user') {
            io.to('admins').emit('unreadConversationUpdate', { userId: userId, hasUnread: true });
        }
      });

    } catch (error) {
      console.error('Socket.IO message processing error:', error);
    }
  });

  socket.on('joinRoom', (roomName) => {
    socket.join(roomName);
    console.log(`${socket.id} joined room: ${roomName}`);
  });

  socket.on('leaveRoom', (roomName) => {
    socket.leave(roomName);
    console.log(`${socket.id} left room: ${roomName}`);
  });

  socket.on('identifyAdmin', (adminId) => {
    socket.join('admins');
    console.log(`Admin ${adminId} identified and joined 'admins' room.`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});


// Server start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- Payment Monitoring Loop ---
setInterval(async () => {
  console.log('💲 Checking for payments...');
  try {
    const usersToMonitor = await new Promise((resolve, reject) => {
        Admin.getAllUsersForAdmin((err, users) => {
            if (err) return reject(err);
            resolve(users.filter(user => user.walletAddress && user.walletAddress !== ''));
        });
    });

    for (const user of usersToMonitor) {
      if (user.walletAddress) {
        console.log(`Checking ${user.username}'s wallet: ${user.walletAddress}`);
        // await checkTRXPayment(user.walletAddress, user.id);
        // await checkUSDTTRC20Payment(user.walletAddress, user.id);
      }
    }
  } catch (error) {
    console.error('❌ Error in payment monitoring loop:', error);
  }
}, 30000);
