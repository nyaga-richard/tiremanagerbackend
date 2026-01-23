const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const AuthMiddleware = require('../middleware/auth-middleware');
const { PERMISSIONS } = require('../models/permissions');

// Initialize auth middleware
const db = require('../config/database');
const auth = new AuthMiddleware(db);

// User login
router.post('/login', async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and password are required' 
            });
        }

        // Find user with role information
        const user = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    u.*, 
                    r.name as role_name,
                    r.id as role_id
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE (u.username = ? OR u.email = ?) 
                AND u.is_active = 1
            `, [username, username], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password' 
            });
        }
        
        // Verify password
        const isValid = await auth.verifyPassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password' 
            });
        }
        
        // Get user permissions
        const permissions = await auth.getUserPermissions(user.id);
        
        // Generate token with custom expiry
        const tokenExpiry = rememberMe ? '7d' : '24h';
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role_name,
                role_id: user.role_id,
                permissions: permissions
            },
            process.env.JWT_SECRET || 'your-secret-key',
            { expiresIn: tokenExpiry }
        );
        
        // Create session
        const session = await auth.createSession(
            user.id, 
            req.headers['user-agent'], 
            req.ip
        );
        
        // Update last login
        db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
        
        // Log login
        await auth.logAudit(
            user.id, 
            'LOGIN', 
            'user', 
            user.id, 
            null, 
            { login_time: new Date().toISOString() }, 
            req
        );
        
        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role_name,
                role_id: user.role_id,
                department: user.department,
                permissions: permissions.map(p => ({
                    code: p.code,
                    can_view: p.can_view,
                    can_create: p.can_create,
                    can_edit: p.can_edit,
                    can_delete: p.can_delete,
                    can_approve: p.can_approve
                }))
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Login failed. Please try again.' 
        });
    }
});

// User logout
router.post('/logout', auth.authenticate, async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            // Invalidate session
            db.run(
                'UPDATE user_sessions SET is_active = 0 WHERE session_token = ?',
                [uuidv4()], // This would need proper session token extraction
                () => {}
            );
        }
        
        // Log logout
        await auth.logAudit(
            req.user.id, 
            'LOGOUT', 
            'user', 
            req.user.id, 
            null, 
            { logout_time: new Date().toISOString() }, 
            req
        );
        
        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Logout failed' 
        });
    }
});

// Get current user profile
router.get('/profile', auth.authenticate, async (req, res) => {
    try {
        const user = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    u.id, 
                    u.username, 
                    u.email, 
                    u.full_name, 
                    u.department,
                    u.last_login,
                    u.created_at,
                    r.name as role_name,
                    r.description as role_description
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = ? AND u.is_active = 1
            `, [req.user.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        const permissions = await auth.getUserPermissions(req.user.id);
        
        res.json({
            success: true,
            user: {
                ...user,
                permissions: permissions.map(p => ({
                    code: p.code,
                    can_view: p.can_view,
                    can_create: p.can_create,
                    can_edit: p.can_edit,
                    can_delete: p.can_delete,
                    can_approve: p.can_approve
                }))
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get profile' 
        });
    }
});

// Update user profile
router.put('/profile', auth.authenticate, async (req, res) => {
    try {
        const { full_name, email, department } = req.body;
        const userId = req.user.id;
        
        // Get current user data
        const currentUser = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Update user
        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE users 
                SET full_name = ?, email = ?, department = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [full_name, email, department, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
        
        // Log the update
        await auth.logAudit(
            userId, 
            'UPDATE_PROFILE', 
            'user', 
            userId, 
            { 
                full_name: currentUser.full_name, 
                email: currentUser.email, 
                department: currentUser.department 
            }, 
            { full_name, email, department }, 
            req
        );
        
        res.json({ 
            success: true, 
            message: 'Profile updated successfully' 
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update profile' 
        });
    }
});

// Change password
router.post('/change-password', auth.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user.id;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Current and new passwords are required' 
            });
        }
        
        if (newPassword.length < 8) {
            return res.status(400).json({ 
                success: false, 
                error: 'New password must be at least 8 characters long' 
            });
        }
        
        // Get current password hash
        const user = await new Promise((resolve, reject) => {
            db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Verify current password
        const isValid = await auth.verifyPassword(currentPassword, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ 
                success: false, 
                error: 'Current password is incorrect' 
            });
        }
        
        // Hash new password
        const newHash = await auth.hashPassword(newPassword);
        
        // Update password
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [newHash, userId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
        
        // Log password change
        await auth.logAudit(
            userId, 
            'CHANGE_PASSWORD', 
            'user', 
            userId, 
            null, 
            { password_changed: true }, 
            req
        );
        
        res.json({ 
            success: true, 
            message: 'Password changed successfully' 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to change password' 
        });
    }
});

