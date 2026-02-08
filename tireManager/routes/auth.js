const express = require('express');
const router = express.Router();
const AuthMiddleware = require('../middleware/auth-middleware');

// Initialize auth middleware
const db = require('../config/database');
const auth = new AuthMiddleware(db);

// =============== AUTHENTICATION ROUTES ===============

// User login
router.post('/login', async (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;
        
        // Input validation
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Username and password are required',
                code: 'MISSING_CREDENTIALS'
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
            // Log failed login attempt
            await auth.logAudit(
                null, 
                'LOGIN_FAILED', 
                'AUTH', 
                null, 
                null, 
                { 
                    username, 
                    reason: 'User not found',
                    ip: req.ip 
                }, 
                req
            );
            
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Verify password
        const isValid = await auth.verifyPassword(password, user.password_hash);
        if (!isValid) {
            // Log failed login attempt
            await auth.logAudit(
                user.id, 
                'LOGIN_FAILED', 
                'AUTH', 
                user.id, 
                null, 
                { 
                    username, 
                    reason: 'Invalid password',
                    ip: req.ip 
                }, 
                req
            );
            
            return res.status(401).json({ 
                success: false, 
                error: 'Invalid username or password',
                code: 'INVALID_CREDENTIALS'
            });
        }
        
        // Get user permissions
        const permissions = await auth.getUserPermissions(user.id);
        
        // Generate token
        const token = await auth.generateToken(user);
        
        // Generate refresh token if rememberMe is enabled
        let refreshToken = null;
        if (rememberMe) {
            refreshToken = auth.generateRefreshToken(user.id);
        }
        
        // Create session
        const session = await auth.createSession(
            user.id, 
            req.headers['user-agent'], 
            req.ip
        );
        
        // Update last login
        await auth.updateLastLogin(user.id);
        
        // Log successful login
        await auth.logAudit(
            user.id, 
            'LOGIN_SUCCESS', 
            'AUTH', 
            user.id, 
            null, 
            { 
                session_id: session.sessionId,
                device: req.headers['user-agent'],
                remember_me: rememberMe || false 
            }, 
            req
        );
        
        // Set cookie options
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
        };
        
        // Set auth cookie
        res.cookie('auth_token', token, {
            ...cookieOptions,
            maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
        });
        
        // Set refresh token cookie if rememberMe
        if (refreshToken) {
            res.cookie('refresh_token', refreshToken, {
                ...cookieOptions,
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                path: '/api/auth/refresh' // Only accessible to refresh endpoint
            });
        }
        
        // Prepare permission map for frontend
        const permissionMap = {};
        permissions.forEach(perm => {
            permissionMap[perm.code] = {
                can_view: perm.can_view === 1,
                can_create: perm.can_create === 1,
                can_edit: perm.can_edit === 1,
                can_delete: perm.can_delete === 1,
                can_approve: perm.can_approve === 1
            };
        });
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role_name,
                role_id: user.role_id,
                department: user.department,
                last_login: user.last_login,
                created_at: user.created_at
            },
            permissions: permissionMap,
            session: {
                id: session.sessionId,
                expires_at: session.expiresAt
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        
        // Log the error
        await auth.logAudit(
            null, 
            'LOGIN_ERROR', 
            'AUTH', 
            null, 
            null, 
            { 
                error: error.message,
                stack: error.stack 
            }, 
            req
        );
        
        res.status(500).json({ 
            success: false, 
            error: 'Login failed. Please try again.',
            code: 'LOGIN_FAILED'
        });
    }
});

// Refresh token endpoint
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token || req.body.refreshToken;
        
        if (!refreshToken) {
            return res.status(400).json({ 
                success: false, 
                error: 'Refresh token required',
                code: 'MISSING_REFRESH_TOKEN'
            });
        }
        
        const tokens = await auth.refreshAccessToken(refreshToken);
        
        // Set new auth cookie
        res.cookie('auth_token', tokens.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        res.json({
            success: true,
            token: tokens.accessToken,
            expiresIn: tokens.expiresIn
        });
        
    } catch (error) {
        console.error('Token refresh error:', error);
        
        // Clear invalid tokens
        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');
        
        res.status(401).json({ 
            success: false, 
            error: 'Session expired. Please login again.',
            code: 'SESSION_EXPIRED'
        });
    }
});

// User logout
router.post('/logout', auth.authenticate, async (req, res) => {
    try {
        const token = auth.extractToken(req);
        
        // Invalidate the specific session
        if (token) {
            await auth.invalidateSession(token);
        }
        
        // Log logout
        await auth.logAudit(
            req.user.id,
            'LOGOUT',
            'AUTH',
            req.user.id,
            null,
            { 
                logout_time: new Date().toISOString(),
                session_invalidated: true 
            },
            req
        );

        // Clear cookies
        const clearOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        };
        
        res.clearCookie('auth_token', clearOptions);
        res.clearCookie('refresh_token', { ...clearOptions, path: '/api/auth/refresh' });

        res.json({
            success: true,
            message: 'Logged out successfully'
        });

    } catch (error) {
        console.error('Logout error:', error);
        
        // Still try to clear cookies on error
        res.clearCookie('auth_token');
        res.clearCookie('refresh_token');
        
        res.status(500).json({
            success: false,
            error: 'Logout failed',
            code: 'LOGOUT_FAILED'
        });
    }
});

