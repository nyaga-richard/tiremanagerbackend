const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'tires.db');
const db = new sqlite3.Database(dbPath);

async function resetAdminPassword() {
    try {
        // Generate a proper hash for Admin123!
        const password = 'Admin123!';
        const saltRounds = 10;
        
        console.log('Generating hash for password:', password);
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('Generated hash:', hashedPassword);

        // Update the admin user's password
        const result = await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET password_hash = ? WHERE username = ?',
                [hashedPassword, 'admin'],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        if (result > 0) {
            console.log('✅ Admin password reset successfully!');
            
            // Verify the new password works
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT password_hash FROM users WHERE username = ?', ['admin'], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            // Test the new hash
            const isValid = await bcrypt.compare(password, user.password_hash);
            console.log('Password verification test:', isValid ? '✅ PASSED' : '❌ FAILED');
            
            if (isValid) {
                console.log('\nYou can now login with:');
                console.log('Username: admin');
                console.log('Password: Admin123!');
            }
        } else {
            console.log('❌ Admin user not found');
        }

    } catch (error) {
        console.error('Error resetting password:', error);
    } finally {
        db.close();
    }
}

resetAdminPassword();