// Get all users (Admin only)
router.get('/users', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.USER_MANAGEMENT.VIEW, 'view'),
    async (req, res) => {
        try {
            const { page = 1, limit = 20, search = '', role = '' } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `
                SELECT 
                    u.id, 
                    u.username, 
                    u.email, 
                    u.full_name, 
                    u.department,
                    u.is_active,
                    u.last_login,
                    u.created_at,
                    r.name as role_name,
                    r.id as role_id
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (search) {
                query += ` AND (
                    u.username LIKE ? OR 
                    u.email LIKE ? OR 
                    u.full_name LIKE ?
                )`;
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam);
            }
            
            if (role) {
                query += ` AND r.name = ?`;
                params.push(role);
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT u.id, u.username, u.email, u.full_name, u.department, u.is_active, u.last_login, u.created_at, r.name as role_name, r.id as role_id',
                'SELECT COUNT(*) as total'
            );
            
            const totalResult = await new Promise((resolve, reject) => {
                db.get(countQuery, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            // Get paginated results
            query += ` ORDER BY u.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const users = await new Promise((resolve, reject) => {
                db.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            res.json({
                success: true,
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalResult.total,
                    pages: Math.ceil(totalResult.total / limit)
                }
            });
        } catch (error) {
            console.error('Get users error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get users' 
            });
        }
    }
);

// Get user by ID
router.get('/users/:id', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.USER_MANAGEMENT.VIEW, 'view'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            
            const user = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        u.*,
                        r.name as role_name,
                        r.description as role_description
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    WHERE u.id = ?
                `, [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }
            
            const permissions = await auth.getUserPermissions(userId);
            
            res.json({
                success: true,
                user: {
                    ...user,
                    permissions: permissions.map(p => ({
                        code: p.code,
                        can_view: p.can_view,
                        can_create: p.can_create,
                        can_edit: p.can_edit,
                        can_delete: p.can_delete,
                        can_approve: p.can_approve
                    }))
                }
            });
        } catch (error) {
            console.error('Get user error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get user' 
            });
        }
    }
);

// Create new user (Admin only)
router.post('/users', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.USER_MANAGEMENT.CREATE, 'create'),
    async (req, res) => {
        try {
            const { username, email, password, full_name, role_id, department } = req.body;
            
            if (!username || !email || !password || !full_name || !role_id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'All required fields must be provided' 
                });
            }
            
            if (password.length < 8) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Password must be at least 8 characters long' 
                });
            }
            
            // Check if username or email already exists
            const existingUser = await new Promise((resolve, reject) => {
                db.get(
                    'SELECT id FROM users WHERE username = ? OR email = ?',
                    [username, email],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });
            
            if (existingUser) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Username or email already exists' 
                });
            }
            
            // Hash password
            const passwordHash = await auth.hashPassword(password);
            
            // Insert user
            const result = await new Promise((resolve, reject) => {
                db.run(`
                    INSERT INTO users 
                    (username, email, password_hash, full_name, role_id, department, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, 1)
                `, [username, email, passwordHash, full_name, role_id, department || null], 
                function(err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
            
            // Log creation
            await auth.logAudit(
                req.user.id, 
                'CREATE_USER', 
                'user', 
                result.lastID, 
                null, 
                { username, email, full_name, role_id, department }, 
                req
            );
            
            res.status(201).json({ 
                success: true, 
                message: 'User created successfully',
                user_id: result.lastID
            });
        } catch (error) {
            console.error('Create user error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to create user' 
            });
        }
    }
);

// Update user (Admin only)
router.put('/users/:id', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.USER_MANAGEMENT.EDIT, 'edit'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { full_name, email, role_id, department, is_active } = req.body;
            
            // Get current user data
            const currentUser = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!currentUser) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'User not found' 
                });
            }
            
            // Update user
            await new Promise((resolve, reject) => {
                db.run(`
                    UPDATE users 
                    SET full_name = ?, email = ?, role_id = ?, department = ?, 
                        is_active = ?, updated_at = CURRENT_TIMESTAMP 
                    WHERE id = ?
                `, [full_name, email, role_id, department || null, is_active, userId], 
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
            });
            
            // Log update
            await auth.logAudit(
                req.user.id, 
                'UPDATE_USER', 
                'user', 
                userId, 
                {
                    full_name: currentUser.full_name,
                    email: currentUser.email,
                    role_id: currentUser.role_id,
                    department: currentUser.department,
                    is_active: currentUser.is_active
                }, 
                { full_name, email, role_id, department, is_active }, 
                req
            );
            
            res.json({ 
                success: true, 
                message: 'User updated successfully' 
            });
        } catch (error) {
            console.error('Update user error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to update user' 
            });
        }
    }
);

// Get all roles
router.get('/roles', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.ROLE_MANAGEMENT.VIEW, 'view'),
    async (req, res) => {
        try {
            const roles = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        r.*,
                        COUNT(u.id) as user_count
                    FROM roles r
                    LEFT JOIN users u ON r.id = u.role_id AND u.is_active = 1
                    GROUP BY r.id
                    ORDER BY r.is_system_role DESC, r.name
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            res.json({ success: true, roles });
        } catch (error) {
            console.error('Get roles error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get roles' 
            });
        }
    }
);

// Get role by ID with permissions
router.get('/roles/:id', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.ROLE_MANAGEMENT.VIEW, 'view'),
    async (req, res) => {
        try {
            const roleId = req.params.id;
            
            // Get role info
            const role = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM roles WHERE id = ?', [roleId], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            if (!role) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Role not found' 
                });
            }
            
            // Get role permissions
            const permissions = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT 
                        p.*,
                        rp.can_view,
                        rp.can_create,
                        rp.can_edit,
                        rp.can_delete,
                        rp.can_approve
                    FROM role_permissions rp
                    JOIN permissions p ON rp.permission_id = p.id
                    WHERE rp.role_id = ?
                    ORDER BY p.category, p.name
                `, [roleId], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            res.json({ 
                success: true, 
                role: {
                    ...role,
                    permissions
                }
            });
        } catch (error) {
            console.error('Get role error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get role' 
            });
        }
    }
);

