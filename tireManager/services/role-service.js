// role-service.js
const db = require('../config/database');
const { getAllPermissions } = require('../config/permissions-config');

class RoleService {
    // Get all permissions grouped by category
    async getAllPermissionsGrouped() {
        try {
            const permissions = await db.allQuery(`
                SELECT p.*, 
                    COUNT(rp.role_id) as assigned_count
                FROM permissions p
                LEFT JOIN role_permissions rp ON p.id = rp.permission_id
                GROUP BY p.id
                ORDER BY p.category, p.name
            `);
            
            // Group by category
            const grouped = {};
            permissions.forEach(perm => {
                if (!grouped[perm.category]) {
                    grouped[perm.category] = [];
                }
                grouped[perm.category].push(perm);
            });
            
            return grouped;
        } catch (error) {
            throw error;
        }
    }
    
    // Create a new role
    async createRole(roleData, permissions) {
        try {
            await db.runQuery('BEGIN TRANSACTION');
            
            // Insert role
            const roleResult = await db.runQuery(`
                INSERT INTO roles (name, description, is_system_role)
                VALUES (?, ?, 0)
            `, [roleData.name, roleData.description]);
            
            const roleId = roleResult.lastID;
            
            // Insert role permissions
            for (const perm of permissions) {
                await db.runQuery(`
                    INSERT INTO role_permissions 
                    (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    roleId,
                    perm.permission_id,
                    perm.can_view || 0,
                    perm.can_create || 0,
                    perm.can_edit || 0,
                    perm.can_delete || 0,
                    perm.can_approve || 0
                ]);
            }
            
            await db.runQuery('COMMIT');
            
            return await this.getRoleById(roleId);
        } catch (error) {
            await db.runQuery('ROLLBACK');
            throw error;
        }
    }
    
    // Update an existing role
    async updateRole(roleId, roleData, permissions) {
        try {
            await db.runQuery('BEGIN TRANSACTION');
            
            // Update role details
            await db.runQuery(`
                UPDATE roles 
                SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND is_system_role = 0
            `, [roleData.name, roleData.description, roleId]);
            
            // Delete existing permissions
            await db.runQuery(`
                DELETE FROM role_permissions WHERE role_id = ?
            `, [roleId]);
            
            // Insert new permissions
            for (const perm of permissions) {
                await db.runQuery(`
                    INSERT INTO role_permissions 
                    (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    roleId,
                    perm.permission_id,
                    perm.can_view || 0,
                    perm.can_create || 0,
                    perm.can_edit || 0,
                    perm.can_delete || 0,
                    perm.can_approve || 0
                ]);
            }
            
            await db.runQuery('COMMIT');
            
            return await this.getRoleById(roleId);
        } catch (error) {
            await db.runQuery('ROLLBACK');
            throw error;
        }
    }
    
    // Get role by ID with permissions
    async getRoleById(roleId) {
        try {
            const role = await db.getQuery(`
                SELECT r.*, 
                    COUNT(DISTINCT u.id) as user_count
                FROM roles r
                LEFT JOIN users u ON r.id = u.role_id
                WHERE r.id = ?
                GROUP BY r.id
            `, [roleId]);
            
            if (!role) return null;
            
            const permissions = await db.allQuery(`
                SELECT p.*, 
                    rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_approve
                FROM role_permissions rp
                JOIN permissions p ON rp.permission_id = p.id
                WHERE rp.role_id = ?
                ORDER BY p.category, p.name
            `, [roleId]);
            
            return {
                ...role,
                permissions
            };
        } catch (error) {
            throw error;
        }
    }
    
    // Get all roles
    async getAllRoles(includeSystemRoles = true) {
        try {
            let sql = `
                SELECT r.*, 
                    COUNT(DISTINCT u.id) as user_count,
                    COUNT(DISTINCT rp.permission_id) as permission_count
                FROM roles r
                LEFT JOIN users u ON r.id = u.role_id
                LEFT JOIN role_permissions rp ON r.id = rp.role_id
            `;
            
            const params = [];
            if (!includeSystemRoles) {
                sql += ' WHERE r.is_system_role = 0';
            }
            
            sql += ' GROUP BY r.id ORDER BY r.is_system_role DESC, r.name';
            
            return await db.allQuery(sql, params);
        } catch (error) {
            throw error;
        }
    }
    
    // Delete a role (only non-system roles)
    async deleteRole(roleId) {
        try {
            // Check if role is system role
            const role = await db.getQuery(
                'SELECT is_system_role FROM roles WHERE id = ?',
                [roleId]
            );
            
            if (role && role.is_system_role) {
                throw new Error('Cannot delete system roles');
            }
            
            // Check if role has users assigned
            const usersWithRole = await db.allQuery(
                'SELECT COUNT(*) as count FROM users WHERE role_id = ?',
                [roleId]
            );
            
            if (usersWithRole[0].count > 0) {
                throw new Error('Cannot delete role with assigned users. Reassign users first.');
            }
            
            await db.runQuery('BEGIN TRANSACTION');
            
            // Delete role permissions
            await db.runQuery('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
            
            // Delete role
            await db.runQuery('DELETE FROM roles WHERE id = ?', [roleId]);
            
            await db.runQuery('COMMIT');
            
            return true;
        } catch (error) {
            await db.runQuery('ROLLBACK');
            throw error;
        }
    }
    
    // Check if user has permission
    async checkPermission(userId, permissionCode, action = 'view') {
        try {
            const sql = `
                SELECT rp.can_view, rp.can_create, rp.can_edit, rp.can_delete, rp.can_approve
                FROM users u
                JOIN roles r ON u.role_id = r.id
                JOIN role_permissions rp ON r.id = rp.role_id
                JOIN permissions p ON rp.permission_id = p.id
                WHERE u.id = ? AND p.code = ?
            `;
            
            const result = await db.getQuery(sql, [userId, permissionCode]);
            
            if (!result) return false;
            
            const actionMap = {
                'view': 'can_view',
                'create': 'can_create',
                'edit': 'can_edit',
                'delete': 'can_delete',
                'approve': 'can_approve'
            };
            
            const actionField = actionMap[action.toLowerCase()] || 'can_view';
            return result[actionField] === 1;
        } catch (error) {
            console.error('Permission check error:', error);
            return false;
        }
    }
}

module.exports = new RoleService();