const PERMISSIONS = {
    // Tire Management
    TIRE_MANAGEMENT: {
        VIEW: 'tire.view',
        CREATE: 'tire.create',
        EDIT: 'tire.edit',
        DELETE: 'tire.delete',
        ASSIGN: 'tire.assign',
        DISPOSE: 'tire.dispose',
        RETREAD: 'tire.retread'
    },
    
    // Vehicle Management
    VEHICLE_MANAGEMENT: {
        VIEW: 'vehicle.view',
        CREATE: 'vehicle.create',
        EDIT: 'vehicle.edit',
        DELETE: 'vehicle.delete'
    },
    
    // Supplier Management
    SUPPLIER_MANAGEMENT: {
        VIEW: 'supplier.view',
        CREATE: 'supplier.create',
        EDIT: 'supplier.edit',
        DELETE: 'supplier.delete',
        MANAGE_LEDGER: 'supplier.ledger'
    },
    
    // Inventory Management
    INVENTORY_MANAGEMENT: {
        VIEW: 'inventory.view',
        TRANSFER: 'inventory.transfer',
        AUDIT: 'inventory.audit'
    },
    
    // Reports
    REPORTS: {
        VIEW: 'reports.view',
        GENERATE: 'reports.generate',
        EXPORT: 'reports.export'
    },
    
    // User Management
    USER_MANAGEMENT: {
        VIEW: 'user.view',
        CREATE: 'user.create',
        EDIT: 'user.edit',
        DELETE: 'user.delete'
    },
    
    // Role Management
    ROLE_MANAGEMENT: {
        VIEW: 'role.view',
        CREATE: 'role.create',
        EDIT: 'role.edit',
        DELETE: 'role.delete'
    },
    
    // System Settings
    SETTINGS: {
        VIEW: 'settings.view',
        EDIT: 'settings.edit'
    }
};

const SYSTEM_ROLES = {
    SUPER_ADMIN: 'Super Administrator',
    ADMIN: 'Administrator',
    FLEET_MANAGER: 'Fleet Manager',
    INVENTORY_CLERK: 'Inventory Clerk',
    MECHANIC: 'Mechanic',
    VIEWER: 'Viewer'
};

// Default role permissions configuration
const DEFAULT_ROLE_PERMISSIONS = {
    [SYSTEM_ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS).flatMap(category => 
        Object.values(category).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 }))
    ),
    
    [SYSTEM_ROLES.ADMIN]: [
        // All tire permissions
        ...Object.values(PERMISSIONS.TIRE_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 })),
        // All vehicle permissions
        ...Object.values(PERMISSIONS.VEHICLE_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1 })),
        // All supplier permissions
        ...Object.values(PERMISSIONS.SUPPLIER_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1 })),
        // All inventory permissions
        ...Object.values(PERMISSIONS.INVENTORY_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1 })),
        // All report permissions
        ...Object.values(PERMISSIONS.REPORTS).map(perm => ({ permission: perm, can_view: 1, can_create: 1 })),
        // Limited user management
        { permission: PERMISSIONS.USER_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 1, can_delete: 0 },
        { permission: PERMISSIONS.ROLE_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 }
    ],
    
    [SYSTEM_ROLES.FLEET_MANAGER]: [
        // Tire permissions
        { permission: PERMISSIONS.TIRE_MANAGEMENT.VIEW, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 },
        { permission: PERMISSIONS.TIRE_MANAGEMENT.ASSIGN, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 },
        { permission: PERMISSIONS.TIRE_MANAGEMENT.RETREAD, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 },
        // Vehicle permissions
        ...Object.values(PERMISSIONS.VEHICLE_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 })),
        // Reports
        { permission: PERMISSIONS.REPORTS.VIEW, can_view: 1, can_create: 0 },
        { permission: PERMISSIONS.REPORTS.GENERATE, can_view: 1, can_create: 1 }
    ],
    
    [SYSTEM_ROLES.INVENTORY_CLERK]: [
        // Tire permissions (limited)
        { permission: PERMISSIONS.TIRE_MANAGEMENT.VIEW, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 },
        // Inventory permissions
        ...Object.values(PERMISSIONS.INVENTORY_MANAGEMENT).map(perm => ({ permission: perm, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0 })),
        // Supplier permissions (view only)
        { permission: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 }
    ],
    
    [SYSTEM_ROLES.MECHANIC]: [
        // Tire assignment permissions
        { permission: PERMISSIONS.TIRE_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 },
        { permission: PERMISSIONS.TIRE_MANAGEMENT.ASSIGN, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0 },
        // Vehicle view only
        { permission: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 }
    ],
    
    [SYSTEM_ROLES.VIEWER]: [
        // Read-only permissions
        { permission: PERMISSIONS.TIRE_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 },
        { permission: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 },
        { permission: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 },
        { permission: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0 },
        { permission: PERMISSIONS.REPORTS.VIEW, can_view: 1, can_create: 0 }
    ]
};

module.exports = {
    PERMISSIONS,
    SYSTEM_ROLES,
    DEFAULT_ROLE_PERMISSIONS
};