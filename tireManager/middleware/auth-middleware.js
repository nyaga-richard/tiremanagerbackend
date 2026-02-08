// auth-middleware.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
require("dotenv").config();

class AuthMiddleware {
    constructor(db, jwtSecret = process.env.JWT_SECRET) {
        this.db = db;
        this.jwtSecret = jwtSecret || 'your-secret-key-change-in-production';
        this.tokenExpiry = '24h';
        this.refreshTokenExpiry = '7d';
    }

    // =============== PASSWORD MANAGEMENT ===============

    // Hash password
    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    // Verify password
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    // Validate password strength
    validatePasswordStrength(password) {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength) {
            return { 
                valid: false, 
                message: `Password must be at least ${minLength} characters long` 
            };
        }
        if (!hasUpperCase) {
            return { 
                valid: false, 
                message: 'Password must contain at least one uppercase letter' 
            };
        }
        if (!hasLowerCase) {
            return { 
                valid: false, 
                message: 'Password must contain at least one lowercase letter' 
            };
        }
        if (!hasNumbers) {
            return { 
                valid: false, 
                message: 'Password must contain at least one number' 
            };
        }
        if (!hasSpecialChar) {
            return { 
                valid: false, 
                message: 'Password must contain at least one special character' 
            };
        }
        
