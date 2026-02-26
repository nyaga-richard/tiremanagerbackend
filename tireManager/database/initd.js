const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getAllPermissions, DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } = require('../config/permissions-config');
const bcrypt = require('bcrypt'); // You'll need to install this: npm install bcrypt

// Create database connection
const dbPath = path.join(__dirname, '..', 'database', 'tires.db');
// Ensure database directory exists
const fs = require('fs');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

// Utility functions
async function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

async function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

async function allQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Main table creation
async function createTables() {
    console.log('\n📦 Creating tables...');
    
    const tables = [
        // Basic reference tables
        `CREATE TABLE IF NOT EXISTS roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT,
            is_system_role BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role_id INTEGER,
            department TEXT,
            is_active BOOLEAN DEFAULT 1,
            last_login TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL
        )`,
        
        `CREATE TABLE IF NOT EXISTS suppliers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT CHECK(type IN ('TIRE', 'RETREAD')) NOT NULL,
            contact_person TEXT,
            phone TEXT,
            email TEXT,
            address TEXT,
            balance REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Purchase orders
        `CREATE TABLE IF NOT EXISTS purchase_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po_number TEXT UNIQUE NOT NULL,
            supplier_id INTEGER NOT NULL,
            po_date DATE NOT NULL,
            expected_delivery_date DATE,
            delivery_date DATE,
            status TEXT CHECK(status IN (
                'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 
                'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'CLOSED'
            )) DEFAULT 'DRAFT',
            total_amount REAL DEFAULT 0,
            tax_amount REAL DEFAULT 0,
            shipping_amount REAL DEFAULT 0,
            final_amount REAL DEFAULT 0,
            notes TEXT,
            terms TEXT,
            shipping_address TEXT,
            billing_address TEXT,
            created_by INTEGER NOT NULL,
            approved_by INTEGER,
            approved_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS purchase_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po_id INTEGER NOT NULL,
            size TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT CHECK(type IN ('NEW', 'RETREADED')) DEFAULT 'NEW',
            quantity INTEGER NOT NULL CHECK(quantity > 0),
            received_quantity INTEGER DEFAULT 0,
            unit_price REAL NOT NULL,
            line_total REAL GENERATED ALWAYS AS (quantity * unit_price) VIRTUAL,
            received_total REAL GENERATED ALWAYS AS (received_quantity * unit_price) VIRTUAL,
            remaining_quantity INTEGER GENERATED ALWAYS AS (quantity - received_quantity) VIRTUAL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
        )`,
        
        // Retread orders
        `CREATE TABLE IF NOT EXISTS retread_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_number TEXT UNIQUE NOT NULL,
            supplier_id INTEGER NOT NULL,
            status TEXT DEFAULT 'DRAFT' CHECK(status IN (
                'DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RECEIVED', 'PARTIALLY_RECEIVED'
            )),
            total_tires INTEGER DEFAULT 0,
            total_cost REAL DEFAULT 0,
            expected_completion_date DATE,
            sent_date DATE,
            received_date DATE,
            notes TEXT,
            created_by INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retread_order_id INTEGER NOT NULL,
            tire_id INTEGER NOT NULL,
            cost REAL,
            status TEXT DEFAULT 'PENDING',
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(retread_order_id, tire_id),
            FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (tire_id) REFERENCES tires(id) ON DELETE CASCADE
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_receiving (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retread_order_id INTEGER NOT NULL,
            received_date DATE NOT NULL,
            received_by INTEGER NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (received_by) REFERENCES users(id),
            FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_received_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receiving_id INTEGER NOT NULL,
            tire_id INTEGER NOT NULL,
            received_depth REAL,
            quality TEXT DEFAULT 'GOOD' CHECK(quality IN ('GOOD', 'ACCEPTABLE', 'POOR')),
            status TEXT NOT NULL CHECK(status IN ('RECEIVED', 'REJECTED')),
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (receiving_id) REFERENCES retread_receiving(id) ON DELETE CASCADE,
            FOREIGN KEY (tire_id) REFERENCES tires(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retread_order_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            note TEXT,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        
        // Goods Received Notes
        `CREATE TABLE IF NOT EXISTS goods_received_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grn_number TEXT UNIQUE NOT NULL,
            po_id INTEGER,
            retread_order_id INTEGER,
            receipt_date DATE NOT NULL,
            received_by INTEGER NOT NULL,
            supplier_invoice_number TEXT,
            delivery_note_number TEXT,
            vehicle_number TEXT,
            driver_name TEXT,
            notes TEXT,
            status TEXT CHECK(status IN ('DRAFT', 'COMPLETED', 'CANCELLED')) DEFAULT 'DRAFT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
            FOREIGN KEY (received_by) REFERENCES users(id),
            FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS grn_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grn_id INTEGER NOT NULL,
            po_item_id INTEGER,
            retread_order_item_id INTEGER,
            quantity_received INTEGER NOT NULL CHECK(quantity_received > 0),
            unit_cost REAL NOT NULL,
            batch_number TEXT,
            serial_numbers TEXT,
            brand TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id) ON DELETE CASCADE,
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
            FOREIGN KEY (retread_order_item_id) REFERENCES retread_order_items(id)
        )`,
        
        // Tires table - COMPREHENSIVE with disposal columns
        `CREATE TABLE IF NOT EXISTS tires (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serial_number TEXT UNIQUE NOT NULL,
            size TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT CHECK(type IN ('NEW', 'RETREADED')) DEFAULT 'NEW',
            status TEXT DEFAULT 'IN_STORE' CHECK(status IN (
                'IN_STORE', 'ON_VEHICLE', 'AWAITING_RETREAD', 
                'AT_RETREAD_SUPPLIER', 'USED_STORE', 'DISPOSED', 'SCRAP'
            )),
            purchase_cost REAL,
            supplier_id INTEGER,
            purchase_date DATE,
            current_location TEXT,
            po_item_id INTEGER,
            grn_id INTEGER,
            grn_item_id INTEGER,
            retread_count INTEGER DEFAULT 0,
            -- Disposal columns
            disposal_date DATE,
            disposal_reason TEXT,
            disposal_method TEXT CHECK(disposal_method IN ('DISPOSAL', 'SCRAP', 'RECYCLE', 'RETURN_TO_SUPPLIER')),
            disposal_authorized_by INTEGER,
            disposal_notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id),
            FOREIGN KEY (grn_item_id) REFERENCES grn_items(id),
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (disposal_authorized_by) REFERENCES users(id)
        )`,
        
        // Inventory catalog
        `CREATE TABLE IF NOT EXISTS inventory_catalog (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            size TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT CHECK(type IN ('NEW', 'RETREADED')) DEFAULT 'NEW',
            current_stock INTEGER DEFAULT 0,
            min_stock INTEGER DEFAULT 0,
            max_stock INTEGER,
            reorder_point INTEGER,
            last_purchase_date DATE,
            last_purchase_price REAL,
            average_cost REAL,
            supplier_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(size, brand, model, type),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`,
        
        // Vehicles
        `CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_number TEXT UNIQUE NOT NULL,
            make TEXT,
            model TEXT,
            year INTEGER,
            wheel_config TEXT,
            current_odometer REAL DEFAULT 0,
            status TEXT DEFAULT 'ACTIVE',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS wheel_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL,
            position_code TEXT NOT NULL,
            position_name TEXT NOT NULL,
            axle_number INTEGER,
            is_trailer BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vehicle_id, position_code),
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        )`,
        
        // Tire assignments
        `CREATE TABLE IF NOT EXISTS tire_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tire_id INTEGER NOT NULL,
            vehicle_id INTEGER NOT NULL,
            position_id INTEGER NOT NULL,
            install_date DATE NOT NULL,
            removal_date DATE,
            install_odometer REAL NOT NULL,
            removal_odometer REAL,
            reason_for_change TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tire_id) REFERENCES tires(id),
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
            FOREIGN KEY (position_id) REFERENCES wheel_positions(id)
        )`,
        
        // Tire movements - UPDATED with DISPOSAL_REVERSAL
        `CREATE TABLE IF NOT EXISTS tire_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tire_id INTEGER NOT NULL,
            from_location TEXT NOT NULL,
            to_location TEXT NOT NULL,
            movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            movement_type TEXT NOT NULL CHECK(movement_type IN (
                'PURCHASE_TO_STORE',
                'STORE_TO_VEHICLE',
                'VEHICLE_TO_STORE',
                'STORE_TO_RETREAD_SUPPLIER',
                'RETREAD_SUPPLIER_TO_STORE',
                'STORE_TO_DISPOSAL',
                'DISPOSAL_REVERSAL',
                'INTERNAL_TRANSFER'
            )),
            reference_id TEXT,
            reference_type TEXT,
            po_item_id INTEGER,
            grn_id INTEGER,
            user_id TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            supplier_id INTEGER,
            vehicle_id INTEGER,
            supplier_name TEXT,
            vehicle_number TEXT,
            FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id),
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (tire_id) REFERENCES tires(id),
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        )`,
        
        // Supplier ledger
        `CREATE TABLE IF NOT EXISTS supplier_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER NOT NULL,
            date DATE NOT NULL,
            description TEXT NOT NULL,
            transaction_type TEXT CHECK(transaction_type IN ('PURCHASE', 'PAYMENT', 'RETREAD_SERVICE')) NOT NULL,
            amount REAL NOT NULL,
            reference_number TEXT,
            created_by TEXT,
            po_id INTEGER,
            grn_id INTEGER,
            accounting_transaction_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
            FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id)
        )`,
        
        // PO Receipts
        `CREATE TABLE IF NOT EXISTS po_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            po_id INTEGER NOT NULL,
            po_item_id INTEGER NOT NULL,
            receipt_date DATE NOT NULL,
            quantity_received INTEGER NOT NULL,
            unit_cost REAL,
            batch_number TEXT,
            received_by INTEGER NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (po_id) REFERENCES purchase_orders(id),
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id)
        )`,
        
        // Accounting tables
        `CREATE TABLE IF NOT EXISTS accounting_transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_date DATE NOT NULL,
            posting_date DATE NOT NULL,
            transaction_number TEXT UNIQUE NOT NULL,
            reference_number TEXT,
            description TEXT NOT NULL,
            transaction_type TEXT CHECK(transaction_type IN (
                'PURCHASE_INVOICE', 'PAYMENT', 'JOURNAL_ENTRY', 'CREDIT_NOTE'
            )) NOT NULL,
            total_amount REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            status TEXT CHECK(status IN ('DRAFT', 'POSTED', 'VOID', 'REVERSED')) DEFAULT 'DRAFT',
            supplier_id INTEGER,
            customer_id INTEGER,
            related_grn_id INTEGER,
            related_po_id INTEGER,
            created_by INTEGER NOT NULL,
            approved_by INTEGER,
            posted_by INTEGER,
            posted_date TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (related_grn_id) REFERENCES goods_received_notes(id) ON DELETE SET NULL,
            FOREIGN KEY (related_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
        )`,
        
        `CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            transaction_id INTEGER NOT NULL,
            account_code TEXT NOT NULL,
            account_name TEXT NOT NULL,
            debit REAL DEFAULT 0,
            credit REAL DEFAULT 0,
            description TEXT,
            cost_center TEXT,
            department TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (transaction_id) REFERENCES accounting_transactions(id) ON DELETE CASCADE
        )`,
        
        `CREATE TABLE IF NOT EXISTS chart_of_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT UNIQUE NOT NULL,
            account_name TEXT NOT NULL,
            account_type TEXT CHECK(account_type IN (
                'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
            )) NOT NULL,
            sub_type TEXT,
            normal_balance TEXT CHECK(normal_balance IN ('DEBIT', 'CREDIT')),
            is_active BOOLEAN DEFAULT 1,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        // Permissions and roles
        `CREATE TABLE IF NOT EXISTS permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS role_permissions (
            role_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            can_view BOOLEAN DEFAULT 0,
            can_create BOOLEAN DEFAULT 0,
            can_edit BOOLEAN DEFAULT 0,
            can_delete BOOLEAN DEFAULT 0,
            can_approve BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (role_id, permission_id),
            FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
            FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        )`,
        
        // User sessions and security
        `CREATE TABLE IF NOT EXISTS user_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            session_token TEXT UNIQUE NOT NULL,
            device_info TEXT,
            ip_address TEXT,
            expires_at TIMESTAMP NOT NULL,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        
        `CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            is_used BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,
        
        // Audit and logging
        `CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            old_values TEXT,
            new_values TEXT,
            ip_address TEXT,
            user_agent TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        )`,
        
        // System settings
        `CREATE TABLE IF NOT EXISTS system_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            company_address TEXT,
            company_phone TEXT,
            company_email TEXT,
            company_website TEXT,
            company_tax_id TEXT,
            company_logo TEXT,
            fiscal_year_start DATE,
            fiscal_year_end DATE,
            date_format TEXT DEFAULT 'MMM dd, yyyy',
            time_format TEXT DEFAULT 'HH:mm:ss',
            timezone TEXT DEFAULT 'Africa/Nairobi',
            currency TEXT DEFAULT 'KES',
            currency_symbol TEXT DEFAULT 'KSH',
            vat_rate REAL DEFAULT 16,
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS email_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            smtp_host TEXT,
            smtp_port INTEGER,
            smtp_encryption TEXT CHECK(smtp_encryption IN ('tls', 'ssl', 'none')) DEFAULT 'tls',
            smtp_username TEXT,
            smtp_password TEXT,
            from_email TEXT,
            from_name TEXT,
            reply_to TEXT,
            enabled BOOLEAN DEFAULT 0,
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS notification_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_notifications BOOLEAN DEFAULT 1,
            system_notifications BOOLEAN DEFAULT 1,
            purchase_order_alerts BOOLEAN DEFAULT 1,
            low_stock_alerts BOOLEAN DEFAULT 1,
            retread_due_alerts BOOLEAN DEFAULT 1,
            vehicle_service_alerts BOOLEAN DEFAULT 1,
            user_login_alerts BOOLEAN DEFAULT 0,
            daily_summary BOOLEAN DEFAULT 0,
            weekly_report BOOLEAN DEFAULT 1,
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS backup_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            enabled BOOLEAN DEFAULT 1,
            frequency TEXT CHECK(frequency IN ('daily', 'weekly', 'monthly')) DEFAULT 'daily',
            retention_days INTEGER DEFAULT 30,
            backup_time TEXT DEFAULT '02:00',
            include_attachments BOOLEAN DEFAULT 1,
            last_backup TIMESTAMP,
            last_backup_size INTEGER,
            last_backup_status TEXT CHECK(last_backup_status IN ('success', 'failed')),
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS audit_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retention_days INTEGER DEFAULT 90,
            log_failed_logins BOOLEAN DEFAULT 1,
            log_successful_logins BOOLEAN DEFAULT 0,
            log_api_calls BOOLEAN DEFAULT 0,
            log_data_changes BOOLEAN DEFAULT 1,
            log_exports BOOLEAN DEFAULT 1,
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`,
        
        // Tax and payment
        `CREATE TABLE IF NOT EXISTS tax_rates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            rate REAL NOT NULL,
            type TEXT CHECK(type IN ('VAT', 'SERVICE', 'OTHER')) DEFAULT 'VAT',
            description TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS payment_terms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            days INTEGER NOT NULL,
            description TEXT,
            is_active BOOLEAN DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS system_settings_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setting_key TEXT UNIQUE NOT NULL,
            setting_value TEXT,
            description TEXT,
            updated_by INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (updated_by) REFERENCES users(id)
        )`
    ];

    for (let i = 0; i < tables.length; i++) {
        try {
            await runQuery(tables[i]);
            console.log(`  ✓ Table ${i + 1}/${tables.length} created/verified`);
        } catch (error) {
            console.error(`  ❌ Error creating table ${i + 1}:`, error.message);
        }
    }
}

// Create indexes for performance
async function createIndexes() {
    console.log('\n📊 Creating indexes...');
    
    const indexes = [
        // Tires indexes
        "CREATE INDEX IF NOT EXISTS idx_tires_serial ON tires(serial_number)",
        "CREATE INDEX IF NOT EXISTS idx_tires_status ON tires(status)",
        "CREATE INDEX IF NOT EXISTS idx_tires_size ON tires(size)",
        "CREATE INDEX IF NOT EXISTS idx_tires_po_item ON tires(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_tires_grn ON tires(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_tires_supplier ON tires(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_tires_type ON tires(type)",
        "CREATE INDEX IF NOT EXISTS idx_tires_retread_count ON tires(retread_count)",
        
        // Disposal indexes
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_date ON tires(disposal_date)",
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_reason ON tires(disposal_reason)",
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_method ON tires(disposal_method)",
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_authorized ON tires(disposal_authorized_by)",
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_status ON tires(status) WHERE status IN ('DISPOSED', 'SCRAP')",
        "CREATE INDEX IF NOT EXISTS idx_tires_disposal_composite ON tires(disposal_date, disposal_reason, disposal_method)",
        
        // Movements indexes
        "CREATE INDEX IF NOT EXISTS idx_movements_tire ON tire_movements(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_date ON tire_movements(movement_date)",
        "CREATE INDEX IF NOT EXISTS idx_movements_type ON tire_movements(movement_type)",
        "CREATE INDEX IF NOT EXISTS idx_movements_po_item ON tire_movements(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_grn ON tire_movements(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_supplier ON tire_movements(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_vehicle ON tire_movements(vehicle_id)",
        
        // Assignments indexes
        "CREATE INDEX IF NOT EXISTS idx_assignments_tire ON tire_assignments(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON tire_assignments(vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_active ON tire_assignments(removal_date) WHERE removal_date IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_assignments_dates ON tire_assignments(install_date, removal_date)",
        
        // Supplier ledger indexes
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger ON supplier_ledger(supplier_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_po ON supplier_ledger(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_grn ON supplier_ledger(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_accounting ON supplier_ledger(accounting_transaction_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_type ON supplier_ledger(transaction_type)",
        
        // Purchase orders indexes
        "CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number)",
        "CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(po_date)",
        "CREATE INDEX IF NOT EXISTS idx_po_created_by ON purchase_orders(created_by)",
        "CREATE INDEX IF NOT EXISTS idx_po_approved_by ON purchase_orders(approved_by)",
        
        // Purchase order items indexes
        "CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_items_size ON purchase_order_items(size)",
        
        // Retread orders indexes
        "CREATE INDEX IF NOT EXISTS idx_retread_orders_number ON retread_orders(order_number)",
        "CREATE INDEX IF NOT EXISTS idx_retread_orders_status ON retread_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_retread_orders_supplier ON retread_orders(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_retread_orders_dates ON retread_orders(sent_date, received_date)",
        
        "CREATE INDEX IF NOT EXISTS idx_retread_items_order ON retread_order_items(retread_order_id)",
        "CREATE INDEX IF NOT EXISTS idx_retread_items_tire ON retread_order_items(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_retread_timeline_order ON retread_timeline(retread_order_id)",
        
        // Inventory catalog indexes
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_size ON inventory_catalog(size, brand, model, type)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_stock ON inventory_catalog(current_stock)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_active ON inventory_catalog(is_active)",
        
        // PO receipts indexes
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_po ON po_receipts(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_item ON po_receipts(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_date ON po_receipts(receipt_date)",
        
        // GRN indexes
        "CREATE INDEX IF NOT EXISTS idx_grn_number ON goods_received_notes(grn_number)",
        "CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_received_notes(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_retread ON goods_received_notes(retread_order_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_date ON goods_received_notes(receipt_date)",
        "CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_received_notes(status)",
        
        // GRN items indexes
        "CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_items_po_item ON grn_items(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_items_retread_item ON grn_items(retread_order_item_id)",
        
        // Users indexes
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)",
        "CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)",
        
        // Audit log indexes
        "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)",
        
        // Suppliers indexes
        "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)",
        "CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(type)",
        "CREATE INDEX IF NOT EXISTS idx_suppliers_balance ON suppliers(balance)",
        
        // Vehicles indexes
        "CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number)",
        "CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status)",
        
        // Wheel positions indexes
        "CREATE INDEX IF NOT EXISTS idx_wheel_positions_vehicle ON wheel_positions(vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_wheel_positions_code ON wheel_positions(position_code)",
        
        // User sessions indexes
        "CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at)",
        
        // Password resets indexes
        "CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token)",
        "CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)",
        
        // Accounting transaction indexes
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_supplier ON accounting_transactions(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_grn ON accounting_transactions(related_grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_date ON accounting_transactions(transaction_date)",
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_number ON accounting_transactions(transaction_number)",
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_type ON accounting_transactions(transaction_type)",
        "CREATE INDEX IF NOT EXISTS idx_accounting_transactions_status ON accounting_transactions(status)",
        
        // Journal entries indexes
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id)",
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_code)",
        
        // Chart of accounts indexes
        "CREATE INDEX IF NOT EXISTS idx_chart_accounts_code ON chart_of_accounts(account_code)",
        "CREATE INDEX IF NOT EXISTS idx_chart_accounts_type ON chart_of_accounts(account_type)",
        "CREATE INDEX IF NOT EXISTS idx_chart_accounts_active ON chart_of_accounts(is_active)"
    ];

    for (let i = 0; i < indexes.length; i++) {
        try {
            await runQuery(indexes[i]);
            if ((i + 1) % 10 === 0) {
                console.log(`  ✓ Created ${i + 1}/${indexes.length} indexes`);
            }
        } catch (error) {
            console.error(`  ❌ Error creating index ${i + 1}:`, error.message);
        }
    }
    console.log(`  ✓ All ${indexes.length} indexes created/verified`);
}

// Create views for reporting
async function createViews() {
    console.log('\n👁️ Creating views...');
    
    const views = [
        // Monthly disposal summary view
        `
        CREATE VIEW IF NOT EXISTS v_disposal_monthly_summary AS
        SELECT 
            strftime('%Y-%m', disposal_date) as month,
            COUNT(*) as total_disposed,
            SUM(CASE WHEN disposal_method = 'SCRAP' THEN 1 ELSE 0 END) as scrap_count,
            SUM(CASE WHEN disposal_method = 'DISPOSAL' THEN 1 ELSE 0 END) as disposal_count,
            SUM(CASE WHEN disposal_method = 'RECYCLE' THEN 1 ELSE 0 END) as recycle_count,
            SUM(purchase_cost) as total_value,
            AVG(retread_count) as avg_retread_count,
            COUNT(DISTINCT disposal_reason) as unique_reasons
        FROM tires
        WHERE disposal_date IS NOT NULL
        GROUP BY strftime('%Y-%m', disposal_date)
        `,
        
        // Disposal reason analysis view
        `
        CREATE VIEW IF NOT EXISTS v_disposal_reason_analysis AS
        SELECT 
            disposal_reason,
            COUNT(*) as count,
            SUM(purchase_cost) as total_cost,
            AVG(retread_count) as avg_retread_count,
            MIN(disposal_date) as first_disposal,
            MAX(disposal_date) as last_disposal
        FROM tires
        WHERE disposal_reason IS NOT NULL
        GROUP BY disposal_reason
        ORDER BY count DESC
        `,
        
        // Tire lifecycle summary view
        `
        CREATE VIEW IF NOT EXISTS v_tire_lifecycle_summary AS
        SELECT 
            CASE 
                WHEN status IN ('DISPOSED', 'SCRAP') THEN 'Disposed'
                WHEN status = 'ON_VEHICLE' THEN 'In Use'
                WHEN status = 'IN_STORE' THEN 'In Stock - New'
                WHEN status = 'USED_STORE' THEN 'In Stock - Used'
                WHEN status = 'AWAITING_RETREAD' THEN 'Awaiting Retread'
                WHEN status = 'AT_RETREAD_SUPPLIER' THEN 'At Retread Supplier'
                ELSE status
            END as lifecycle_stage,
            COUNT(*) as count,
            SUM(purchase_cost) as total_value,
            AVG(retread_count) as avg_retread_count
        FROM tires
        GROUP BY lifecycle_stage
        `,
        
        // Tire inventory by size view
        `
        CREATE VIEW IF NOT EXISTS v_tire_inventory_by_size AS
        SELECT 
            size,
            COUNT(CASE WHEN status = 'IN_STORE' AND type = 'NEW' THEN 1 END) as new_in_stock,
            COUNT(CASE WHEN status = 'IN_STORE' AND type = 'RETREADED' THEN 1 END) as retreaded_in_stock,
            COUNT(CASE WHEN status = 'USED_STORE' THEN 1 END) as used_in_stock,
            COUNT(CASE WHEN status = 'ON_VEHICLE' THEN 1 END) as on_vehicle,
            COUNT(CASE WHEN status = 'AWAITING_RETREAD' THEN 1 END) as awaiting_retread,
            COUNT(CASE WHEN status = 'AT_RETREAD_SUPPLIER' THEN 1 END) as at_retreader,
            COUNT(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN 1 END) as disposed,
            COUNT(*) as total
        FROM tires
        GROUP BY size
        `,
        
        // Recent movements view
        `
        CREATE VIEW IF NOT EXISTS v_recent_movements AS
        SELECT 
            tm.*,
            t.serial_number,
            t.size as tire_size,
            t.brand as tire_brand
        FROM tire_movements tm
        JOIN tires t ON tm.tire_id = t.id
        ORDER BY tm.movement_date DESC
        LIMIT 1000
        `
    ];

    for (const view of views) {
        try {
            await runQuery(view);
            const viewName = view.match(/VIEW\s+(\S+)/)?.[1] || 'view';
            console.log(`  ✓ Created view: ${viewName}`);
        } catch (error) {
            console.error(`  ❌ Error creating view:`, error.message);
        }
    }
}

// Initialize chart of accounts
async function initializeChartOfAccounts() {
    console.log('\n💰 Initializing chart of accounts...');
    
    const accounts = [
        // Assets
        { code: '1000', name: 'Cash', type: 'ASSET', normal_balance: 'DEBIT', description: 'Cash in bank' },
        { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normal_balance: 'DEBIT', description: 'Amounts owed by customers' },
        { code: '1200', name: 'Inventory - New Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'New tire inventory' },
        { code: '1210', name: 'Inventory - Used Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'Used tire inventory' },
        { code: '1220', name: 'Inventory - Retreaded Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'Retreaded tire inventory' },
        { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', normal_balance: 'DEBIT', description: 'Prepaid items' },
        
        // Liabilities
        { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', normal_balance: 'CREDIT', description: 'Amounts owed to suppliers' },
        { code: '2100', name: 'Accrued Expenses', type: 'LIABILITY', normal_balance: 'CREDIT', description: 'Accrued liabilities' },
        { code: '2200', name: 'Tax Payable', type: 'LIABILITY', normal_balance: 'CREDIT', description: 'Taxes payable' },
        
        // Equity
        { code: '3000', name: 'Owner\'s Equity', type: 'EQUITY', normal_balance: 'CREDIT', description: 'Owner capital' },
        { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normal_balance: 'CREDIT', description: 'Accumulated profits' },
        
        // Revenue
        { code: '4000', name: 'Sales Revenue - New Tires', type: 'REVENUE', normal_balance: 'CREDIT', description: 'Revenue from new tire sales' },
        { code: '4100', name: 'Sales Revenue - Used Tires', type: 'REVENUE', normal_balance: 'CREDIT', description: 'Revenue from used tire sales' },
        { code: '4200', name: 'Service Revenue', type: 'REVENUE', normal_balance: 'CREDIT', description: 'Revenue from services' },
        
        // Expenses
        { code: '5000', name: 'Cost of Goods Sold - New Tires', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Cost of new tires sold' },
        { code: '5100', name: 'Cost of Goods Sold - Used Tires', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Cost of used tires sold' },
        { code: '5200', name: 'Purchases - New Tires', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Purchase of new tires' },
        { code: '5300', name: 'Retread Service Cost', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Cost of retread services' },
        { code: '5400', name: 'Shipping Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Shipping costs' },
        { code: '5500', name: 'Salaries Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Employee salaries' },
        { code: '5600', name: 'Rent Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Rent payments' },
        { code: '5700', name: 'Utilities Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Utility bills' },
        { code: '5800', name: 'Depreciation Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Asset depreciation' },
        { code: '5900', name: 'Interest Expense', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Interest payments' }
    ];

    for (const account of accounts) {
        try {
            await runQuery(
                `INSERT OR IGNORE INTO chart_of_accounts 
                (account_code, account_name, account_type, normal_balance, description)
                VALUES (?, ?, ?, ?, ?)`,
                [account.code, account.name, account.type, account.normal_balance, account.description]
            );
        } catch (error) {
            console.error(`  ❌ Error initializing account ${account.code}:`, error.message);
        }
    }
    console.log('  ✓ Chart of accounts initialized');
}

// Seed default permissions
async function seedPermissions() {
    console.log('\n🔐 Seeding permissions...');
    
    const permissions = getAllPermissions();
    
    for (const permission of permissions) {
        try {
            await runQuery(
                `INSERT OR IGNORE INTO permissions (category, code, name, description)
                 VALUES (?, ?, ?, ?)`,
                [permission.category, permission.code, permission.name, permission.description || '']
            );
        } catch (error) {
            console.error(`  ❌ Error seeding permission ${permission.code}:`, error.message);
        }
    }
    console.log(`  ✓ Seeded ${permissions.length} permissions`);
}

// Initialize system roles
async function initializeSystemRoles() {
    console.log('\n👥 Initializing system roles...');
    
    const roles = [
        { name: 'admin', description: 'System Administrator', is_system_role: 1 },
        { name: 'manager', description: 'Operations Manager', is_system_role: 1 },
        { name: 'storekeeper', description: 'Store Keeper', is_system_role: 1 },
        { name: 'technician', description: 'Service Technician', is_system_role: 1 },
        { name: 'viewer', description: 'Read-only User', is_system_role: 1 }
    ];

    for (const role of roles) {
        try {
            await runQuery(
                `INSERT OR IGNORE INTO roles (name, description, is_system_role)
                 VALUES (?, ?, ?)`,
                [role.name, role.description, role.is_system_role]
            );
        } catch (error) {
            console.error(`  ❌ Error creating role ${role.name}:`, error.message);
        }
    }
    console.log('  ✓ System roles initialized');
}

// Seed role permissions
async function seedRolePermissions() {
    console.log('\n🔑 Seeding role permissions...');
    
    try {
        // Get all roles and permissions
        const roles = await allQuery('SELECT id, name FROM roles');
        const permissions = await allQuery('SELECT id, code FROM permissions');
        
        const permissionMap = new Map(permissions.map(p => [p.code, p.id]));
        
        for (const role of roles) {
            const defaultPerms = DEFAULT_ROLE_PERMISSIONS[role.name] || DEFAULT_ROLE_PERMISSIONS.viewer;
            
            for (const [permCode, actions] of Object.entries(defaultPerms)) {
                const permissionId = permissionMap.get(permCode);
                if (!permissionId) continue;
                
                await runQuery(
                    `INSERT OR REPLACE INTO role_permissions 
                     (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        role.id,
                        permissionId,
                        actions.view ? 1 : 0,
                        actions.create ? 1 : 0,
                        actions.edit ? 1 : 0,
                        actions.delete ? 1 : 0,
                        actions.approve ? 1 : 0
                    ]
                );
            }
        }
        console.log('  ✓ Role permissions seeded');
    } catch (error) {
        console.error('  ❌ Error seeding role permissions:', error.message);
    }
}

