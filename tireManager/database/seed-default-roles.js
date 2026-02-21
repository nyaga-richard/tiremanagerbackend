const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const { 
    PERMISSIONS, 
    SYSTEM_ROLES, 
    DEFAULT_ROLE_PERMISSIONS,
    getAllPermissions 
} = require('../config/permissions-config');

const dbPath = path.join(__dirname, 'tires.db');
const db = new sqlite3.Database(dbPath);

async function seedDefaultData() {
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            try {
                console.log('Seeding default roles and permissions...');

                // Begin transaction
                db.run("BEGIN TRANSACTION");

                // Insert all permissions
                const permissions = getAllPermissions();
                console.log(`Inserting ${permissions.length} permissions...`);

                const insertPermission = db.prepare(`
                    INSERT OR IGNORE INTO permissions (code, name, description, category) 
                    VALUES (?, ?, ?, ?)
                `);

                permissions.forEach(perm => {
                    insertPermission.run([perm.code, perm.name, `${perm.name} permission`, perm.category]);
                });
                insertPermission.finalize();

                // Insert system roles
                console.log('Inserting system roles...');
                const roleStmt = db.prepare(`
                    INSERT OR IGNORE INTO roles (name, description, is_system_role) 
                    VALUES (?, ?, 1)
                `);

                Object.values(SYSTEM_ROLES).forEach(roleName => {
                    roleStmt.run([roleName, `System role: ${roleName}`]);
                });
                roleStmt.finalize();

                // Get role IDs
                const roles = await new Promise((resolve, reject) => {
                    db.all("SELECT id, name FROM roles", [], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });

                // Get permission IDs
                const permissionsList = await new Promise((resolve, reject) => {
                    db.all("SELECT id, code FROM permissions", [], (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows);
                    });
                });

                // Map codes to IDs
                const permissionMap = {};
                permissionsList.forEach(p => {
                    permissionMap[p.code] = p.id;
                });

                // Insert role permissions for each role
                console.log('Assigning permissions to roles...');
                const rolePermStmt = db.prepare(`
                    INSERT OR IGNORE INTO role_permissions 
                    (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);

                for (const role of roles) {
                    console.log(`Processing role: ${role.name}`);
                    
                    let rolePermissions = [];
                    
                    if (role.name === SYSTEM_ROLES.SUPER_ADMIN) {
                        // Super Admin gets ALL permissions with ALL actions enabled
                        console.log('Setting up Super Administrator with full permissions...');
                        rolePermissions = permissions.map(perm => ({
                            permission_code: perm.code,
                            can_view: 1,
                            can_create: 1,
                            can_edit: 1,
                            can_delete: 1,
                            can_approve: 1
                        }));
                    } else {
                        // Get default permissions for other roles
                        const defaultPermsFunc = DEFAULT_ROLE_PERMISSIONS[role.name];
                        if (defaultPermsFunc) {
                            rolePermissions = defaultPermsFunc();
                        }
                    }

                    // Insert permissions for this role
                    for (const perm of rolePermissions) {
                        const permId = permissionMap[perm.permission_code];
                        if (permId) {
                            rolePermStmt.run([
                                role.id,
                                permId,
                                perm.can_view || 0,
                                perm.can_create || 0,
                                perm.can_edit || 0,
                                perm.can_delete || 0,
                                perm.can_approve || 0
                            ]);
                        } else {
                            console.warn(`Permission code not found: ${perm.permission_code}`);
                        }
                    }
                }
                
                rolePermStmt.finalize();

                // Create default admin user (password: Admin123!)
                console.log('Creating default admin user...');
                const hashedPassword = await bcrypt.hash('Admin123!', 10);
                
                const superAdminRole = roles.find(r => r.name === SYSTEM_ROLES.SUPER_ADMIN);
                
                if (superAdminRole) {
                    // Check if user already exists
                    const existingUser = await new Promise((resolve, reject) => {
                        db.get(
                            "SELECT id FROM users WHERE username = ? OR email = ?",
                            ['admin', 'admin@tiresystem.com'],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    if (!existingUser) {
                        db.run(`
                            INSERT INTO users 
                            (username, email, password_hash, full_name, role_id, is_active, created_at, updated_at) 
                            VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
                        `, [
                            'admin', 
                            'admin@tiresystem.com', 
                            hashedPassword, 
                            'System Administrator', 
                            superAdminRole.id
                        ], function(err) {
                            if (err) {
                                console.error('Error creating admin user:', err);
                            } else {
                                console.log(`Admin user created with ID: ${this.lastID}`);
                            }
                        });
                    } else {
                        console.log('Admin user already exists, skipping creation');
                    }
                }

                // Commit transaction
                db.run("COMMIT", (err) => {
                    if (err) {
                        console.error('Error committing transaction:', err);
                        db.run("ROLLBACK");
                        reject(err);
                    } else {
                        console.log('Default data seeding completed successfully!');
                        
                        // Log summary
                        console.log('\n=== Seeding Summary ===');
                        console.log(`Total permissions seeded: ${permissions.length}`);
                        console.log(`Total roles seeded: ${roles.length}`);
                        console.log(`Super Administrator permissions: ${permissions.length} permissions with all actions`);
                        
                        // Verify Super Admin has all permissions
                        const superAdmin = roles.find(r => r.name === SYSTEM_ROLES.SUPER_ADMIN);
                        if (superAdmin) {
                            db.all(`
                                SELECT COUNT(*) as count 
                                FROM role_permissions 
                                WHERE role_id = ?
                            `, [superAdmin.id], (err, result) => {
                                if (!err) {
                                    console.log(`Super Administrator has ${result[0].count} permission records`);
                                }
                            });
                        }
                        
                        resolve();
                    }
                });

            } catch (error) {
                console.error('Error seeding data:', error);
                db.run("ROLLBACK");
                reject(error);
            }
        });
    });
}

// Run the seeding
seedDefaultData().then(() => {
    console.log('Closing database connection...');
    db.close();
    console.log('Database connection closed.');
}).catch(err => {
    console.error('Failed to seed data:', err);
    db.close();
    process.exit(1);
});