const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model'); // Ensure this path is correct
const { v4: uuidv4 } = require('uuid'); // Import uuid for unique codes
require('dotenv').config();

// The signup function remains unchanged.
exports.signup = (req, res) => {
    // ... (Your signup function remains unchanged)
    const { username, phone, password, confirm_password, withdrawal_password, referralCode } = req.body;

    if (password !== confirm_password) {
        return res.status(400).json({ message: "Passwords do not match." });
    }
    
    if (!referralCode) {
        return res.status(400).json({ message: "Referral code is required for registration." });
    }

    User.findByPhone(phone, (err, results) => { //
        if (err) {
            console.error("Database error during findByPhone for signup:", err);
            return res.status(500).json({ message: "Database error during signup." });
        }
        if (results.length > 0) {
            return res.status(400).json({ message: "Phone number already registered." });
        }

        User.findByInvitationCode(referralCode, (err, referrerResults) => { //
            if (err) {
                console.error("Error finding referrer by code:", err);
                return res.status(500).json({ message: "Database error during referral code validation." });
            }
            if (referrerResults.length === 0) {
                return res.status(400).json({ message: "Invalid referral code. Please check your code and try again." });
            }

            const referrerId = referrerResults[0].id; 

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

                    const invitation_code = uuidv4().substring(0, 8); 

                    User.create({ //
                        username,
                        phone,
                        password: hashedPassword,
                        withdrawal_password: hashedWithdrawPassword,
                        invitation_code,
                        referrer_id: referrerId,
                        role: 'user', 
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


/**
 * MODIFIED: This function now handles two types of login:
 * 1. Admins log in with `username` and `password`.
 * 2. Regular users log in with `phone` and `password`.
 */
exports.login = (req, res) => {
    const { username, phone, password } = req.body;

    const handleLoginResponse = async (err, results) => {
        if (err) {
            return res.status(500).json({ message: "Database error during login." });
        }
        if (results.length === 0) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

        const user = results[0];

        // Role validation check
        if (username && user.role !== 'admin') {
            return res.status(403).json({ message: "Access denied. Only admins can log in with a username." });
        }
        if (phone && user.role !== 'user') {
            return res.status(403).json({ message: "Access denied. Only users can log in with a phone number." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid credentials." });
        }

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
    };

    if (username) {
        // Admin login flow
        User.findByUsername(username, handleLoginResponse); //
    } else if (phone) {
        // User login flow
        User.findByPhone(phone, handleLoginResponse); //
    } else {
        // Neither username nor phone provided
        return res.status(400).json({ message: "Please provide a username or phone number to log in." });
    }
};