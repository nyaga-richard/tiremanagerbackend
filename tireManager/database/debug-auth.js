const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'tires.db');
const db = new sqlite3.Database(dbPath);

async function debugAuth() {
    try {
        // Check if admin user exists
        const user = await new Promise((resolve, reject) => {
            db.get(`
                SELECT u.*, r.name as role_name 
                FROM users u 
                JOIN roles r ON u.role_id = r.id 
                WHERE u.username = ?
            `, ['admin'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            console.log('❌ Admin user not found in database');
            
            // Check if roles exist
            const roles = await new Promise((resolve, reject) => {
                db.all("SELECT * FROM roles", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            console.log('Available roles:', roles);
            
            // Check if users table has any records
            const users = await new Promise((resolve, reject) => {
                db.all("SELECT * FROM users", [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            console.log('Users in database:', users);
            
        } else {
            console.log('✅ Admin user found:', {
                id: user.id,
                username: user.username,
                email: user.email,
                role_id: user.role_id,
                role_name: user.role_name,
                is_active: user.is_active,
                password_hash_exists: !!user.password_hash
            });

            // Test password comparison
            const testPassword = 'Admin123!';
            const isValid = await bcrypt.compare(testPassword, user.password_hash);
            console.log(`Password comparison for "${testPassword}":`, isValid ? '✅ Valid' : '❌ Invalid');

            // Check password hash format
            console.log('Password hash:', user.password_hash);
        }

    } catch (error) {
        console.error('Debug error:', error);
    } finally {
        db.close();
    }
}

debugAuth();