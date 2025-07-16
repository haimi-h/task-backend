const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model'); // Ensure this path is correct
const { v4: uuidv4 } = require('uuid'); // Import uuid for unique codes
require('dotenv').config();

exports.signup = (req, res) => {
    // Extract all necessary fields from the request body
    const { username, phone, password, confirm_password, withdrawal_password, referralCode } = req.body;

    // 1. Basic validation: Check if passwords match
    if (password !== confirm_password) {
        return res.status(400).json({ message: "Passwords do not match." });
    }

    // ⭐ NEW: Enforce mandatory referralCode
    if (!referralCode) {
        return res.status(400).json({ message: "Referral code is required for registration." });
    }

    // 2. Check if phone number is already registered
    User.findByPhone(phone, (err, results) => {
        if (err) {
            console.error("Database error during findByPhone for signup:", err);
            return res.status(500).json({ message: "Database error during signup." });
        }
        if (results.length > 0) {
            return res.status(400).json({ message: "Phone number already registered." });
        }

        // ⭐ MODIFIED: Find referrer by the provided referralCode BEFORE hashing passwords
        User.findByInvitationCode(referralCode, (err, referrerResults) => {
            if (err) {
                console.error("Error finding referrer by code:", err);
                return res.status(500).json({ message: "Database error during referral code validation." });
            }
            if (referrerResults.length === 0) {
                return res.status(400).json({ message: "Invalid referral code. Please check your code and try again." });
            }

            const referrerId = referrerResults[0].id; // Get referrerId if a valid code is found

            // 3. Hash passwords using callbacks (bcrypt.hash is callback-based by default)
            bcrypt.hash(password, 10, (err, hashedPassword) => {
                if (err) {
                    console.error("Error hashing password:", err);
                    return res.status(500).json({ message: "Error hashing main password." });
                }

                bcrypt.hash(withdrawal_password, 10, (err, hashedWithdrawPassword) => {
                    if (err) {
                        console.error("Error hashing withdrawal password:", err);
                        return res.status(500).json({ message: "Error hashing withdrawal password." });
                    }

                    // Generate a unique invitation code for the new user
                    const invitation_code = uuidv4().substring(0, 8); // e.g., "abcdef12"

                    // 4. Create the new user in the database
                    User.create({
                        username,
                        phone,
                        password: hashedPassword,
                        withdrawal_password: hashedWithdrawPassword,
                        invitation_code,
                        referrer_id: referrerId, // Pass the VALIDATED referrerId
                        role: 'user', // Default role for new users
                        daily_orders: 0,
                        completed_orders: 0,
                        uncompleted_orders: 0
                    }, (createErr, createResult) => {
                        if (createErr) {
                            console.error("Error creating user in DB:", createErr);
                            return res.status(500).json({ message: "Error registering user." });
                        }
                        res.status(201).json({ message: "User registered successfully!" });
                    });
                });
            });
        });
    });
};

exports.login = (req, res) => {
    const { phone, password } = req.body;

    User.findByPhone(phone, async (err, results) => {
        if (err) {
            console.error("Database error during findByPhone for login:", err);
            return res.status(500).json({ message: "Database error during login." });
        }
        if (results.length === 0) {
            return res.status(400).json({ message: "Invalid phone or password." });
        }

        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(400).json({ message: "Invalid phone or password." });

        const token = jwt.sign(
            { id: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                phone: user.phone,
                role: user.role,
            }
        });
    });
};