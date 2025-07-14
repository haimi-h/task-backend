const User = require('../models/user.model'); // Ensure this path is correct
const db = require('../models/db'); // This is not directly used in these functions, but generally okay
const jwt = require('jsonwebtoken'); // Although not directly used for decoding here, good to have if needed

// Get user profile (including invitation code and other details)
exports.getUserProfile = (req, res) => {
    // req.user.id comes from the authenticateToken middleware
    const userId = req.user.id;

    User.findById(userId, (err, user) => { // CHANGED 'results' to 'user' here to directly get the user object
        if (err) {
            console.error("Error fetching user profile from DB:", err);
            return res.status(500).json({ message: "Failed to fetch user profile." });
        }
        // If user is null, it means no user was found by findById
        if (!user) { // CHANGED 'results.length === 0' to '!user' for direct check
            return res.status(404).json({ message: "User not found." });
        }

        // 'user' is now directly the user object from the model
        res.status(200).json({
            user: {
                id: user.id,
                username: user.username,
                phone: user.phone,
                // These fields are included for future use; they might be null/undefined if not in DB yet
                email: user.email || null,
                invitation_code: user.invitation_code || null,
                vip_level: user.vip_level || 'Bronze', // Default value if not set
                daily_orders: user.daily_orders || 0, // Include these for consistency
                completed_orders: user.completed_orders || 0,
                uncompleted_orders: user.uncompleted_orders || 0,
                wallet_balance: user.wallet_balance || 0,
                role: user.role || 'user'
            }
        });
    });
};

// Get a user's list of referred users
exports.getMyReferrals = (req, res) => {
    // req.user.id comes from the authenticateToken middleware
    const userId = req.user.id;

    // Fetch users who have this user's ID as their referrer_id
    // Selecting relevant public data about referred users
    db.query(
        "SELECT id, username, phone, created_at FROM users WHERE referrer_id = ?",
        [userId],
        (err, results) => {
            if (err) {
                console.error("Error fetching referrals from DB:", err);
                return res.status(500).json({ message: "Failed to fetch referrals." });
            }
            // 'results' will be an array of referred users (can be empty)
            res.status(200).json({ referrals: results });
        }
    );
};