// Create default admin user
async function createDefaultAdmin() {
    console.log('\n👤 Creating default admin user...');
    
    try {
        const adminRole = await getQuery('SELECT id FROM roles WHERE name = ?', ['admin']);
        
        if (adminRole) {
            const passwordHash = await bcrypt.hash('admin123', 10);
            
            await runQuery(
                `INSERT OR IGNORE INTO users 
                 (username, email, password_hash, full_name, role_id, department, is_active)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                ['admin', 'admin@example.com', passwordHash, 'System Administrator', adminRole.id, 'IT', 1]
            );
            console.log('  ✓ Default admin user created (username: admin, password: admin123)');
        }
    } catch (error) {
        console.error('  ❌ Error creating admin user:', error.message);
    }
}

// Initialize system settings
async function initializeSystemSettings() {
    console.log('\n⚙️ Initializing system settings...');
    
    try {
        await runQuery(
            `INSERT OR IGNORE INTO system_settings 
             (company_name, company_address, company_phone, company_email, currency, currency_symbol)
             VALUES (?, ?, ?, ?, ?, ?)`,
            ['Tire Management System', '123 Main Street', '+254 700 000000', 'info@tirems.com', 'KES', 'KSH']
        );
        
        // Default notification settings
        await runQuery(
            `INSERT OR IGNORE INTO notification_settings 
             (email_notifications, system_notifications, purchase_order_alerts, low_stock_alerts)
             VALUES (?, ?, ?, ?)`,
            [1, 1, 1, 1]
        );
        
        // Default audit settings
        await runQuery(
            `INSERT OR IGNORE INTO audit_settings 
             (retention_days, log_failed_logins, log_data_changes)
             VALUES (?, ?, ?)`,
            [90, 1, 1]
        );
        
        console.log('  ✓ System settings initialized');
    } catch (error) {
        console.error('  ❌ Error initializing system settings:', error.message);
    }
}

// Create sample data for testing
async function createSampleData() {
    console.log('\n📝 Creating sample data for testing...');
    
    try {
        // Sample supplier
        const supplierResult = await runQuery(
            `INSERT OR IGNORE INTO suppliers (name, type, contact_person, phone, email)
             VALUES (?, ?, ?, ?, ?)`,
            ['Sample Tire Co.', 'TIRE', 'John Doe', '+254 700 111111', 'john@sampletire.com']
        );
        
        // Sample vehicle
        await runQuery(
            `INSERT OR IGNORE INTO vehicles (vehicle_number, make, model, year, wheel_config)
             VALUES (?, ?, ?, ?, ?)`,
            ['KAA 123A', 'Toyota', 'Hilux', 2022, '6x4']
        );
        
        // Get vehicle ID for wheel positions
        const vehicle = await getQuery('SELECT id FROM vehicles WHERE vehicle_number = ?', ['KAA 123A']);
        
        if (vehicle) {
            // Sample wheel positions
            const positions = [
                ['FL', 'Front Left', 1, 0],
                ['FR', 'Front Right', 1, 0],
                ['RL1', 'Rear Left Inner', 2, 0],
                ['RL2', 'Rear Left Outer', 2, 0],
                ['RR1', 'Rear Right Inner', 2, 0],
                ['RR2', 'Rear Right Outer', 2, 0]
            ];
            
            for (const [code, name, axle, isTrailer] of positions) {
                await runQuery(
                    `INSERT OR IGNORE INTO wheel_positions 
                     (vehicle_id, position_code, position_name, axle_number, is_trailer)
                     VALUES (?, ?, ?, ?, ?)`,
                    [vehicle.id, code, name, axle, isTrailer]
                );
            }
        }
        
        console.log('  ✓ Sample data created');
    } catch (error) {
        console.error('  ❌ Error creating sample data:', error.message);
    }
}

// Main initialization function
async function initializeDatabase() {
    console.log('🚀 Starting database initialization...');
    console.log('========================================');
    
    try {
        // Enable foreign keys
        await runQuery('PRAGMA foreign_keys = ON');
        console.log('✓ Foreign keys enabled');
        
        // Create all tables
        await createTables();
        
        // Create indexes
        await createIndexes();
        
        // Create views
        await createViews();
        
        // Initialize chart of accounts
        await initializeChartOfAccounts();
        
        // Seed permissions and roles
        // await seedPermissions();
        // await initializeSystemRoles();
        // await seedRolePermissions();
        
        // // Create default admin
        // await createDefaultAdmin();
        
        // // Initialize system settings
        // await initializeSystemSettings();
        
        // // Create sample data
        // await createSampleData();
        
        console.log('\n========================================');
        console.log('✅ Database initialization complete!');
        console.log('========================================');
        
    } catch (error) {
        console.error('\n❌ Database initialization error:', error);
    } finally {
        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('📁 Database connection closed.');
            }
        });
    }
}

// Export functions for use in other modules
module.exports = {
    runQuery,
    getQuery,
    allQuery,
    db
};