// =============== USER PROFILE ROUTES ===============

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
                    u.updated_at,
                    r.name as role_name,
                    r.description as role_description,
                    r.is_system_role
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
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }
        
        const permissions = await auth.getUserPermissions(req.user.id);
        
        // Create permission map
        const permissionMap = {};
        permissions.forEach(perm => {
            permissionMap[perm.code] = {
                can_view: perm.can_view === 1,
                can_create: perm.can_create === 1,
                can_edit: perm.can_edit === 1,
                can_delete: perm.can_delete === 1,
                can_approve: perm.can_approve === 1
            };
        });
        
        res.json({
            success: true,
            user: {
                ...user,
                permissions: permissionMap
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get profile',
            code: 'PROFILE_FETCH_ERROR'
        });
    }
});

// Update user profile
router.put('/profile', auth.authenticate, async (req, res) => {
    try {
        const { full_name, email, department } = req.body;
        const userId = req.user.id;
        
        // Validation
        if (!full_name || !email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Full name and email are required',
                code: 'MISSING_FIELDS'
            });
        }
        
        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid email format',
                code: 'INVALID_EMAIL'
            });
        }
        
        // Check if email already exists (excluding current user)
        const emailExists = await new Promise((resolve, reject) => {
            db.get(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, userId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
        
        if (emailExists) {
            return res.status(400).json({ 
                success: false, 
                error: 'Email already in use by another account',
                code: 'EMAIL_EXISTS'
            });
        }
        
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
            `, [full_name, email, department || null, userId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
        
        // Log the update
        await auth.logAudit(
            userId, 
            'UPDATE_PROFILE', 
            'USER', 
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
            error: 'Failed to update profile',
            code: 'PROFILE_UPDATE_ERROR'
        });
    }
});

// Change password
router.post('/change-password', auth.authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.id;
        
        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'All password fields are required',
                code: 'MISSING_PASSWORD_FIELDS'
            });
        }
        
        if (newPassword !== confirmPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'New password and confirmation do not match',
                code: 'PASSWORD_MISMATCH'
            });
        }
        
        // Password strength validation
        const strengthCheck = auth.validatePasswordStrength(newPassword);
        if (!strengthCheck.valid) {
            return res.status(400).json({ 
                success: false, 
                error: strengthCheck.message,
                code: 'WEAK_PASSWORD'
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
                error: 'Current password is incorrect',
                code: 'INCORRECT_CURRENT_PASSWORD'
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
        
        // Invalidate all other sessions for security
        await auth.invalidateAllUserSessions(userId);
        
        // Log password change
        await auth.logAudit(
            userId, 
            'CHANGE_PASSWORD', 
            'USER', 
            userId, 
            null, 
            { 
                password_changed: true,
                sessions_invalidated: true 
            }, 
            req
        );
        
        res.json({ 
            success: true, 
            message: 'Password changed successfully. Please login again.' 
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to change password',
            code: 'PASSWORD_CHANGE_ERROR'
        });
    }
});

// Validate token (for frontend token validation)
router.get('/validate-token', auth.authenticate, async (req, res) => {
    try {
        const permissions = await auth.getUserPermissions(req.user.id);
        
        // Create permission map
        const permissionMap = {};
        permissions.forEach(perm => {
            permissionMap[perm.code] = {
                can_view: perm.can_view === 1,
                can_create: perm.can_create === 1,
                can_edit: perm.can_edit === 1,
                can_delete: perm.can_delete === 1,
                can_approve: perm.can_approve === 1
            };
        });
        
        res.json({
            success: true,
            user: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                full_name: req.user.full_name,
                role: req.user.role,
                role_id: req.user.role_id,
                department: req.user.department
            },
            permissions: permissionMap,
            valid: true
        });
    } catch (error) {
        console.error('Validate token error:', error);
        res.status(401).json({ 
            success: false, 
            valid: false, 
            error: 'Invalid token',
            code: 'INVALID_TOKEN'
        });
    }
});

// =============== UTILITY ROUTES ===============

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Authentication Service',
        version: '1.0.0'
    });
});

// Get server info (public endpoint)
router.get('/info', (req, res) => {
    res.json({
        success: true,
        service: 'Tire Management System Authentication',
        version: '1.0.0',
        requires_authentication: true,
        available_endpoints: [
            'POST /api/auth/login',
            'POST /api/auth/refresh',
            'POST /api/auth/logout',
            'GET /api/auth/profile',
            'PUT /api/auth/profile',
            'POST /api/auth/change-password',
            'GET /api/auth/validate-token'
        ],
        authentication_methods: ['JWT Token', 'Cookie']
    });
});

module.exports = router;