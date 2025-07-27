// controllers/chat.controller.js
const ChatMessage = require("../models/chat.model"); // Import the ChatMessage model
const User = require("../models/user.model"); // Import User model to get admin's role/ID if needed
const jwt = require("jsonwebtoken"); // For decoding token if needed, though auth middleware handles most

/**
 * Sends a new chat message.
 * This can be used by both users and admins.
 */
exports.sendMessage = (req, res) => {
  const { userId, messageText } = req.body; // userId is the conversation partner (the user)
  const senderId = req.user.id; // ID of the authenticated sender (user or admin)
  const senderRole = req.user.role; // Role of the authenticated sender ('user' or 'admin')

  // Basic validation
  if (!userId || !messageText) {
    return res
      .status(400)
      .json({ message: "User ID and message text are required." });
  }

  // Ensure the sender is authorized to send a message for this userId
  // If sender is a 'user', userId must match senderId (they can only message themselves)
  // If sender is an 'admin', they can message any userId
  if (senderRole === "user" && userId !== senderId) {
    return res
      .status(403)
      .json({
        message:
          "Unauthorized: Users can only send messages to their own chat.",
      });
  }

  ChatMessage.create(
    userId,
    senderId,
    senderRole,
    messageText,
    (err, result) => {
      if (err) {
        console.error("Error sending message:", err);
        return res
          .status(500)
          .json({ message: "Failed to send message.", error: err.message });
      }
      // REMOVED: Immediate markMessagesAsRead call here.
      // Messages will be marked as read when the recipient fetches them.
      res
        .status(201)
        .json({
          message: "Message sent successfully.",
          messageId: result.insertId,
        });
    }
  );
};

exports.sendImageMessage = (req, res) => {
  const { userId } = req.body;
  const senderId = req.user.id;
  const senderRole = req.user.role;

  if (!req.file) {
    return res.status(400).json({ message: 'Image file is required.' });
  }

  // Construct the image URL
  const imageUrl = `/uploads/${req.file.filename}`;

  ChatMessage.create(userId, senderId, senderRole, null, imageUrl, (err, result) => {
    if (err) {
      console.error('Error sending image message:', err);
      return res.status(500).json({ message: 'Failed to send image message.' });
    }
    res.status(201).json({ message: 'Image sent successfully.', messageId: result.insertId, imageUrl });
  });
};

/**
 * Fetches all chat messages for a specific user's conversation.
 * This can be accessed by the user themselves or by an admin.
 */
exports.getMessages = (req, res) => {
  const userId = parseInt(req.params.userId, 10); // CRITICAL FIX: Parse userId to integer
  const requesterId = req.user.id; // ID of the authenticated requester
  const requesterRole = req.user.role; // Role of the authenticated requester

  // Authorization check: User can only view their own messages. Admin can view any.
  if (requesterRole === "user" && userId !== requesterId) {
    return res
      .status(403)
      .json({
        message: "Unauthorized: You can only view your own chat messages.",
      });
  }

  // First, get the user's wallet address to pass to ensureInitialMessages
  User.findById(userId, (userErr, user) => {
    if (userErr) {
      console.error("Error fetching user for initial messages:", userErr);
      return res
        .status(500)
        .json({
          message: "Failed to retrieve user data for chat initialization.",
        });
    }
    if (!user) {
      return res
        .status(404)
        .json({ message: "User not found for chat initialization." });
    }

    const userWalletAddress = user.walletAddress;

    // MODIFIED: Pass requesterId (which will be admin's ID if admin is viewing)
    // Ensure the adminId passed to ensureInitialMessages is actually an admin's ID if an admin is viewing
    const adminIdForInitialMessages = requesterRole === 'admin' ? requesterId : null; // Pass adminId only if requester is an admin

    ChatMessage.ensureInitialMessages(
      userId,
      userWalletAddress,
      adminIdForInitialMessages, // Pass the adminId here
      (initErr, initResult) => {
        if (initErr) {
          console.error("Error ensuring initial messages:", initErr);
          // Continue, but log the error. Initial messages might not be there.
        }
        console.log(initResult.message); // Log message from ensureInitialMessages

        // Now fetch all messages for the user
        ChatMessage.getMessagesByUserId(userId, (err, messages) => {
          if (err) {
            console.error("Error fetching messages:", err);
            return res
              .status(500)
              .json({
                message: "Failed to retrieve messages.",
                error: err.message,
              });
          }

          // After fetching, mark messages as read by the requester
          ChatMessage.markMessagesAsRead(
            userId,
            requesterRole,
            (readErr, readResult) => {
              if (readErr) {
                console.error(
                  "Error marking messages as read after fetching:",
                  readErr
                );
                // Continue with success response, as messages were fetched
              }
              const sanitizedMessages =
                requesterRole === "user"
                  ? messages.filter(
                      (msg) =>
                        // Add a check here: Ensure message_text exists and is a string
                        !(msg.message_text && typeof msg.message_text === 'string' &&
                          msg.message_text.startsWith(
                            "Your unique TRC20/TRX deposit address"
                          ))
                    )
                  : messages;

              res.status(200).json(sanitizedMessages);
            }
          );
        });
      }
    );
  });
};

/**
 * Fetches a list of users who have unread messages for an admin.
 * Only accessible by admins.
 */
exports.getUsersWithUnreadMessages = (req, res) => {
  const requesterRole = req.user.role;

  if (requesterRole !== "admin") {
    return res
      .status(403)
      .json({ message: "Access denied. Administrator privileges required." });
  }

  ChatMessage.getUsersWithUnreadMessagesForAdmin((err, users) => {
    if (err) {
      console.error("Error fetching users with unread messages:", err);
      return res
        .status(500)
        .json({
          message: "Failed to retrieve unread messages list.",
          error: err.message,
        });
    }
    res.status(200).json(users);
  });
};

