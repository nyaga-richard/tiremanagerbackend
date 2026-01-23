const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { PERMISSIONS, SYSTEM_ROLES, DEFAULT_ROLE_PERMISSIONS } = require('../models/permissions');

const dbPath = path.join(__dirname, 'tires.db');
const db = new sqlite3.Database(dbPath);

async function seedDefaultData() {
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            try {
                console.log('Seeding default roles and permissions...');

                // Insert permissions
                const permissionEntries = [];
                Object.values(PERMISSIONS).forEach(category => {
                    Object.entries(category).forEach(([key, code]) => {
                        permissionEntries.push([code, key.replace('_', ' '), `Permission to ${key.replace('_', ' ').toLowerCase()}`]);
                    });
                });

                const insertPermission = db.prepare(`
                    INSERT OR IGNORE INTO permissions (code, name, description) 
                    VALUES (?, ?, ?)
                `);

                permissionEntries.forEach(entry => {
                    insertPermission.run(entry);
                });
                insertPermission.finalize();

                // Insert system roles
                const roleStmt = db.prepare(`
                    INSERT OR IGNORE INTO roles (name, description, is_system_role) 
                    VALUES (?, ?, 1)
                `);

                Object.values(SYSTEM_ROLES).forEach(roleName => {
                    roleStmt.run([roleName, `System role: ${roleName}`]);
                });
                roleStmt.finalize();

                // Wait for permissions and roles to be inserted
                db.run("COMMIT", async () => {
                    // Get role IDs
                    const roles = await new Promise((resolve, reject) => {
                        db.all("SELECT id, name FROM roles", [], (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        });
                    });

                    // Get permission IDs
                    const permissions = await new Promise((resolve, reject) => {
                        db.all("SELECT id, code FROM permissions", [], (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows);
                        });
                    });

                    // Map codes to IDs
                    const permissionMap = {};
                    permissions.forEach(p => {
                        permissionMap[p.code] = p.id;
                    });

                    // Insert role permissions
                    const rolePermStmt = db.prepare(`
                        INSERT OR IGNORE INTO role_permissions 
                        (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `);

                    roles.forEach(role => {
                        const rolePerms = DEFAULT_ROLE_PERMISSIONS[role.name];
                        if (rolePerms) {
                            rolePerms.forEach(perm => {
                                const permId = permissionMap[perm.permission];
                                if (permId) {
                                    rolePermStmt.run([
                                        role.id, 
                                        permId, 
                                        perm.can_view, 
                                        perm.can_create, 
                                        perm.can_edit, 
                                        perm.can_delete, 
                                        perm.can_approve || 0
                                    ]);
                                }
                            });
                        }
                    });
                    rolePermStmt.finalize();

                    // Create default admin user (password: Admin123!)
                    const bcrypt = require('bcrypt');
                    const hashedPassword = await bcrypt.hash('Admin123!', 10);
                    
                    const superAdminRole = roles.find(r => r.name === SYSTEM_ROLES.SUPER_ADMIN);
                    
                    if (superAdminRole) {
                        db.run(`
                            INSERT OR IGNORE INTO users 
                            (username, email, password_hash, full_name, role_id, is_active) 
                            VALUES (?, ?, ?, ?, ?, 1)
                        `, ['admin', 'admin@tiresystem.com', hashedPassword, 'System Administrator', superAdminRole.id]);
                    }

                    console.log('Default data seeding completed!');
                    resolve();
                });
            } catch (error) {
                console.error('Error seeding data:', error);
                reject(error);
            }
        });
    });
}

seedDefaultData().then(() => {
    db.close();
    console.log('Database connection closed.');
}).catch(err => {
    console.error('Failed to seed data:', err);
    db.close();
});