// Get all permissions
router.get('/permissions', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.ROLE_MANAGEMENT.VIEW, 'view'),
    async (req, res) => {
        try {
            const permissions = await new Promise((resolve, reject) => {
                db.all(`
                    SELECT * FROM permissions 
                    ORDER BY category, name
                `, [], (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            // Group by category
            const grouped = {};
            permissions.forEach(perm => {
                if (!grouped[perm.category]) {
                    grouped[perm.category] = [];
                }
                grouped[perm.category].push(perm);
            });
            
            res.json({ success: true, permissions: grouped });
        } catch (error) {
            console.error('Get permissions error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get permissions' 
            });
        }
    }
);

// Get user activity logs
router.get('/activity-logs', 
    auth.authenticate, 
    auth.checkPermission(PERMISSIONS.SETTINGS.VIEW, 'view'),
    async (req, res) => {
        try {
            const { page = 1, limit = 50, startDate, endDate, userId, action } = req.query;
            const offset = (page - 1) * limit;
            
            let query = `
                SELECT 
                    a.*,
                    u.username,
                    u.full_name
                FROM audit_log a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (startDate) {
                query += ` AND DATE(a.timestamp) >= ?`;
                params.push(startDate);
            }
            
            if (endDate) {
                query += ` AND DATE(a.timestamp) <= ?`;
                params.push(endDate);
            }
            
            if (userId) {
                query += ` AND a.user_id = ?`;
                params.push(userId);
            }
            
            if (action) {
                query += ` AND a.action = ?`;
                params.push(action);
            }
            
            // Get total count
            const countQuery = query.replace(
                'SELECT a.*, u.username, u.full_name',
                'SELECT COUNT(*) as total'
            );
            
            const totalResult = await new Promise((resolve, reject) => {
                db.get(countQuery, params, (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            // Get paginated results
            query += ` ORDER BY a.timestamp DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);
            
            const logs = await new Promise((resolve, reject) => {
                db.all(query, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            res.json({
                success: true,
                logs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalResult.total,
                    pages: Math.ceil(totalResult.total / limit)
                }
            });
        } catch (error) {
            console.error('Get activity logs error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get activity logs' 
            });
        }
    }
);

// Get system stats (for admin dashboard)
router.get('/system-stats', 
    auth.authenticate, 
    auth.requireRole(['Super Administrator', 'Administrator']),
    async (req, res) => {
        try {
            const stats = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        (SELECT COUNT(*) FROM users WHERE is_active = 1) as active_users,
                        (SELECT COUNT(*) FROM user_sessions WHERE is_active = 1 AND expires_at > datetime('now')) as active_sessions,
                        (SELECT COUNT(*) FROM audit_log WHERE DATE(timestamp) = DATE('now')) as today_actions,
                        (SELECT COUNT(*) FROM roles) as total_roles,
                        (SELECT COUNT(*) FROM users WHERE DATE(created_at) = DATE('now')) as new_users_today
                `, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
            
            res.json({ success: true, stats });
        } catch (error) {
            console.error('Get system stats error:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get system stats' 
            });
        }
    }
);

// Validate token (for frontend token validation)
router.get('/validate-token', auth.authenticate, async (req, res) => {
    try {
        const permissions = await auth.getUserPermissions(req.user.id);
        
        res.json({
            success: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role,
                role_id: req.user.role_id,
                permissions: permissions.map(p => ({
                    code: p.code,
                    can_view: p.can_view,
                    can_create: p.can_create,
                    can_edit: p.can_edit,
                    can_delete: p.can_delete,
                    can_approve: p.can_approve
                }))
            },
            valid: true
        });
    } catch (error) {
        console.error('Validate token error:', error);
        res.status(401).json({ 
            success: false, 
            valid: false, 
            error: 'Invalid token' 
        });
    }
});

module.exports = router;