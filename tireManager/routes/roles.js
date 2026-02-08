const express = require('express');
const router = express.Router();
const db = require('../config/database');
const AuthMiddleware = require('../middleware/auth-middleware');



const auth = new AuthMiddleware(db);

// Get all roles with user counts
router.get('/', 
    auth.authenticate,
    auth.checkPermission('role.view', 'view'),
    async (req, res) => {
        try {
            const { include_system = 'true', search = '' } = req.query;
            const includeSystemRoles = include_system === 'true';
            
            let query = `
                SELECT 
                    r.*,
                    COUNT(DISTINCT u.id) as user_count,
                    COUNT(DISTINCT rp.permission_id) as permission_count
                FROM roles r
                LEFT JOIN users u ON r.id = u.role_id AND u.is_active = 1
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
                WHERE 1=1
            `;
            
            const params = [];
            
            if (!includeSystemRoles) {
                query += ' AND r.is_system_role = 0';
            }
            
            if (search) {
                query += ' AND (r.name LIKE ? OR r.description LIKE ?)';
                const searchParam = `%${search}%`;
                params.push(searchParam, searchParam);
            }
            
            query += ' GROUP BY r.id ORDER BY r.is_system_role DESC, r.name';
            
            db.all(query, params, (err, rows) => {
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
                    roles: rows,
                    total: rows.length
                });
            });
        } catch (error) {
            console.error('Error in roles endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get role by ID with detailed permissions
router.get('/:id', 
    auth.authenticate,
    auth.checkPermission('role.view', 'view'),
    async (req, res) => {
        try {
            const roleId = req.params.id;
            
            // Get role info
            db.get(`
                SELECT 
                    r.*,
                    GROUP_CONCAT(DISTINCT u.username) as sample_users
                FROM roles r
                LEFT JOIN users u ON r.id = u.role_id AND u.is_active = 1
                WHERE r.id = ?
                GROUP BY r.id
            `, [roleId], async (err, role) => {
                if (err) {
                    console.error('Error fetching role:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch role',
                        code: 'ROLE_FETCH_ERROR'
                    });
                }
                
                if (!role) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Role not found',
                        code: 'ROLE_NOT_FOUND'
                    });
                }
                
                // Get role permissions
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
                `, [roleId], (err, permissions) => {
                    if (err) {
                        console.error('Error fetching role permissions:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to fetch role permissions',
                            code: 'PERMISSION_FETCH_ERROR'
                        });
                    }
                    
                    // Get users with this role
                    db.all(`
                        SELECT 
                            u.id,
                            u.username,
                            u.email,
                            u.full_name,
                            u.department,
                            u.is_active,
                            u.created_at
                        FROM users u
                        WHERE u.role_id = ? AND u.is_active = 1
                        ORDER BY u.full_name
                        LIMIT 10
                    `, [roleId], (err, users) => {
                        if (err) {
                            console.error('Error fetching role users:', err);
                        }
                        
                        const permissionSummary = {
                            total: permissions.length,
                            can_view: permissions.filter(p => p.can_view).length,
                            can_create: permissions.filter(p => p.can_create).length,
                            can_edit: permissions.filter(p => p.can_edit).length,
                            can_delete: permissions.filter(p => p.can_delete).length,
                            can_approve: permissions.filter(p => p.can_approve).length
                        };
                        
                        res.json({
                            success: true,
                            role: {
                                ...role,
                                permissions,
                                permission_summary: permissionSummary,
                                users: users || []
                            }
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Error in role detail endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Create new role
router.post('/', 
    auth.authenticate,
    auth.checkPermission('role.create', 'create'),
    async (req, res) => {
        try {
            const { name, description, permissions = [] } = req.body;
            
            // Validation
            if (!name || !name.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Role name is required',
                    code: 'MISSING_NAME'
                });
            }
            
            if (permissions.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one permission is required',
                    code: 'NO_PERMISSIONS'
                });
            }
            
            // Check if role name already exists
            db.get('SELECT id FROM roles WHERE name = ?', [name], (err, existingRole) => {
                if (err) {
                    console.error('Error checking existing role:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to check role existence',
                        code: 'ROLE_CHECK_ERROR'
                    });
                }
                
                if (existingRole) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Role name already exists',
                        code: 'DUPLICATE_ROLE'
                    });
                }
                
                // Start transaction
                db.run('BEGIN TRANSACTION', async (err) => {
                    if (err) {
                        console.error('Error starting transaction:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to create role',
                            code: 'TRANSACTION_ERROR'
                        });
                    }
                    
                    try {
                        // Insert role
                        db.run(`
                            INSERT INTO roles (name, description, is_system_role)
                            VALUES (?, ?, 0)
                        `, [name, description || null], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error('Error creating role:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to create role',
                                    code: 'ROLE_CREATION_ERROR'
                                });
                            }
                            
                            const roleId = this.lastID;
                            
                            // Insert permissions
                            const permissionPromises = permissions.map(perm => {
                                return new Promise((resolve, reject) => {
                                    db.run(`
                                        INSERT INTO role_permissions 
                                        (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                                        VALUES (?, ?, ?, ?, ?, ?, ?)
                                    `, [
                                        roleId,
                                        perm.permission_id,
                                        perm.can_view ? 1 : 0,
                                        perm.can_create ? 1 : 0,
                                        perm.can_edit ? 1 : 0,
                                        perm.can_delete ? 1 : 0,
                                        perm.can_approve ? 1 : 0
                                    ], function(err) {
                                        if (err) reject(err);
                                        else resolve();
                                    });
                                });
                            });
                            
                            Promise.all(permissionPromises)
                                .then(() => {
                                    db.run('COMMIT', (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            console.error('Error committing transaction:', err);
                                            return res.status(500).json({ 
                                                success: false, 
                                                error: 'Failed to create role',
                                                code: 'TRANSACTION_ERROR'
                                            });
                                        }
                                        
                                        // Log audit
                                        auth.logAudit(
                                            req.user.id,
                                            'CREATE_ROLE',
                                            'ROLE',
                                            roleId,
                                            null,
                                            { 
                                                name, 
                                                description,
                                                permissions_count: permissions.length 
                                            },
                                            req
                                        );
                                        
                                        res.status(201).json({
                                            success: true,
                                            message: 'Role created successfully',
                                            role_id: roleId,
                                            role: {
                                                id: roleId,
                                                name,
                                                description,
                                                is_system_role: 0
                                            }
                                        });
                                    });
                                })
                                .catch(error => {
                                    db.run('ROLLBACK');
                                    console.error('Error adding permissions:', error);
                                    res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to add permissions to role',
                                        code: 'PERMISSION_ADD_ERROR'
                                    });
                                });
                        });
                    } catch (error) {
                        db.run('ROLLBACK');
                        console.error('Error in role creation:', error);
                        res.status(500).json({ 
                            success: false, 
                            error: 'Failed to create role',
                            code: 'ROLE_CREATION_ERROR'
                        });
                    }
                });
            });
        } catch (error) {
            console.error('Error in role creation endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Update role
router.put('/:id', 
    auth.authenticate,
    auth.checkPermission('role.edit', 'edit'),
    async (req, res) => {
        try {
            const roleId = req.params.id;
            const { name, description, permissions = [] } = req.body;
            
            // Validation
            if (!name || !name.trim()) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Role name is required',
                    code: 'MISSING_NAME'
                });
            }
            
            if (permissions.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one permission is required',
                    code: 'NO_PERMISSIONS'
                });
            }
            
            // Check if role exists and is not system role
            db.get('SELECT * FROM roles WHERE id = ?', [roleId], (err, existingRole) => {
                if (err) {
                    console.error('Error fetching role:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch role',
                        code: 'ROLE_FETCH_ERROR'
                    });
                }
                
                if (!existingRole) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Role not found',
                        code: 'ROLE_NOT_FOUND'
                    });
                }
                
                if (existingRole.is_system_role) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Cannot modify system roles',
                        code: 'SYSTEM_ROLE_MODIFICATION'
                    });
                }
                
                // Check if role name already exists (excluding current role)
                db.get('SELECT id FROM roles WHERE name = ? AND id != ?', [name, roleId], (err, duplicateRole) => {
                    if (err) {
                        console.error('Error checking duplicate role:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to check role name',
                            code: 'ROLE_CHECK_ERROR'
                        });
                    }
                    
                    if (duplicateRole) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Role name already exists',
                            code: 'DUPLICATE_ROLE'
                        });
                    }
                    
                    // Start transaction
                    db.run('BEGIN TRANSACTION', async (err) => {
                        if (err) {
                            console.error('Error starting transaction:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to update role',
                                code: 'TRANSACTION_ERROR'
                            });
                        }
                        
                        try {
                            // Update role
                            db.run(`
                                UPDATE roles 
                                SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?
                            `, [name, description || null, roleId], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    console.error('Error updating role:', err);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to update role',
                                        code: 'ROLE_UPDATE_ERROR'
                                    });
                                }
                                
                                // Delete existing permissions
                                db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId], function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        console.error('Error deleting permissions:', err);
                                        return res.status(500).json({ 
                                            success: false, 
                                            error: 'Failed to update permissions',
                                            code: 'PERMISSION_DELETE_ERROR'
                                        });
                                    }
                                    
                                    // Insert new permissions
                                    const permissionPromises = permissions.map(perm => {
                                        return new Promise((resolve, reject) => {
                                            db.run(`
                                                INSERT INTO role_permissions 
                                                (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                                                VALUES (?, ?, ?, ?, ?, ?, ?)
                                            `, [
                                                roleId,
                                                perm.permission_id,
                                                perm.can_view ? 1 : 0,
                                                perm.can_create ? 1 : 0,
                                                perm.can_edit ? 1 : 0,
                                                perm.can_delete ? 1 : 0,
                                                perm.can_approve ? 1 : 0
                                            ], function(err) {
                                                if (err) reject(err);
                                                else resolve();
                                            });
                                        });
                                    });
                                    
                                    Promise.all(permissionPromises)
                                        .then(() => {
                                            db.run('COMMIT', (err) => {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    console.error('Error committing transaction:', err);
                                                    return res.status(500).json({ 
                                                        success: false, 
                                                        error: 'Failed to update role',
                                                        code: 'TRANSACTION_ERROR'
                                                    });
                                                }
                                                
                                                // Log audit
                                                auth.logAudit(
                                                    req.user.id,
                                                    'UPDATE_ROLE',
                                                    'ROLE',
                                                    roleId,
                                                    {
                                                        name: existingRole.name,
                                                        description: existingRole.description
                                                    },
                                                    { 
                                                        name, 
                                                        description,
                                                        permissions_count: permissions.length 
                                                    },
                                                    req
                                                );
                                                
                                                res.json({
                                                    success: true,
                                                    message: 'Role updated successfully',
                                                    role_id: roleId
                                                });
                                            });
                                        })
                                        .catch(error => {
                                            db.run('ROLLBACK');
                                            console.error('Error adding permissions:', error);
                                            res.status(500).json({ 
                                                success: false, 
                                                error: 'Failed to update permissions',
                                                code: 'PERMISSION_ADD_ERROR'
                                            });
                                        });
                                });
                            });
                        } catch (error) {
                            db.run('ROLLBACK');
                            console.error('Error in role update:', error);
                            res.status(500).json({ 
                                success: false, 
                                error: 'Failed to update role',
                                code: 'ROLE_UPDATE_ERROR'
                            });
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Error in role update endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Delete role
router.delete('/:id', 
    auth.authenticate,
    auth.checkPermission('role.delete', 'delete'),
    async (req, res) => {
        try {
            const roleId = req.params.id;
            
            // Check if role exists and is not system role
            db.get('SELECT * FROM roles WHERE id = ?', [roleId], (err, role) => {
                if (err) {
                    console.error('Error fetching role:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch role',
                        code: 'ROLE_FETCH_ERROR'
                    });
                }
                
                if (!role) {
                    return res.status(404).json({ 
                        success: false, 
                        error: 'Role not found',
                        code: 'ROLE_NOT_FOUND'
                    });
                }
                
                if (role.is_system_role) {
                    return res.status(400).json({ 
                        success: false, 
                        error: 'Cannot delete system roles',
                        code: 'SYSTEM_ROLE_DELETION'
                    });
                }
                
                // Check if role has users assigned
                db.get('SELECT COUNT(*) as user_count FROM users WHERE role_id = ? AND is_active = 1', [roleId], (err, result) => {
                    if (err) {
                        console.error('Error checking role users:', err);
                        return res.status(500).json({ 
                            success: false, 
                            error: 'Failed to check role usage',
                            code: 'ROLE_USAGE_CHECK_ERROR'
                        });
                    }
                    
                    if (result.user_count > 0) {
                        return res.status(400).json({ 
                            success: false, 
                            error: 'Cannot delete role with assigned users. Reassign users first.',
                            code: 'ROLE_HAS_USERS'
                        });
                    }
                    
                    // Start transaction
                    db.run('BEGIN TRANSACTION', (err) => {
                        if (err) {
                            console.error('Error starting transaction:', err);
                            return res.status(500).json({ 
                                success: false, 
                                error: 'Failed to delete role',
                                code: 'TRANSACTION_ERROR'
                            });
                        }
                        
                        // Delete role permissions
                        db.run('DELETE FROM role_permissions WHERE role_id = ?', [roleId], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                console.error('Error deleting role permissions:', err);
                                return res.status(500).json({ 
                                    success: false, 
                                    error: 'Failed to delete role permissions',
                                    code: 'PERMISSION_DELETE_ERROR'
                                });
                            }
                            
                            // Delete role
                            db.run('DELETE FROM roles WHERE id = ?', [roleId], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    console.error('Error deleting role:', err);
                                    return res.status(500).json({ 
                                        success: false, 
                                        error: 'Failed to delete role',
                                        code: 'ROLE_DELETION_ERROR'
                                    });
                                }
                                
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        console.error('Error committing transaction:', err);
                                        return res.status(500).json({ 
                                            success: false, 
                                            error: 'Failed to delete role',
                                            code: 'TRANSACTION_ERROR'
                                        });
                                    }
                                    
                                    // Log audit
                                    auth.logAudit(
                                        req.user.id,
                                        'DELETE_ROLE',
                                        'ROLE',
                                        roleId,
                                        { 
                                            name: role.name,
                                            description: role.description 
                                        },
                                        null,
                                        req
                                    );
                                    
                                    res.json({
                                        success: true,
                                        message: 'Role deleted successfully'
                                    });
                                });
                            });
                        });
                    });
                });
            });
        } catch (error) {
            console.error('Error in role deletion endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get all permissions
router.get('/permissions/all', 
    auth.authenticate,
    auth.checkPermission('role.view', 'view'),
    async (req, res) => {
        try {
            db.all(`
                SELECT 
                    p.*,
                    COUNT(rp.role_id) as assigned_role_count
                FROM permissions p
                LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                GROUP BY p.id
                ORDER BY p.category, p.name
            `, [], (err, permissions) => {
                if (err) {
                    console.error('Error fetching permissions:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to fetch permissions',
                        code: 'PERMISSION_FETCH_ERROR'
                    });
                }
                
                // Group by category
                const grouped = {};
                permissions.forEach(perm => {
                    if (!grouped[perm.category]) {
                        grouped[perm.category] = [];
                    }
                    grouped[perm.category].push(perm);
                });
                
                res.json({
                    success: true,
                    permissions: grouped,
                    summary: {
                        total: permissions.length,
                        categories: Object.keys(grouped).length
                    }
                });
            });
        } catch (error) {
            console.error('Error in permissions endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

// Get users by role
router.get('/:id/users', 
    auth.authenticate,
    auth.checkPermission('role.view', 'view'),
    async (req, res) => {
        try {
            const roleId = req.params.id;
            const { page = 1, limit = 20 } = req.query;
            const offset = (page - 1) * limit;
            
            // Get total count
            db.get(`
                SELECT COUNT(*) as total 
                FROM users 
                WHERE role_id = ? AND is_active = 1
            `, [roleId], (err, countResult) => {
                if (err) {
                    console.error('Error counting users:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to count users',
                        code: 'USER_COUNT_ERROR'
                    });
                }
                
                // Get paginated users
                db.all(`
                    SELECT 
                        u.id,
                        u.username,
                        u.email,
                        u.full_name,
                        u.department,
                        u.is_active,
                        u.created_at,
                        u.last_login
                    FROM users u
                    WHERE u.role_id = ? AND u.is_active = 1
                    ORDER BY u.full_name
                    LIMIT ? OFFSET ?
                `, [roleId, limit, offset], (err, users) => {
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
                            total: countResult.total,
                            pages: Math.ceil(countResult.total / limit)
                        }
                    });
                });
            });
        } catch (error) {
            console.error('Error in role users endpoint:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Internal server error',
                code: 'SERVER_ERROR'
            });
        }
    }
);

module.exports = router;