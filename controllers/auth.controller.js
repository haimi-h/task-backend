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

    // 2. Check if phone number is already registered
    User.findByPhone(phone, (err, results) => {
        if (err) {
            console.error("Database error during findByPhone for signup:", err);
            return res.status(500).json({ message: "Database error during signup." });
        }
        if (results.length > 0) {
            return res.status(400).json({ message: "Phone number already registered." });
        }

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
                let referrerId = null; // Initialize referrerId as null

                // 4. Handle referral code if provided in the request body
                if (referralCode) {
                    User.findByInvitationCode(referralCode, (err, referrerResults) => {
                        if (err) {
                            console.error("Error finding referrer by code:", err);
                            // Log the error but proceed with user registration without referrer
                        } else if (referrerResults.length > 0) {
                            referrerId = referrerResults[0].id; // Set referrerId if a valid code is found
                        }
                        // If referralCode is present but no valid referrer found, referrerId remains null

                        // 5. Create the new user in the database
                        User.create({
                            username,
                            phone,
                            password: hashedPassword,
                            withdrawal_password: hashedWithdrawPassword,
                            invitation_code,
                            referrer_id: referrerId, // Pass the determined referrerId (can be null)
                            role: 'user', // Default role for new users
                            daily_orders: 0,       // FIX: Initialize daily_orders to 0
                            completed_orders: 0,   // FIX: Initialize completed_orders to 0
                            uncompleted_orders: 0  // FIX: Initialize uncompleted_orders to 0
                        }, (createErr, createResult) => {
                            if (createErr) {
                                console.error("Error creating user in DB:", createErr);
                                return res.status(500).json({ message: "Error registering user." });
                            }
                            res.status(201).json({ message: "User registered successfully!" });
                        });
                    });
                } else {
                    // 5. Create the new user without a referral code
                    User.create({
                        username,
                        phone,
                        password: hashedPassword,
                        withdrawal_password: hashedWithdrawPassword,
                        invitation_code,
                        referrer_id: null, // No referrer
                        role: 'user',
                        daily_orders: 0,       // FIX: Initialize daily_orders to 0
                        completed_orders: 0,   // FIX: Initialize completed_orders to 0
                        uncompleted_orders: 0  // FIX: Initialize uncompleted_orders to 0
                    }, (createErr, createResult) => {
                        if (createErr) {
                            console.error("Error creating user in DB:", createErr);
                            return res.status(500).json({ message: "Error registering user." });
                        }
                        res.status(201).json({ message: "User registered successfully!" });
                    });
                }
            });
        });
    });
};

exports.login = (req, res) => {
    const { phone, password } = req.body;

    User.findByPhone(phone, async (err, results) => { // User.findByPhone uses a callback
        if (err) {
            console.error("Database error during findByPhone for login:", err);
            return res.status(500).json({ message: "Database error during login." });
        }
        if (results.length === 0) {
            return res.status(400).json({ message: "Invalid phone or password." });
        }

        const user = results[0];
        // Use bcrypt.compare with await, as it is promise-based
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) return res.status(400).json({ message: "Invalid phone or password." });

        // Sign JWT token
        const token = jwt.sign(
            { id: user.id, role: user.role }, // Ensure user.role exists in your DB or set a default
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Return token and relevant user data, including phone
        res.status(200).json({
            token,
            user: {
                id: user.id,
                username: user.username,
                phone: user.phone, // Ensure phone is returned here
                role: user.role,
                // invitation_code: user.invitation_code // You can include this if you want it returned on login
            }
        });
    });
};
