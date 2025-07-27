// models/chat.model.js
const db = require('./db'); // Ensure this path is correct to your database connection

const ChatMessage = {
    /**
     * Creates a new chat message in the database.
     * @param {number} userId - The ID of the user associated with the conversation.
     * @param {number} senderId - The ID of the actual sender (user's ID or admin's ID).
     * @param {string} senderRole - The role of the sender ('user' or 'admin').
     * @param {string} messageText - The content of the message.
     * @param {function} callback - Callback function (err, result)
     */
    // create: (userId, senderId, senderRole, messageText, callback) => {
    //     const sql = `
    //         INSERT INTO chat_messages (user_id, sender_id, sender_role, message_text)
    //         VALUES (?, ?, ?, ?);
    //     `;
    //     db.query(sql, [userId, senderId, senderRole, messageText], callback);
    // },
    create: (userId, senderId, senderRole, messageText, imageUrl, callback) => {
    const sql = `
        INSERT INTO chat_messages (user_id, sender_id, sender_role, message_text, image_url)
        VALUES (?, ?, ?, ?, ?);
    `;
    db.query(sql, [userId, senderId, senderRole, messageText, imageUrl], callback);
},


    /**
     * Fetches all chat messages for a specific user.
     * Messages are ordered by timestamp.
     * @param {number} userId - The ID of the user whose messages to fetch.
     * @param {function} callback - Callback function (err, messages)
     */
    getMessagesByUserId: (userId, callback) => {
        const sql = `
            SELECT
                cm.id,
                cm.user_id,
                cm.sender_id,
                cm.sender_role,
                cm.message_text,
                cm.image_url,
                cm.timestamp,
                cm.is_read_by_user,
                cm.is_read_by_admin,
                u.username AS senderUsername -- Fetch sender's username (if sender is a user)
            FROM
                chat_messages cm
            LEFT JOIN
                users u ON cm.sender_id = u.id AND cm.sender_role = 'user' -- Join only if sender is a user
            WHERE
                cm.user_id = ?
            ORDER BY
                cm.timestamp ASC;
        `;
        db.query(sql, [userId], callback);
    },

    /**
     * Marks messages as read for a specific user/admin.
     * @param {number} userId - The ID of the user whose conversation is being updated.
     * @param {string} readerRole - The role of the entity marking messages as read ('user' or 'admin').
     * @param {function} callback - Callback function (err, result)
     */
    markMessagesAsRead: (userId, readerRole, callback) => {
        let sql;
        if (readerRole === 'user') {
            // Mark messages sent by admin as read by user
            sql = `
                UPDATE chat_messages
                SET is_read_by_user = TRUE
                WHERE user_id = ? AND sender_role = 'admin';
            `;
        } else if (readerRole === 'admin') {
            // Mark messages sent by user as read by admin
            sql = `
                UPDATE chat_messages
                SET is_read_by_admin = TRUE
                WHERE user_id = ? AND sender_role = 'user';
            `;
        } else {
            return callback(new Error('Invalid reader role.'));
        }
        db.query(sql, [userId], callback);
    },

    /**
     * Fetches all unique users who have sent messages that an admin has not yet read.
     * This is for the admin dashboard to show pending chats.
     * @param {function} callback - Callback function (err, usersWithUnreadMessages)
     */
    getUsersWithUnreadMessagesForAdmin: (callback) => {
        const sql = `
            SELECT DISTINCT
                cm.user_id AS id,
                u.username,
                u.phone
            FROM
                chat_messages cm
            JOIN
                users u ON cm.user_id = u.id
            WHERE
                cm.sender_role = 'user' AND cm.is_read_by_admin = FALSE
            ORDER BY
                cm.timestamp DESC;
        `;
        db.query(sql, (err, results) => {
            if (err) {
                console.error('Error in getUsersWithUnreadMessagesForAdmin query:', err);
                return callback(err);
            }
            console.log('Backend: getUsersWithUnreadMessagesForAdmin results:', results);
            callback(null, results);
        });
    },

    /**
     * Ensures a user has initial welcome messages.
     * If no messages exist for the user, it creates them.
     * @param {number} userId - The ID of the user.
     * @param {string} userWalletAddress - The user's wallet address to include in the message.
     * @param {number} adminId - The ID of the admin who triggered the initial messages creation.
     * @param {function} callback - Callback function (err, result)
     */
    ensureInitialMessages: (userId, userWalletAddress, adminId, callback) => {
        // First, check if any messages exist for this user
        db.query('SELECT COUNT(*) AS count FROM chat_messages WHERE user_id = ?', [userId], (err, results) => {
            if (err) {
                console.error('Error checking for existing messages in ensureInitialMessages:', err);
                return callback(err);
            }

            const messageCount = results[0].count;

            if (messageCount === 0) {
                console.log(`No existing messages for user ${userId}. Creating initial messages.`);
                // If no messages exist, insert the initial welcome messages
                const initialMessages = [
                    { sender_id: adminId || 0, sender_role: 'admin', message_text: 'Welcome to customer service! How can I help you?' }, // Use 0 or a default admin ID if adminId is null
                    // Uncomment and adjust this if you want to send the wallet address as an initial message
                    // { sender_id: adminId || 0, sender_role: 'admin', message_text: `Your unique TRC20/TRX deposit address is: ${userWalletAddress || 'Not assigned yet. Please visit the payment page to generate it.'}` },
                ];

                // Use a transaction or Promise.all for multiple inserts for atomicity
                const insertPromises = initialMessages.map(msg => {
                    return new Promise((resolve, reject) => {
                        const sql = `
                            INSERT INTO chat_messages (user_id, sender_id, sender_role, message_text)
                            VALUES (?, ?, ?, ?);
                        `;
                        db.query(sql, [userId, msg.sender_id, msg.sender_role, msg.message_text], (insertErr, insertResult) => {
                            if (insertErr) {
                                console.error('Error inserting initial message:', insertErr);
                                return reject(insertErr);
                            }
                            resolve(insertResult);
                        });
                    });
                });

                Promise.all(insertPromises)
                    .then(() => {
                        console.log(`Successfully inserted initial messages for user ${userId}.`);
                        callback(null, { message: 'Initial messages created.' });
                    })
                    .catch(promiseErr => {
                        console.error(`Failed to insert all initial messages for user ${userId}:`, promiseErr);
                        callback(promiseErr);
                    });

            } else {
                // Messages already exist, do nothing
                console.log(`Messages already exist for user ${userId}. No initial messages created.`);
                callback(null, { message: 'Messages already exist, no initial messages created.' });
            }
        });
    }
};

module.exports = ChatMessage;

