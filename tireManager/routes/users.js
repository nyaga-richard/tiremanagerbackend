const express = require('express');
const router = express.Router();
const db = require('../config/database');
const bcrypt = require('bcrypt');
const AuthMiddleware = require('../middleware/auth-middleware');
const auth = new AuthMiddleware(db);

// Get all users with filtering and pagination
// Get all users with filtering and pagination
router.get('/', 
    auth.authenticate,
    auth.checkPermission('user.view', 'view'),
    async (req, res) => {
        try {
            const { 
                page = 1, 
                limit = 20, 
                search = '', 
                role = '', 
                status = '',
                sortBy = 'created_at',
                sortOrder = 'DESC' 
            } = req.query;
            
            const offset = (page - 1) * limit;
            const validSortColumns = ['username', 'email', 'full_name', 'created_at', 'last_login'];
            const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
            const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
            
            // Build base query conditions
            let conditions = [];
            let params = [];
            
            if (search) {
                conditions.push(`(
                    u.username LIKE ? OR 
                    u.email LIKE ? OR 
                    u.full_name LIKE ? OR
                    u.department LIKE ?
                )`);
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam, searchParam, searchParam);
            }
            
            if (role) {
                conditions.push(`r.id = ?`);
                params.push(role);
            }
            
            if (status !== '') {
                conditions.push(`u.is_active = ?`);
                params.push(status === 'active' ? 1 : 0);
            }
            
            // Build WHERE clause
            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
            
            // First, get total count with a proper COUNT query
            const countQuery = `
                SELECT COUNT(*) as total
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                ${whereClause}
            `;
            
            // Get total count
            db.get(countQuery, params, (err, totalResult) => {
                if (err) {
                    console.error('Error counting users:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to count users',
                        code: 'USER_COUNT_ERROR'
                    });
                }
                
                // If totalResult is undefined, set default to 0
                if (!totalResult) {
                    totalResult = { total: 0 };
                }
                
                // Now get paginated results
                const dataQuery = `
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
                    ${whereClause}
                    ORDER BY u.${sortColumn} ${order}
                    LIMIT ? OFFSET ?
                `;
                
                // Add pagination parameters
                const dataParams = [...params, parseInt(limit), offset];
                
                db.all(dataQuery, dataParams, (err, users) => {
                    if (err) {
                        console.error('Error fetching users:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to fetch users',
                            code: 'USER_FETCH_ERROR'
                        });
                    }
                    
                    res.json({
                        success: true,
                        users,
                        pagination: {
                            page: parseInt(page),
                            limit: parseInt(limit),
                            total: totalResult.total || 0,
                            pages: Math.ceil((totalResult.total || 0) / limit)
                        },
                        filters: {
                            search,
                            role,
                            status,
                            sortBy: sortColumn,
                            sortOrder: order
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Error in users endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get user by ID
router.get('/:id', 
    auth.authenticate,
    auth.checkPermission('user.view', 'view'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            
            db.get(`
                SELECT 
                    u.*,
                    r.name as role_name,
                    r.description as role_description,
                    r.is_system_role
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = ?
            `, [userId], (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user',
                        code: 'USER_FETCH_ERROR'
                    });
                }
                
                if (!user) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Get user permissions if requested
                if (req.query.include_permissions === 'true') {
                    db.all(`
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
                        WHERE u.id = ?
                    `, [userId], (err, permissions) => {
                        if (err) {
                            console.error('Error fetching user permissions:', err);
                        }
                        
                        const permissionMap = {};
                        if (permissions) {
                            permissions.forEach(perm => {
                                permissionMap[perm.code] = {
                                    can_view: perm.can_view === 1,
                                    can_create: perm.can_create === 1,
                                    can_edit: perm.can_edit === 1,
                                    can_delete: perm.can_delete === 1,
                                    can_approve: perm.can_approve === 1
                                };
                            });
                        }
                        
                        res.json({
                            success: true,
                            user: {
                                ...user,
                                permissions: permissionMap
                            }
                        });
                    });
                } else {
                    res.json({ success: true, user });
                }
            });
        } catch (error) {
            console.error('Error in user detail endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Create new user
router.post('/', 
    auth.authenticate,
    auth.checkPermission('user.create', 'create'),
    async (req, res) => {
        try {
            const { username, email, password, full_name, role_id, department } = req.body;
            
            // Validation
            if (!username || !email || !password || !full_name || !role_id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'All required fields must be provided',
                    code: 'MISSING_REQUIRED_FIELDS'
                });
            }
            
            // Password strength validation
            if (password.length < 8) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Password must be at least 8 characters long',
                    code: 'WEAK_PASSWORD'
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
            
            // Check if username or email already exists
            db.get(
                'SELECT id FROM users WHERE username = ? OR email = ?',
                [username, email],
                (err, existingUser) => {
                    if (err) {
                        console.error('Error checking existing user:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to check user existence',
                            code: 'USER_CHECK_ERROR'
                        });
                    }
                    
                    if (existingUser) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Username or email already exists',
                            code: 'DUPLICATE_USER'
                        });
                    }
                    
                    // Verify role exists
                    db.get('SELECT id FROM roles WHERE id = ?', [role_id], (err, roleExists) => {
                        if (err) {
                            console.error('Error checking role:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to verify role',
                                code: 'ROLE_CHECK_ERROR'
                            });
                        }
                        
                        if (!roleExists) {
                            return res.status(400).json({ 
                                success: false, 
                                error: 'Specified role does not exist',
                                code: 'INVALID_ROLE'
                            });
                        }
                        
                        // Hash password
                        bcrypt.hash(password, 10, (err, passwordHash) => {
                            if (err) {
                                console.error('Error hashing password:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to hash password',
                                    code: 'PASSWORD_HASH_ERROR'
                                });
                            }
                            
                            // Insert user
                            db.run(`
                                INSERT INTO users 
                                (username, email, password_hash, full_name, role_id, department, is_active)
                                VALUES (?, ?, ?, ?, ?, ?, 1)
                            `, [username, email, passwordHash, full_name, role_id, department || null], 
                            function(err) {
                                if (err) {
                                    console.error('Error creating user:', err);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to create user',
                                        code: 'USER_CREATION_ERROR'
                                    });
                                }
                                
                                // Log creation
                                auth.logAudit(
                                    req.user.id, 
                                    'CREATE_USER', 
                                    'USER', 
                                    this.lastID, 
                                    null, 
                                    { 
                                        username, 
                                        email, 
                                        full_name, 
                                        role_id, 
                                        department,
                                        created_by: req.user.username 
                                    }, 
                                    req
                                );
                                
                                // Get created user
                                db.get(`
                                    SELECT 
                                        u.*,
                                        r.name as role_name
                                    FROM users u
                                    LEFT JOIN roles r ON u.role_id = r.id
                                    WHERE u.id = ?
                                `, [this.lastID], (err, newUser) => {
                                    if (err) {
                                        console.error('Error fetching created user:', err);
                                    }
                                    
                                    res.status(201).json({ 
                                        success: true, 
                                        message: 'User created successfully',
                                        user_id: this.lastID,
                                        user: newUser
                                    });
                                });
                            });
                        });
                    });
                }
            );
        } catch (error) {
            console.error('Error in user creation endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Update user
router.put('/:id', 
    auth.authenticate,
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { full_name, email, role_id, department, is_active } = req.body;
            
            // Check if user is editing their own profile
            const isSelfEdit = parseInt(userId) === req.user.id;
            
            // If editing other users, require user.edit permission
            if (!isSelfEdit) {
                const canEditOthers = await auth.checkUserPermission(
                    req.user.id,
                    'user.edit',
                    'edit'
                );
                
                if (!canEditOthers.hasPermission) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'Insufficient permissions to edit other users',
                        code: 'PERMISSION_DENIED'
                    });
                }
            }
            
            // Validation for self-edits
            if (isSelfEdit && is_active !== undefined) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Cannot change your own active status',
                    code: 'SELF_STATUS_CHANGE'
                });
            }
            
            // Get current user data
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, currentUser) => {
                if (err) {
                    console.error('Error fetching current user:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user',
                        code: 'USER_FETCH_ERROR'
                    });
                }
                
                if (!currentUser) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Email validation if changing email
                if (email && email !== currentUser.email) {
                    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(email)) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Invalid email format',
                            code: 'INVALID_EMAIL'
                        });
                    }
                    
                    // Check if email already exists (excluding current user)
                    db.get(
                        'SELECT id FROM users WHERE email = ? AND id != ?',
                        [email, userId],
                        (err, emailExists) => {
                            if (err) {
                                console.error('Error checking email:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to check email',
                                    code: 'EMAIL_CHECK_ERROR'
                                });
                            }
                            
                            if (emailExists) {
                                return res.status(400).json({ 
                                    success: false, 
                                    error: 'Email already in use by another account',
                                    code: 'EMAIL_EXISTS'
                                });
                            }
                            
                            proceedWithUpdate();
                        }
                    );
                } else {
                    proceedWithUpdate();
                }
                
                function proceedWithUpdate() {
                    // Verify role exists if changing role
                    if (role_id && role_id !== currentUser.role_id) {
                        db.get('SELECT id FROM roles WHERE id = ?', [role_id], (err, roleExists) => {
                            if (err) {
                                console.error('Error checking role:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to verify role',
                                    code: 'ROLE_CHECK_ERROR'
                                });
                            }
                            
                            if (!roleExists) {
                                return res.status(400).json({ 
                                    success: false, 
                                    error: 'Specified role does not exist',
                                    code: 'INVALID_ROLE'
                                });
                            }
                            
                            updateUser();
                        });
                    } else {
                        updateUser();
                    }
                }
                
                function updateUser() {
                    const updates = [];
                    const params = [];
                    
                    if (full_name !== undefined) {
                        updates.push('full_name = ?');
                        params.push(full_name);
                    }
                    
                    if (email !== undefined) {
                        updates.push('email = ?');
                        params.push(email);
                    }
                    
                    if (role_id !== undefined) {
                        updates.push('role_id = ?');
                        params.push(role_id);
                    }
                    
                    if (department !== undefined) {
                        updates.push('department = ?');
                        params.push(department);
                    }
                    
                    if (is_active !== undefined) {
                        updates.push('is_active = ?');
                        params.push(is_active);
                    }
                    
                    updates.push('updated_at = CURRENT_TIMESTAMP');
                    params.push(userId);
                    
                    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
                    
                    db.run(query, params, function(err) {
                        if (err) {
                            console.error('Error updating user:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to update user',
                                code: 'USER_UPDATE_ERROR'
                            });
                        }
                        
                        // If user was deactivated, invalidate all their sessions
                        if (is_active === 0 && currentUser.is_active === 1) {
                            auth.invalidateAllUserSessions(userId)
                                .catch(err => console.error('Error invalidating sessions:', err));
                        }
                        
                        // Log update
                        auth.logAudit(
                            req.user.id, 
                            'UPDATE_USER', 
                            'USER', 
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
                        
                        // Get updated user
                        db.get(`
                            SELECT 
                                u.*,
                                r.name as role_name
                            FROM users u
                            LEFT JOIN roles r ON u.role_id = r.id
                            WHERE u.id = ?
                        `, [userId], (err, updatedUser) => {
                            if (err) {
                                console.error('Error fetching updated user:', err);
                            }
                            
                            res.json({ 
                                success: true, 
                                message: 'User updated successfully',
                                user: updatedUser
                            });
                        });
                    });
                }
            });
        } catch (error) {
            console.error('Error in user update endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Delete user
router.delete('/:id', 
    auth.authenticate,
    auth.checkPermission('user.delete', 'delete'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            
            // Prevent self-deletion
            if (parseInt(userId) === req.user.id) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Cannot delete your own account',
                    code: 'SELF_DELETION'
                });
            }
            
            // Get user info for logging
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user',
                        code: 'USER_FETCH_ERROR'
                    });
                }
                
                if (!user) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Start transaction
                db.run('BEGIN TRANSACTION', (err) => {
                    if (err) {
                        console.error('Error starting transaction:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to delete user',
                            code: 'TRANSACTION_ERROR'
                        });
                    }
                    
                    // Delete user sessions
                    db.run('DELETE FROM user_sessions WHERE user_id = ?', [userId], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            console.error('Error deleting user sessions:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to delete user sessions',
                                code: 'SESSION_DELETE_ERROR'
                            });
                        }
                        
                        // Delete user
                        db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error('Error deleting user:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to delete user',
                                    code: 'USER_DELETION_ERROR'
                                });
                            }
                            
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    console.error('Error committing transaction:', err);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to delete user',
                                        code: 'TRANSACTION_ERROR'
                                    });
                                }
                                
                                // Log deletion
                                auth.logAudit(
                                    req.user.id, 
                                    'DELETE_USER', 
                                    'USER', 
                                    userId, 
                                    { 
                                        username: user.username,
                                        email: user.email,
                                        full_name: user.full_name 
                                    }, 
                                    null, 
                                    req
                                );
                                
                                res.json({
                                    success: true,
                                    message: 'User deleted successfully'
                                });
                            });
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Error in user deletion endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Change user password
router.put('/:id/password', 
    auth.authenticate,
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { currentPassword, newPassword, confirmPassword } = req.body;
            
            // Check if user is changing their own password or has permission
            const isSelfEdit = parseInt(userId) === req.user.id;
            
            if (!isSelfEdit) {
                const canEditOthers = await auth.checkUserPermission(
                    req.user.id,
                    'user.edit',
                    'edit'
                );
                
                if (!canEditOthers.hasPermission) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'Insufficient permissions to change other users\' passwords',
                        code: 'PERMISSION_DENIED'
                    });
                }
            }
            
            // Validation
            if (!newPassword || !confirmPassword) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'New password and confirmation are required',
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
            
            if (newPassword.length < 8) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'New password must be at least 8 characters long',
                    code: 'WEAK_PASSWORD'
                });
            }
            
            // Get current password hash
            db.get('SELECT password_hash FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) {
                    console.error('Error fetching user:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user',
                        code: 'USER_FETCH_ERROR'
                    });
                }
                
                if (!user) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'User not found',
                        code: 'USER_NOT_FOUND'
                    });
                }
                
                // Verify current password if changing own password
                if (isSelfEdit) {
                    if (!currentPassword) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Current password is required',
                            code: 'MISSING_CURRENT_PASSWORD'
                        });
                    }
                    
                    bcrypt.compare(currentPassword, user.password_hash, (err, isValid) => {
                        if (err) {
                            console.error('Error verifying password:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to verify password',
                                code: 'PASSWORD_VERIFY_ERROR'
                            });
                        }
                        
                        if (!isValid) {
                            return res.status(401).json({ 
                                success: false, 
                                error: 'Current password is incorrect',
                                code: 'INCORRECT_PASSWORD'
                            });
                        }
                        
                        updatePassword();
                    });
                } else {
                    updatePassword();
                }
                
                function updatePassword() {
                    bcrypt.hash(newPassword, 10, (err, newHash) => {
                        if (err) {
                            console.error('Error hashing password:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to hash password',
                                code: 'PASSWORD_HASH_ERROR'
                            });
                        }
                        
                        db.run(
                            'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            [newHash, userId],
                            function(err) {
                                if (err) {
                                    console.error('Error updating password:', err);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to update password',
                                        code: 'PASSWORD_UPDATE_ERROR'
                                    });
                                }
                                
                                // Invalidate all user sessions for security
                                auth.invalidateAllUserSessions(userId)
                                    .catch(err => console.error('Error invalidating sessions:', err));
                                
                                // Log password change
                                auth.logAudit(
                                    req.user.id, 
                                    'CHANGE_PASSWORD', 
                                    'USER', 
                                    userId, 
                                    null, 
                                    { 
                                        password_changed: true,
                                        changed_by_other: !isSelfEdit,
                                        sessions_invalidated: true 
                                    }, 
                                    req
                                );
                                
                                res.json({ 
                                    success: true, 
                                    message: 'Password changed successfully'
                                });
                            }
                        );
                    });
                }
            });
        } catch (error) {
            console.error('Error in password change endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get all roles for dropdown
router.get('/roles/options', 
    auth.authenticate,
    auth.checkPermission('user.view', 'view'),
    async (req, res) => {
        try {
            db.all(`
                SELECT 
                    id as value,
                    name as label,
                    description,
                    is_system_role
                FROM roles
                ORDER BY name
            `, [], (err, roles) => {
                if (err) {
                    console.error('Error fetching roles:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch roles',
                        code: 'ROLE_FETCH_ERROR'
                    });
                }
                
                res.json({
                    success: true,
                    roles
                });
            });
        } catch (error) {
            console.error('Error in roles options endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get user activity (recent logins, actions)
router.get('/:id/activity', 
    auth.authenticate,
    auth.checkPermission('user.view', 'view'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { limit = 20 } = req.query;
            
            db.all(`
                SELECT 
                    a.*,
                    u.username as performed_by_username
                FROM audit_log a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE a.user_id = ?
                ORDER BY a.timestamp DESC
                LIMIT ?
            `, [userId, limit], (err, activities) => {
                if (err) {
                    console.error('Error fetching user activity:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user activity',
                        code: 'ACTIVITY_FETCH_ERROR'
                    });
                }
                
                res.json({
                    success: true,
                    activities
                });
            });
        } catch (error) {
            console.error('Error in user activity endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get user sessions
router.get('/:id/sessions', 
    auth.authenticate,
    auth.checkPermission('user.view', 'view'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            
            db.all(`
                SELECT 
                    us.*,
                    u.username
                FROM user_sessions us
                JOIN users u ON us.user_id = u.id
                WHERE us.user_id = ?
                ORDER BY us.created_at DESC
            `, [userId], (err, sessions) => {
                if (err) {
                    console.error('Error fetching user sessions:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch user sessions',
                        code: 'SESSION_FETCH_ERROR'
                    });
                }
                
                res.json({
                    success: true,
                    sessions
                });
            });
        } catch (error) {
            console.error('Error in user sessions endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Invalidate user sessions (force logout)
router.delete('/:id/sessions', 
    auth.authenticate,
    auth.checkPermission('user.edit', 'edit'),
    async (req, res) => {
        try {
            const userId = req.params.id;
            const { except_session_token } = req.body;
            
            let query = 'UPDATE user_sessions SET is_active = 0 WHERE user_id = ? AND is_active = 1';
            const params = [userId];
            
            if (except_session_token) {
                query += ' AND session_token != ?';
                params.push(except_session_token);
            }
            
            db.run(query, params, function(err) {
                if (err) {
                    console.error('Error invalidating sessions:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to invalidate sessions',
                        code: 'SESSION_INVALIDATE_ERROR'
                    });
                }
                
                // Log action
                auth.logAudit(
                    req.user.id, 
                    'INVALIDATE_SESSIONS', 
                    'USER', 
                    userId, 
                    null, 
                    { 
                        sessions_invalidated: this.changes,
                        except_session_token: except_session_token || 'none'
                    }, 
                    req
                );
                
                res.json({
                    success: true,
                    message: `${this.changes} session(s) invalidated successfully`
                });
            });
        } catch (error) {
            console.error('Error in invalidate sessions endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

module.exports = router;