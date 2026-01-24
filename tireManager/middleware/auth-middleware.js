const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { PERMISSIONS } = require('../models/permissions');
require("dotenv").config();


class AuthMiddleware {
    constructor(db, jwtSecret = process.env.JWT_SECRET) {
        this.db = db;
        this.jwtSecret = jwtSecret;
        this.tokenExpiry = '24h';
    }

    // Hash password
    async hashPassword(password) {
        return bcrypt.hash(password, 10);
    }

    // Verify password
    async verifyPassword(password, hash) {
        return bcrypt.compare(password, hash);
    }

    // Generate JWT token
    generateToken(user) {
        return jwt.sign(
            {
                id: user.id,
                username: user.username,
                role: user.role_name,
                role_id: user.role_id,
                permissions: user.permissions || []
            },
            this.jwtSecret,
            { expiresIn: this.tokenExpiry }
        );
    }

    // Verify JWT token
    verifyToken(token) {
        try {
            return jwt.verify(token, this.jwtSecret);
        } catch (error) {
            return null;
        }
    }

    // Authentication middleware
    authenticate = (req, res, next) => {
        const token =
            req.cookies?.auth_token ||
            req.header("Authorization")?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({ error: "Access denied. No token provided." });
        }

        const decoded = this.verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: "Invalid token." });
        }

        req.user = decoded;
        next();
    };


    // Get user permissions
    async getUserPermissions(userId) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    p.code,
                    rp.can_view,
                    rp.can_create,
                    rp.can_edit,
                    rp.can_delete,
                    rp.can_approve
                FROM users u
                JOIN roles r ON u.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = ? AND u.is_active = 1
            `;

            this.db.all(query, [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Check permission middleware factory
    checkPermission(permissionCode, requiredAction = 'view') {
        return async (req, res, next) => {
            try {
                const permissions = await this.getUserPermissions(req.user.id);
                const permission = permissions.find(p => p.code === permissionCode);
                
                if (!permission) {
                    return res.status(403).json({ error: 'Permission denied.' });
                }

                const hasAccess = permission[`can_${requiredAction}`] === 1;
                if (!hasAccess) {
                    return res.status(403).json({ error: 'Insufficient permissions for this action.' });
                }

                next();
            } catch (error) {
                res.status(500).json({ error: 'Error checking permissions.' });
            }
        };
    }

    // Check multiple permissions
    checkAnyPermission(permissions, requiredAction = 'view') {
        return async (req, res, next) => {
            try {
                const userPermissions = await this.getUserPermissions(req.user.id);
                
                const hasAccess = permissions.some(permissionCode => {
                    const permission = userPermissions.find(p => p.code === permissionCode);
                    return permission && permission[`can_${requiredAction}`] === 1;
                });

                if (!hasAccess) {
                    return res.status(403).json({ error: 'Insufficient permissions.' });
                }

                next();
            } catch (error) {
                res.status(500).json({ error: 'Error checking permissions.' });
            }
        };
    }

    // Role-based access control
    requireRole(roleNames) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({ error: 'Authentication required.' });
            }

            if (Array.isArray(roleNames)) {
                if (!roleNames.includes(req.user.role)) {
                    return res.status(403).json({ error: 'Insufficient role privileges.' });
                }
            } else if (req.user.role !== roleNames) {
                return res.status(403).json({ error: 'Insufficient role privileges.' });
            }

            next();
        };
    }

    // Log user action
    async logAudit(userId, action, entityType, entityId, oldValues = null, newValues = null, req = null) {
        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO audit_log 
                (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const ip = req?.ip || req?.connection?.remoteAddress;
            const userAgent = req?.headers['user-agent'];

            this.db.run(query, [userId, action, entityType, entityId, 
                JSON.stringify(oldValues), JSON.stringify(newValues), ip, userAgent], 
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    // Create session
    async createSession(userId, deviceInfo = null, ipAddress = null) {
        const sessionToken = uuidv4();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        return new Promise((resolve, reject) => {
            const query = `
                INSERT INTO user_sessions 
                (user_id, session_token, device_info, ip_address, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `;

            this.db.run(query, [userId, sessionToken, deviceInfo, ipAddress, expiresAt.toISOString()], 
                function(err) {
                    if (err) reject(err);
                    else resolve({ sessionToken, expiresAt });
                }
            );
        });
    }

    // Validate session
    async validateSession(sessionToken) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT us.*, u.* 
                FROM user_sessions us
                JOIN users u ON us.user_id = u.id
                WHERE us.session_token = ? 
                AND us.is_active = 1 
                AND us.expires_at > datetime('now')
                AND u.is_active = 1
            `;

            this.db.get(query, [sessionToken], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = AuthMiddleware;