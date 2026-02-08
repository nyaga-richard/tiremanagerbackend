// permissions-config.js

const PERMISSIONS = {
    // Tire Management
    TIRE_MANAGEMENT: {
        VIEW: { code: 'tire.view', name: 'View Tires', category: 'Tire Management' },
        CREATE: { code: 'tire.create', name: 'Create Tires', category: 'Tire Management' },
        EDIT: { code: 'tire.edit', name: 'Edit Tires', category: 'Tire Management' },
        DELETE: { code: 'tire.delete', name: 'Delete Tires', category: 'Tire Management' },
        ASSIGN: { code: 'tire.assign', name: 'Assign Tires', category: 'Tire Management' },
        DISPOSE: { code: 'tire.dispose', name: 'Dispose Tires', category: 'Tire Management' },
        RETREAD: { code: 'tire.retread', name: 'Retread Tires', category: 'Tire Management' }
    },
    
    // Purchase Order Management
    PURCHASE_ORDER: {
        VIEW: { code: 'po.view', name: 'View Purchase Orders', category: 'Purchase Orders' },
        CREATE: { code: 'po.create', name: 'Create Purchase Orders', category: 'Purchase Orders' },
        EDIT: { code: 'po.edit', name: 'Edit Purchase Orders', category: 'Purchase Orders' },
        DELETE: { code: 'po.delete', name: 'Delete Purchase Orders', category: 'Purchase Orders' },
        APPROVE: { code: 'po.approve', name: 'Approve Purchase Orders', category: 'Purchase Orders' },
        RECEIVE: { code: 'po.receive', name: 'Receive Purchase Orders', category: 'Purchase Orders' }
    },
    
    // Vehicle Management
    VEHICLE_MANAGEMENT: {
        VIEW: { code: 'vehicle.view', name: 'View Vehicles', category: 'Vehicle Management' },
        CREATE: { code: 'vehicle.create', name: 'Create Vehicles', category: 'Vehicle Management' },
        EDIT: { code: 'vehicle.edit', name: 'Edit Vehicles', category: 'Vehicle Management' },
        DELETE: { code: 'vehicle.delete', name: 'Delete Vehicles', category: 'Vehicle Management' }
    },
    
    // Supplier Management
    SUPPLIER_MANAGEMENT: {
        VIEW: { code: 'supplier.view', name: 'View Suppliers', category: 'Supplier Management' },
        CREATE: { code: 'supplier.create', name: 'Create Suppliers', category: 'Supplier Management' },
        EDIT: { code: 'supplier.edit', name: 'Edit Suppliers', category: 'Supplier Management' },
        DELETE: { code: 'supplier.delete', name: 'Delete Suppliers', category: 'Supplier Management' },
        MANAGE_LEDGER: { code: 'supplier.ledger', name: 'Manage Supplier Ledger', category: 'Supplier Management' }
    },
    
    // Inventory Management
    INVENTORY_MANAGEMENT: {
        VIEW: { code: 'inventory.view', name: 'View Inventory', category: 'Inventory Management' },
        TRANSFER: { code: 'inventory.transfer', name: 'Transfer Inventory', category: 'Inventory Management' },
        AUDIT: { code: 'inventory.audit', name: 'Audit Inventory', category: 'Inventory Management' },
        CATALOG: { code: 'inventory.catalog', name: 'Manage Catalog', category: 'Inventory Management' }
    },
    
    // Reports
    REPORTS: {
        VIEW: { code: 'reports.view', name: 'View Reports', category: 'Reports' },
        GENERATE: { code: 'reports.generate', name: 'Generate Reports', category: 'Reports' },
        EXPORT: { code: 'reports.export', name: 'Export Reports', category: 'Reports' }
    },
    
    // User Management
    USER_MANAGEMENT: {
        VIEW: { code: 'user.view', name: 'View Users', category: 'User Management' },
        CREATE: { code: 'user.create', name: 'Create Users', category: 'User Management' },
        EDIT: { code: 'user.edit', name: 'Edit Users', category: 'User Management' },
        DELETE: { code: 'user.delete', name: 'Delete Users', category: 'User Management' }
    },
    
    // Role Management
    ROLE_MANAGEMENT: {
        VIEW: { code: 'role.view', name: 'View Roles', category: 'Role Management' },
        CREATE: { code: 'role.create', name: 'Create Roles', category: 'Role Management' },
        EDIT: { code: 'role.edit', name: 'Edit Roles', category: 'Role Management' },
        DELETE: { code: 'role.delete', name: 'Delete Roles', category: 'Role Management' }
    },
    
    // System Settings
    SETTINGS: {
        VIEW: { code: 'settings.view', name: 'View Settings', category: 'System Settings' },
        EDIT: { code: 'settings.edit', name: 'Edit Settings', category: 'System Settings' }
    },
    
    // Accounting
    ACCOUNTING: {
        VIEW: { code: 'accounting.view', name: 'View Accounting', category: 'Accounting' },
        CREATE: { code: 'accounting.create', name: 'Create Transactions', category: 'Accounting' },
        APPROVE: { code: 'accounting.approve', name: 'Approve Transactions', category: 'Accounting' },
        POST: { code: 'accounting.post', name: 'Post Transactions', category: 'Accounting' }
    },
    
    // GRN Management
    GRN_MANAGEMENT: {
        VIEW: { code: 'grn.view', name: 'View GRNs', category: 'GRN Management' },
        CREATE: { code: 'grn.create', name: 'Create GRNs', category: 'GRN Management' },
        EDIT: { code: 'grn.edit', name: 'Edit GRNs', category: 'GRN Management' },
        DELETE: { code: 'grn.delete', name: 'Delete GRNs', category: 'GRN Management' },
        VERIFY: { code: 'grn.verify', name: 'Verify GRNs', category: 'GRN Management' }
    },
    
    // Tire Movement
    TIRE_MOVEMENT: {
        VIEW: { code: 'movement.view', name: 'View Movements', category: 'Tire Movement' },
        CREATE: { code: 'movement.create', name: 'Create Movements', category: 'Tire Movement' },
        EDIT: { code: 'movement.edit', name: 'Edit Movements', category: 'Tire Movement' },
        DELETE: { code: 'movement.delete', name: 'Delete Movements', category: 'Tire Movement' }
    },
    
    // Audit Logs
    AUDIT_LOGS: {
        VIEW: { code: 'audit.view', name: 'View Audit Logs', category: 'Audit Logs' },
        EXPORT: { code: 'audit.export', name: 'Export Audit Logs', category: 'Audit Logs' }
    },
    
    // Dashboard
    DASHBOARD: {
        VIEW: { code: 'dashboard.view', name: 'View Dashboard', category: 'Dashboard' }
    }
};

