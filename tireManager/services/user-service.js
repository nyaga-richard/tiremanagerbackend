// user-service.js
const bcrypt = require('bcryptjs');
const db = require('../config/database');

class UserService {
    // Create a new user
    async createUser(userData) {
        try {
            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(userData.password, salt);
            
            const result = await db.runQuery(`
                INSERT INTO users 
                (username, email, password_hash, full_name, role_id, department, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                userData.username,
                userData.email,
                hashedPassword,
                userData.full_name,
                userData.role_id,
                userData.department || null,
                userData.is_active !== undefined ? userData.is_active : 1
            ]);
            
            return await this.getUserById(result.lastID);
        } catch (error) {
            throw error;
        }
    }
    
    // Update user
    async updateUser(userId, userData) {
        try {
            let updateFields = [];
            let params = [];
            
            if (userData.username) {
                updateFields.push('username = ?');
                params.push(userData.username);
            }
            
            if (userData.email) {
                updateFields.push('email = ?');
                params.push(userData.email);
            }
            
            if (userData.full_name) {
                updateFields.push('full_name = ?');
                params.push(userData.full_name);
            }
            
            if (userData.role_id !== undefined) {
                updateFields.push('role_id = ?');
                params.push(userData.role_id);
            }
            
            if (userData.department !== undefined) {
                updateFields.push('department = ?');
                params.push(userData.department);
            }
            
            if (userData.is_active !== undefined) {
                updateFields.push('is_active = ?');
                params.push(userData.is_active);
            }
            
            // Update password if provided
            if (userData.password) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(userData.password, salt);
                updateFields.push('password_hash = ?');
                params.push(hashedPassword);
            }
            
            updateFields.push('updated_at = CURRENT_TIMESTAMP');
            
            params.push(userId);
            
            const sql = `
                UPDATE users 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `;
            
            await db.runQuery(sql, params);
            
            return await this.getUserById(userId);
        } catch (error) {
            throw error;
        }
    }
    
    // Get user by ID with role info
    async getUserById(userId) {
        try {
            const user = await db.getQuery(`
                SELECT u.*, 
                    r.name as role_name,
                    r.description as role_description
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = ?
            `, [userId]);
            
            return user;
        } catch (error) {
            throw error;
        }
    }
    
    // Get all users
    async getAllUsers() {
        try {
            return await db.allQuery(`
                SELECT u.*, 
                    r.name as role_name,
                    COUNT(DISTINCT s.id) as session_count
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN user_sessions s ON u.id = s.user_id AND s.is_active = 1
                GROUP BY u.id
                ORDER BY u.full_name
            `);
        } catch (error) {
            throw error;
        }
    }
    
    // Delete user
    async deleteUser(userId) {
        try {
            await db.runQuery('BEGIN TRANSACTION');
            
            // Delete user sessions
            await db.runQuery('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
            
            // Delete user
            await db.runQuery('DELETE FROM users WHERE id = ?', [userId]);
            
            await db.runQuery('COMMIT');
            
            return true;
        } catch (error) {
            await db.runQuery('ROLLBACK');
            throw error;
        }
    }
    
    // Verify user credentials
    async verifyCredentials(username, password) {
        try {
            const user = await db.getQuery(`
                SELECT u.*, r.name as role_name
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1
            `, [username, username]);
            
            if (!user) {
                return null;
            }
            
            const isValidPassword = await bcrypt.compare(password, user.password_hash);
            
            if (!isValidPassword) {
                return null;
            }
            
            // Update last login
            await db.runQuery(
                'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
                [user.id]
            );
            
            // Remove password hash from returned user object
            delete user.password_hash;
            
            return user;
        } catch (error) {
            throw error;
        }
    }
    
    // Get user permissions
    async getUserPermissions(userId) {
        try {
            return await db.allQuery(`
                SELECT p.code, 
                    rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_approve
                FROM users u
                JOIN roles r ON u.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = ?
                ORDER BY p.category, p.name
            `, [userId]);
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new UserService();