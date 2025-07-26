// your-project/server.js
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken'); // <--- ADD THIS LINE to import jsonwebtoken

const authRoutes = require('./routes/auth.routes');
const taskRoutes = require('./routes/task.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const injectionPlanRoutes = require('./routes/injectionPlan.routes');
const paymentRoutes = require('./routes/payment.routes');
const chatRoutes = require('./routes/chat.routes');
const rechargeRoutes = require('./routes/recharge.routes');

const { checkTRXPayments } = require('./paymentMonitor');
const User = require('./models/user.model');
const Admin = require('./models/admin.model');
const ChatMessage = require('./models/chat.model');

require('dotenv').config();

const app = express();
const server = http.createServer(app);

const allowedOrigins = process.env.NODE_ENV === 'production'
    ? [
        'https://shopify-clone-orpin.vercel.app', // Your user frontend
        'https://admin-backend-lake.vercel.app', // Your admin frontend
        'https://shopify-task.onrender.com' // Your backend URL (sometimes needed if backend makes requests to itself)
      ]
    : ["http://localhost:3000", "http://localhost:3001"];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}.`;
            console.warn(msg);
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

// --- NEW: Socket.IO Authentication Middleware ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        console.warn('Socket.IO Auth Error: Token not provided.');
        return next(new Error('Authentication error: Token not provided.'));
    }
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.error('Socket.IO Auth Error: Invalid token.', err.message);
            return next(new Error('Authentication error: Invalid token.'));
        }
        socket.user = decoded; // Attach user info (id, role) to the socket
        console.log(`Socket.IO: User ${socket.user.id} (${socket.user.role}) authenticated.`);
        next();
    });
});
// --- End Socket.IO Authentication Middleware ---

// --- NEW: Export the io instance ---
module.exports.io = io; // Make io available to other modules

app.use(express.json());

// --- New route to serve products from products.json ---
app.get('/api/products', (req, res) => {
    const productsFilePath = path.join(__dirname, 'products.json');
    fs.readFile(productsFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading products.json:', err);
            return res.status(500).json({ message: 'Error loading products.' });
        }
        try {
            const products = JSON.parse(data);
            res.json(products);
        } catch (parseErr) {
            console.error('Error parsing products.json:', parseErr);
            res.status(500).json({ message: 'Error parsing product data.' });
        }
    });
});

// Existing Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/injection-plans', injectionPlanRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/chat', chatRoutes);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    // The socket.user object (containing id and role) is now available here
    // console.log('Authenticated socket user:', socket.user); // You can uncomment this for debugging

    socket.on('sendMessage', async (data) => {
        console.log('Backend Socket.IO: Received sendMessage event with data:', data);
        const { userId, senderId, senderRole, messageText, tempId } = data;

        // Optional: Add server-side validation here to ensure senderId matches socket.user.id
        // if (senderId !== socket.user.id) {
        //     console.warn(`Attempted message send by user ${socket.user.id} for userId ${senderId}. Mismatch detected.`);
        //     return; // Prevent unauthorized sending
        // }

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
                    tempId: tempId
                };

                console.log('BROADCASTING MESSAGE:', JSON.stringify(newMessage, null, 2));

                io.to(`user-${userId}`).emit('receiveMessage', newMessage);
                io.to('admins').emit('receiveMessage', newMessage);

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
        // Optional: Add server-side validation here to ensure adminId matches socket.user.id and socket.user.role is 'admin'
        if (socket.user && socket.user.role === 'admin') {
            socket.join('admins');
            console.log(`Admin ${adminId} identified and joined 'admins' room.`);
        } else {
            console.warn(`Unauthorized attempt to identify as admin by user ${socket.user ? socket.user.id : 'N/A'}.`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

setInterval(async () => {
    console.log('💲 Checking for payments...');
    await checkTRXPayments();
    // When you're ready for USDT, you'll add it here:
    // await checkUSDTTRC20Payments();
}, 15000);
