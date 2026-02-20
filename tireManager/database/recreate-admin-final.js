const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { SYSTEM_ROLES } = require('../models/permissions');

const dbPath = path.join(__dirname, 'tires.db');
const db = new sqlite3.Database(dbPath);

async function recreateAdminUser() {
    try {
        // Start transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // First, let's check what roles exist
        const roles = await new Promise((resolve, reject) => {
            db.all("SELECT id, name FROM roles", [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log('Available roles:');
        roles.forEach(role => console.log(`  - ${role.name} (ID: ${role.id})`));

        // Find the super admin or admin role
        let adminRole = roles.find(r => r.name === SYSTEM_ROLES.SUPER_ADMIN);
        
        // If no super admin, try to find Admin role
        if (!adminRole) {
            adminRole = roles.find(r => r.name === 'Admin');
        }
        
        // If still no role, create one
        if (!adminRole) {
            console.log('No admin role found, creating one...');
            const result = await new Promise((resolve, reject) => {
                db.run(
                    'INSERT INTO roles (name, description, is_system_role) VALUES (?, ?, ?)',
                    ['Super Admin', 'System Administrator with full access', 1],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this);
                    }
                );
            });
            
            adminRole = { id: result.lastID, name: 'Super Admin' };
            console.log(`Created Super Admin role with ID: ${adminRole.id}`);
        }

        // Generate proper hash for Admin123!
        const password = 'Admin123!';
        console.log(`\nGenerating hash for password: ${password}`);
        const hashedPassword = await bcrypt.hash(password, 10);
        console.log(`Generated hash: ${hashedPassword}`);

        // Delete any existing admin users
        await new Promise((resolve, reject) => {
            db.run("DELETE FROM users WHERE username = 'admin'", (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        console.log('Removed existing admin user(s)');

        // Create new admin user
        const result = await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO users 
                (username, email, password_hash, full_name, role_id, is_active, created_at) 
                VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`,
                ['admin', 'admin@tiremanager.com', hashedPassword, 'System Administrator', adminRole.id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                }
            );
        });

        console.log(`\n✅ Admin user created with ID: ${result.lastID}`);

        // Commit transaction
        await new Promise((resolve, reject) => {
            db.run('COMMIT', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        // Verify the user was created correctly
        const newUser = await new Promise((resolve, reject) => {
            db.get(`
                SELECT u.*, r.name as role_name 
                FROM users u 
                JOIN roles r ON u.role_id = r.id 
                WHERE u.username = 'admin'
            `, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (newUser) {
            console.log('\n✅ User verification:');
            console.log(`  ID: ${newUser.id}`);
            console.log(`  Username: ${newUser.username}`);
            console.log(`  Email: ${newUser.email}`);
            console.log(`  Role: ${newUser.role_name} (ID: ${newUser.role_id})`);
            console.log(`  Active: ${newUser.is_active}`);
            console.log(`  Hash length: ${newUser.password_hash.length}`);
            console.log(`  Hash preview: ${newUser.password_hash.substring(0, 20)}...`);

            // Test the password
            const isValid = await bcrypt.compare(password, newUser.password_hash);
            console.log(`\n🔐 Password test for "${password}": ${isValid ? '✅ SUCCESS' : '❌ FAILED'}`);

            if (isValid) {
                console.log('\n🎉 Login credentials:');
                console.log('  Username: admin');
                console.log('  Password: Admin123!');
                console.log('  Email: admin@tiremanager.com');
            }
        }

    } catch (error) {
        // Rollback on error
        await new Promise((resolve) => {
            db.run('ROLLBACK', () => resolve());
        });
        console.error('❌ Error recreating admin user:', error);
    } finally {
        db.close();
    }
}

// Run the function
recreateAdminUser();