const SYSTEM_ROLES = {
    SUPER_ADMIN: 'Super Administrator',
    ADMIN: 'Administrator',
    FLEET_MANAGER: 'Fleet Manager',
    PURCHASE_MANAGER: 'Purchase Manager',
    INVENTORY_CLERK: 'Inventory Clerk',
    MECHANIC: 'Mechanic',
    ACCOUNTANT: 'Accountant',
    VIEWER: 'Viewer'
};

// Default Role Permissions Configuration
const DEFAULT_ROLE_PERMISSIONS = {
    [SYSTEM_ROLES.SUPER_ADMIN]: () => {
        // Super Admin gets ALL permissions with ALL actions
        const allPermissions = [];
        for (const category in PERMISSIONS) {
            for (const key in PERMISSIONS[category]) {
                const perm = PERMISSIONS[category][key];
                allPermissions.push({
                    permission_code: perm.code,
                    can_view: 1,
                    can_create: 1,
                    can_edit: 1,
                    can_delete: 1,
                    can_approve: 1
                });
            }
        }
        return allPermissions;
    },
    
    [SYSTEM_ROLES.ADMIN]: () => [
        // Tire Management - Full control
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.DELETE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.ASSIGN.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.DISPOSE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.RETREAD.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 1 },
        
        // Vehicle Management - Full control
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.DELETE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        
        // Purchase Orders - Can create/view/edit, but need approval from Purchase Manager
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Suppliers - Full control
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.MANAGE_LEDGER.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Inventory Management - Full control
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.TRANSFER.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.AUDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.CATALOG.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        
        // GRN Management - Full control
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VERIFY.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        
        // Tire Movement - Full control
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 1, can_approve: 0 },
        
        // User Management - Can view and edit, but not delete
        { permission_code: PERMISSIONS.USER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.USER_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.USER_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Role Management - View only
        { permission_code: PERMISSIONS.ROLE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Reports - Full access
        { permission_code: PERMISSIONS.REPORTS.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.GENERATE.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.EXPORT.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Dashboard - View
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Settings - View only
        { permission_code: PERMISSIONS.SETTINGS.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Audit Logs - View only
        { permission_code: PERMISSIONS.AUDIT_LOGS.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.FLEET_MANAGER]: () => [
        // Tire Management - Full control for fleet operations
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.ASSIGN.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.RETREAD.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.DISPOSE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        
        // Vehicle Management - Full control
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Tire Movement - Full control
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Purchase Orders - View only, can create requests
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Inventory - View only
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Reports - Generate fleet reports
        { permission_code: PERMISSIONS.REPORTS.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.GENERATE.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Dashboard - View
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.PURCHASE_MANAGER]: () => [
        // Purchase Orders - Full control
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.APPROVE.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.RECEIVE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Suppliers - Full control
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.EDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.MANAGE_LEDGER.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // GRN Management - Full control
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VERIFY.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        
        // Inventory - View only for stock checking
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.CATALOG.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Reports - Purchase related
        { permission_code: PERMISSIONS.REPORTS.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.GENERATE.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Dashboard - View
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.INVENTORY_CLERK]: () => [
        // Inventory Management - Full control for inventory operations
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.TRANSFER.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.AUDIT.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.CATALOG.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Tire Management - Basic operations
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // GRN Management - Can receive goods
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Tire Movement - Record movements
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Purchase Orders - View only
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Suppliers - View only
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Dashboard - View
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.MECHANIC]: () => [
        // Tire Management - Assignment only
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.ASSIGN.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Vehicle Management - View only
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Tire Movement - Record installations/removals
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.CREATE.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Inventory - Check stock
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.ACCOUNTANT]: () => [
        // Accounting - Full control
        { permission_code: PERMISSIONS.ACCOUNTING.VIEW.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.ACCOUNTING.CREATE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.ACCOUNTING.APPROVE.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        { permission_code: PERMISSIONS.ACCOUNTING.POST.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 1 },
        
        // Suppliers - View and manage ledger
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.MANAGE_LEDGER.code, can_view: 1, can_create: 1, can_edit: 1, can_delete: 0, can_approve: 0 },
        
        // Purchase Orders - View for verification
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // GRN - View for invoice matching
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Reports - Financial reports
        { permission_code: PERMISSIONS.REPORTS.VIEW.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.GENERATE.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.EXPORT.code, can_view: 1, can_create: 1, can_edit: 0, can_delete: 0, can_approve: 0 },
        
        // Dashboard - View
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ],
    
    [SYSTEM_ROLES.VIEWER]: () => [
        // Read-only access to most modules
        { permission_code: PERMISSIONS.TIRE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.VEHICLE_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.INVENTORY_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.PURCHASE_ORDER.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.SUPPLIER_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.GRN_MANAGEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.TIRE_MOVEMENT.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.REPORTS.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 },
        { permission_code: PERMISSIONS.DASHBOARD.VIEW.code, can_view: 1, can_create: 0, can_edit: 0, can_delete: 0, can_approve: 0 }
    ]
};

// Helper functions
function getAllPermissions() {
    const permissions = [];
    for (const category in PERMISSIONS) {
        for (const key in PERMISSIONS[category]) {
            const perm = PERMISSIONS[category][key];
            permissions.push({
                code: perm.code,
                name: perm.name,
                category: perm.category,
                key: key.toLowerCase()
            });
        }
    }
    return permissions;
}

function getPermissionsGroupedByCategory() {
    const grouped = {};
    for (const permission of getAllPermissions()) {
        const category = permission.category;
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(permission);
    }
    return grouped;
}

/**
 * Get default permissions for a specific role
 * @param {string} roleName - Name of the system role
 * @returns {Array} Array of permission objects with access controls
 */
function getDefaultPermissionsForRole(roleName) {
    if (DEFAULT_ROLE_PERMISSIONS[roleName]) {
        return DEFAULT_ROLE_PERMISSIONS[roleName]();
    }
    return [];
}

/**
 * Check if a role is a system role
 * @param {string} roleName - Role name to check
 * @returns {boolean} True if it's a system role
 */
function isSystemRole(roleName) {
    return Object.values(SYSTEM_ROLES).includes(roleName);
}

/**
 * Get all system role names
 * @returns {Array} Array of system role names
 */
function getAllSystemRoles() {
    return Object.values(SYSTEM_ROLES);
}

/**
 * Validate if a role has all required permissions for its function
 * @param {string} roleName - Role name
 * @param {Array} permissions - Array of permission objects
 * @returns {Object} Validation result { isValid: boolean, missing: Array }
 */
function validateRolePermissions(roleName, permissions) {
    if (!isSystemRole(roleName)) {
        return { isValid: true, missing: [] }; // Custom roles can have any permissions
    }
    
    const defaultPerms = getDefaultPermissionsForRole(roleName);
    const missing = [];
    
    // Check if all default permissions are present
    for (const defaultPerm of defaultPerms) {
        const found = permissions.find(p => p.permission_code === defaultPerm.permission_code);
        if (!found) {
            missing.push(defaultPerm.permission_code);
        }
    }
    
    return {
        isValid: missing.length === 0,
        missing
    };
}

module.exports = {
    PERMISSIONS,
    SYSTEM_ROLES,
    DEFAULT_ROLE_PERMISSIONS,
    getAllPermissions,
    getPermissionsGroupedByCategory,
    getDefaultPermissionsForRole,
    isSystemRole,
    getAllSystemRoles,
    validateRolePermissions
};