        return { valid: true, message: 'Password is strong' };
    }

    // =============== TOKEN MANAGEMENT ===============

    // Generate JWT token with enhanced user info
    async generateToken(user) {
        try {
            // Get user's permissions
            const permissions = await this.getUserPermissions(user.id);
            
            // Create permission map for quick access
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

            const tokenData = {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role_name,
                role_id: user.role_id,
                department: user.department,
                permissions: permissionMap,
                iat: Math.floor(Date.now() / 1000)
            };

            return jwt.sign(tokenData, this.jwtSecret, { expiresIn: this.tokenExpiry });
        } catch (error) {
            console.error('Error generating token:', error);
            throw new Error('Failed to generate authentication token');
        }
    }

    // Generate refresh token
    generateRefreshToken(userId) {
        return jwt.sign(
            { id: userId, type: 'refresh' },
            this.jwtSecret,
            { expiresIn: this.refreshTokenExpiry }
        );
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                throw new Error('Token has expired');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new Error('Invalid token');
            }
            throw error;
        }
    }

    // Refresh access token
    async refreshAccessToken(refreshToken) {
        try {
            const decoded = this.verifyToken(refreshToken);
            
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid refresh token');
            }

            // Get fresh user data from database
            const user = await this.getUserById(decoded.id);
            if (!user || !user.is_active) {
                throw new Error('User not found or inactive');
            }

            // Generate new tokens
            const newAccessToken = await this.generateToken(user);
            const newRefreshToken = this.generateRefreshToken(user.id);

            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                expiresIn: this.tokenExpiry
            };
        } catch (error) {
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }

    // =============== AUTHENTICATION MIDDLEWARE ===============

    // Main authentication middleware
    authenticate = (req, res, next) => {
        const token = this.extractToken(req);

        if (!token) {
            return res.status(401).json({ 
                error: "Authentication required",
                code: "NO_TOKEN"
            });
        }

        try {
            const decoded = this.verifyToken(token);
            req.user = decoded;
            
            // Add user info to response locals for logging
            res.locals.user = {
                id: decoded.id,
                username: decoded.username,
                role: decoded.role
            };
            
            next();
        } catch (error) {
            if (error.message === 'Token has expired') {
                return res.status(401).json({ 
                    error: "Session expired. Please login again.",
                    code: "TOKEN_EXPIRED"
                });
            }
            return res.status(401).json({ 
                error: "Invalid authentication token",
                code: "INVALID_TOKEN"
            });
        }
    };

    // Extract token from request
    extractToken(req) {
        return req.cookies?.auth_token ||
               req.header("Authorization")?.replace("Bearer ", "") ||
               req.query?.token;
    }

    // =============== PERMISSION MANAGEMENT ===============

    // Get user permissions from database
    async getUserPermissions(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    p.code,
                    MAX(rp.can_view) as can_view,
                    MAX(rp.can_create) as can_create,
                    MAX(rp.can_edit) as can_edit,
                    MAX(rp.can_delete) as can_delete,
                    MAX(rp.can_approve) as can_approve
                FROM users u
                JOIN roles r ON u.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = ? AND u.is_active = 1
                GROUP BY p.code
                ORDER BY p.category, p.name
            `;

            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    console.error('Database error in getUserPermissions:', err);
                    reject(new Error('Failed to retrieve user permissions'));
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Check if user has specific permission
    async checkUserPermission(userId, permissionCode, action = 'view') {
        try {
            const permissions = await this.getUserPermissions(userId);
            const permission = permissions.find(p => p.code === permissionCode);
            
            if (!permission) {
                return { 
                    hasPermission: false, 
                    reason: `Permission '${permissionCode}' not found for user` 
                };
            }

            const actionMap = {
                'view': 'can_view',
                'create': 'can_create',
                'edit': 'can_edit',
                'delete': 'can_delete',
                'approve': 'can_approve'
            };

            const actionField = actionMap[action.toLowerCase()];
            if (!actionField) {
                return { 
                    hasPermission: false, 
                    reason: `Invalid action '${action}'` 
                };
            }

            const hasAccess = permission[actionField] === 1;
            
            return { 
                hasPermission: hasAccess,
                permission: {
                    code: permission.code,
                    can_view: permission.can_view === 1,
                    can_create: permission.can_create === 1,
                    can_edit: permission.can_edit === 1,
                    can_delete: permission.can_delete === 1,
                    can_approve: permission.can_approve === 1
                }
            };
        } catch (error) {
            console.error('Error checking user permission:', error);
            return { 
                hasPermission: false, 
                reason: 'Error checking permissions',
                error: error.message 
            };
        }
    }

    // Permission middleware factory
    checkPermission(permissionCode, requiredAction = 'view') {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return res.status(401).json({ 
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                const result = await this.checkUserPermission(
                    req.user.id, 
                    permissionCode, 
                    requiredAction
                );

                if (!result.hasPermission) {
                    // Log failed permission attempt
                    await this.logAudit(
                        req.user.id,
                        'PERMISSION_DENIED',
                        'AUTH',
                        null,
                        null,
                        { 
                            permission: permissionCode, 
                            action: requiredAction,
                            path: req.path,
                            method: req.method 
                        },
                        req
                    );

                    return res.status(403).json({ 
                        error: 'Insufficient permissions',
                        code: 'PERMISSION_DENIED',
                        required: `${permissionCode}.${requiredAction}`,
                        reason: result.reason
                    });
                }

                // Add permission info to request for downstream use
                req.permission = result.permission;
                
                next();
            } catch (error) {
                console.error('Permission middleware error:', error);
                res.status(500).json({ 
                    error: 'Internal server error while checking permissions',
                    code: 'PERMISSION_CHECK_ERROR'
                });
            }
        };
    }

    // Check any of multiple permissions
    checkAnyPermission(permissions, requiredAction = 'view') {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return res.status(401).json({ 
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                const userPermissions = await this.getUserPermissions(req.user.id);
                
                const hasAccess = permissions.some(permissionCode => {
                    const permission = userPermissions.find(p => p.code === permissionCode);
                    if (!permission) return false;
                    
                    const actionMap = {
                        'view': 'can_view',
                        'create': 'can_create',
                        'edit': 'can_edit',
                        'delete': 'can_delete',
                        'approve': 'can_approve'
                    };
                    
                    const actionField = actionMap[requiredAction.toLowerCase()];
                    return actionField && permission[actionField] === 1;
                });

                if (!hasAccess) {
                    // Log failed permission attempt
                    await this.logAudit(
                        req.user.id,
                        'PERMISSION_DENIED',
                        'AUTH',
                        null,
                        null,
                        { 
                            required_permissions: permissions,
                            action: requiredAction,
                            path: req.path,
                            method: req.method 
                        },
                        req
                    );

                    return res.status(403).json({ 
                        error: 'Insufficient permissions. At least one of the following is required:',
                        code: 'PERMISSION_DENIED',
                        required: permissions.map(p => `${p}.${requiredAction}`),
                        reason: 'None of the required permissions were granted'
                    });
                }

                next();
            } catch (error) {
                console.error('Permission middleware error:', error);
                res.status(500).json({ 
                    error: 'Internal server error while checking permissions',
                    code: 'PERMISSION_CHECK_ERROR'
                });
            }
        };
    }

    // Check all permissions
    checkAllPermissions(permissions, requiredAction = 'view') {
        return async (req, res, next) => {
            try {
                if (!req.user || !req.user.id) {
                    return res.status(401).json({ 
                        error: 'Authentication required',
                        code: 'AUTH_REQUIRED'
                    });
                }

                const userPermissions = await this.getUserPermissions(req.user.id);
                const missingPermissions = [];
                
                for (const permissionCode of permissions) {
                    const permission = userPermissions.find(p => p.code === permissionCode);
                    if (!permission) {
                        missingPermissions.push(`${permissionCode} (not granted)`);
                        continue;
                    }
                    
                    const actionMap = {
                        'view': 'can_view',
                        'create': 'can_create',
                        'edit': 'can_edit',
                        'delete': 'can_delete',
                        'approve': 'can_approve'
                    };
                    
                    const actionField = actionMap[requiredAction.toLowerCase()];
                    if (!actionField || permission[actionField] !== 1) {
                        missingPermissions.push(`${permissionCode}.${requiredAction}`);
                    }
                }

                if (missingPermissions.length > 0) {
                    // Log failed permission attempt
                    await this.logAudit(
                        req.user.id,
                        'PERMISSION_DENIED',
                        'AUTH',
                        null,
                        null,
                        { 
                            missing_permissions: missingPermissions,
                            required_action: requiredAction,
                            path: req.path,
                            method: req.method 
                        },
                        req
                    );

                    return res.status(403).json({ 
                        error: 'Insufficient permissions. All of the following are required:',
                        code: 'PERMISSION_DENIED',
                        missing: missingPermissions,
                        required: permissions.map(p => `${p}.${requiredAction}`)
                    });
                }

                next();
            } catch (error) {
                console.error('Permission middleware error:', error);
                res.status(500).json({ 
                    error: 'Internal server error while checking permissions',
                    code: 'PERMISSION_CHECK_ERROR'
                });
            }
        };
    }

    // =============== ROLE-BASED ACCESS CONTROL ===============

    // Require specific role(s)
    requireRole(roleNames) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }

            const requiredRoles = Array.isArray(roleNames) ? roleNames : [roleNames];
            const hasRole = requiredRoles.includes(req.user.role);

            if (!hasRole) {
                return res.status(403).json({ 
                    error: 'Insufficient role privileges',
                    code: 'ROLE_DENIED',
                    required: requiredRoles,
                    current: req.user.role
                });
            }

            next();
        };
    }

    // Exclude specific role(s)
    excludeRole(roleNames) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ 
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }

            const excludedRoles = Array.isArray(roleNames) ? roleNames : [roleNames];
            const isExcluded = excludedRoles.includes(req.user.role);

            if (isExcluded) {
                return res.status(403).json({ 
                    error: 'Role not allowed for this operation',
                    code: 'ROLE_EXCLUDED',
                    excluded: excludedRoles,
                    current: req.user.role
                });
            }

            next();
        };
    }

    // =============== SESSION MANAGEMENT ===============

    // Create user session
    async createSession(userId, deviceInfo = null, ipAddress = null) {
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO user_sessions 
                (user_id, session_token, device_info, ip_address, expires_at, is_active)
                VALUES (?, ?, ?, ?, ?, 1)
            `;

            this.db.run(query, 
                [userId, sessionToken, deviceInfo, ipAddress, expiresAt.toISOString()], 
                function(err) {
                    if (err) {
                        console.error('Error creating session:', err);
                        reject(new Error('Failed to create session'));
                    } else {
                        resolve({ 
                            sessionToken, 
                            expiresAt,
                            sessionId: this.lastID 
                        });
                    }
                }
            );
        });
    }

    // Validate session token
    async validateSession(sessionToken) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    us.*, 
                    u.id as user_id,
                    u.username,
                    u.email,
                    u.full_name,
                    u.role_id,
                    r.name as role_name,
                    u.department,
                    u.is_active as user_active
                FROM user_sessions us
                JOIN users u ON us.user_id = u.id
                JOIN roles r ON u.role_id = r.id
                WHERE us.session_token = ? 
                AND us.is_active = 1 
                AND datetime(us.expires_at) > datetime('now')
                AND u.is_active = 1
            `;

            this.db.get(query, [sessionToken], async (err, row) => {
                if (err) {
                    console.error('Error validating session:', err);
                    reject(new Error('Failed to validate session'));
                } else if (!row) {
                    resolve(null); // Session not found or expired
                } else {
                    // Get user permissions
                    const permissions = await this.getUserPermissions(row.user_id);
                    
                    // Format response
                    resolve({
                        user: {
                            id: row.user_id,
                            username: row.username,
                            email: row.email,
                            full_name: row.full_name,
                            role: row.role_name,
                            role_id: row.role_id,
                            department: row.department,
                            is_active: row.user_active === 1
                        },
                        session: {
                            id: row.id,
                            session_token: row.session_token,
                            device_info: row.device_info,
                            ip_address: row.ip_address,
                            expires_at: row.expires_at,
                            created_at: row.created_at
                        },
                        permissions
                    });
                }
            });
        });
    }

    // Invalidate session
    async invalidateSession(sessionToken) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE user_sessions 
                SET is_active = 0 
                WHERE session_token = ? AND is_active = 1
            `;

            this.db.run(query, [sessionToken], function(err) {
                if (err) {
                    console.error('Error invalidating session:', err);
                    reject(new Error('Failed to invalidate session'));
                } else {
                    resolve({ 
                        success: true, 
                        changes: this.changes 
                    });
                }
            });
        });
    }

    // Invalidate all user sessions
    async invalidateAllUserSessions(userId, exceptSessionToken = null) {
        return new Promise((resolve, reject) => {
            let query = `
                UPDATE user_sessions 
                SET is_active = 0 
                WHERE user_id = ? AND is_active = 1
            `;
            
            const params = [userId];
            
            if (exceptSessionToken) {
                query += ' AND session_token != ?';
                params.push(exceptSessionToken);
            }

            this.db.run(query, params, function(err) {
                if (err) {
                    console.error('Error invalidating user sessions:', err);
                    reject(new Error('Failed to invalidate user sessions'));
                } else {
                    resolve({ 
                        success: true, 
                        sessionsInvalidated: this.changes 
                    });
                }
            });
        });
    }

    // =============== AUDIT LOGGING ===============

    // Log user action
    async logAudit(userId, action, entityType, entityId, oldValues = null, newValues = null, req = null) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO audit_log 
                (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const ip = req?.ip || 
                      req?.connection?.remoteAddress || 
                      req?.headers['x-forwarded-for'] || 
                      'unknown';
            const userAgent = req?.headers['user-agent'] || 'unknown';

            this.db.run(query, 
                [
                    userId, 
                    action, 
                    entityType, 
                    entityId,
                    oldValues ? JSON.stringify(oldValues) : null,
                    newValues ? JSON.stringify(newValues) : null,
                    ip,
                    userAgent
                ], 
                function(err) {
                    if (err) {
                        console.error('Error logging audit:', err);
                        // Don't reject here as audit logging shouldn't break the main flow
                        resolve(null);
                    } else {
                        resolve(this.lastID);
                    }
                }
            );
        });
    }

    // =============== USER MANAGEMENT HELPERS ===============

    // Get user by ID
    async getUserById(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    u.*,
                    r.name as role_name,
                    r.description as role_description
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = ? AND u.is_active = 1
            `;

            this.db.get(query, [userId], (err, row) => {
                if (err) {
                    console.error('Error getting user:', err);
                    reject(new Error('Failed to retrieve user'));
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Get user by username or email
    async getUserByUsernameOrEmail(identifier) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    u.*,
                    r.name as role_name
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1
            `;

            this.db.get(query, [identifier, identifier], (err, row) => {
                if (err) {
                    console.error('Error getting user:', err);
                    reject(new Error('Failed to retrieve user'));
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Update user last login
    async updateLastLogin(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                UPDATE users 
                SET last_login = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;

            this.db.run(query, [userId], function(err) {
                if (err) {
                    console.error('Error updating last login:', err);
                    reject(new Error('Failed to update last login'));
                } else {
                    resolve({ success: true });
                }
            });
        });
    }

    // =============== RATE LIMITING ===============

    // Simple rate limiting middleware
    createRateLimiter(maxRequests, windowMinutes) {
        const requests = new Map();
        
        return (req, res, next) => {
            const key = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const windowMs = windowMinutes * 60 * 1000;
            
            if (!requests.has(key)) {
                requests.set(key, []);
            }
            
            const userRequests = requests.get(key);
            const windowStart = now - windowMs;
            
            // Remove old requests
            while (userRequests.length > 0 && userRequests[0] < windowStart) {
                userRequests.shift();
            }
            
            // Check if limit exceeded
            if (userRequests.length >= maxRequests) {
                // Log the rate limit hit
                this.logAudit(
                    req.user?.id || null,
                    'RATE_LIMIT_EXCEEDED',
                    'AUTH',
                    null,
                    null,
                    { 
                        ip: key,
                        path: req.path,
                        method: req.method,
                        requests: userRequests.length,
                        limit: maxRequests 
                    },
                    req
                );
                
                return res.status(429).json({
                    error: 'Too many requests',
                    code: 'RATE_LIMIT_EXCEEDED',
                    retryAfter: Math.ceil((userRequests[0] + windowMs - now) / 1000)
                });
            }
            
            // Add current request
            userRequests.push(now);
            
            // Cleanup old entries periodically
            if (Math.random() < 0.01) { // 1% chance to cleanup
                for (const [k, v] of requests) {
                    if (v.length === 0 || v[v.length - 1] < now - (windowMs * 2)) {
                        requests.delete(k);
                    }
                }
            }
            
            next();
        };
    }
}

module.exports = AuthMiddleware;