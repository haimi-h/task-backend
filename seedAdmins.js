const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./models/db'); // Adjust this path if your db connection file is elsewhere

// --- Client's Requirements ---
const ADMIN_PASSWORD = 'PMG1234';
const ADMIN_USERNAMES = [
    'Xin1',
    'Leo',    // NOTE: Interpreting "Leo/Fu2" as two separate users: 'Leo' and 'Fu2'.
    'Fu2',
    'Escap',
    'PWRFL',
    'Trump',
    'Donakes'
];

const seedAdmins = async () => {
    console.log('Starting to seed admin accounts...');

    try {
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        let createdCount = 0;

        for (const username of ADMIN_USERNAMES) {
            // Generate a unique phone number and invitation code for each admin.
            // The phone number is required by the schema but won't be used for login if admins use username.
            // Using a placeholder format for the phone number.
            const phone = `000-${Math.floor(1000 + Math.random() * 9000)}-${ADMIN_USERNAMES.indexOf(username)}`;
            const invitation_code = uuidv4().substring(0, 8);

            const adminData = {
                username,
                phone, // 'phone' must be unique in your schema.
                password: hashedPassword,
                withdrawal_password: hashedPassword, // Setting a default withdrawal password as well.
                invitation_code,
                referrer_id: null, // Admins don't have referrers.
                role: 'admin',     // CRITICAL: This sets them as administrators.
                daily_orders: 0,
                completed_orders: 0,
                uncompleted_orders: 0
            };

            const sql = `
                INSERT INTO users (username, phone, password, withdrawal_password, invitation_code, referrer_id, role, daily_orders, completed_orders, uncompleted_orders)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            // Using db.query to insert each user
            // In a real scenario, you might want to wrap this in a transaction or use INSERT IGNORE to prevent errors if a user already exists.
            try {
                const [result] = await db.promise().query(sql, [
                    adminData.username,
                    adminData.phone,
                    adminData.password,
                    adminData.withdrawal_password,
                    adminData.invitation_code,
                    adminData.referrer_id,
                    adminData.role,
                    adminData.daily_orders,
                    adminData.completed_orders,
                    adminData.uncompleted_orders
                ]);

                if (result.affectedRows > 0) {
                    console.log(`✅ Successfully created admin: ${username}`);
                    createdCount++;
                } else {
                     console.log(`- Admin '${username}' might already exist or failed to insert.`);
                }
            } catch (error) {
                 if (error.code === 'ER_DUP_ENTRY') {
                    console.log(`- Admin '${username}' already exists. Skipping.`);
                } else {
                    console.error(`❌ Error creating admin ${username}:`, error.message);
                }
            }
        }

        console.log(`\nSeeding complete. Created ${createdCount} new admin account(s).`);

    } catch (error) {
        console.error('An unexpected error occurred during the seeding process:', error);
    } finally {
        db.end(); // Close the database connection
        console.log('Database connection closed.');
    }
};

// Run the seeding function
seedAdmins();