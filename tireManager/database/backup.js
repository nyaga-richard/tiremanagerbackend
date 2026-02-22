



const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { getAllPermissions, DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } = require('../config/permissions-config');

// Create database connection
const dbPath = path.join(__dirname, '..', 'database', 'tires.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

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

async function createTables() {
    console.log('Creating tables...');
    
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
                'DRAFT', 
                'PENDING_APPROVAL', 
                'APPROVED', 
                'ORDERED', 
                'PARTIALLY_RECEIVED', 
                'FULLY_RECEIVED', 
                'CANCELLED', 
                'CLOSED'
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
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (approved_by) REFERENCES users(id)
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
        
        // Retread Orders
        `CREATE TABLE IF NOT EXISTS retread_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ro_number TEXT UNIQUE NOT NULL,
            supplier_id INTEGER NOT NULL,
            ro_date DATE NOT NULL,
            expected_delivery_date DATE,
            delivery_date DATE,
            status TEXT CHECK(status IN (
                'DRAFT',
                'PENDING_APPROVAL',
                'APPROVED',
                'ORDERED',
                'PARTIALLY_RECEIVED',
                'FULLY_RECEIVED',
                'CANCELLED',
                'CLOSED'
            )) DEFAULT 'DRAFT',
            total_quantity INTEGER DEFAULT 0,
            accepted_quantity INTEGER DEFAULT 0,
            rejected_quantity INTEGER DEFAULT 0,
            total_cost REAL DEFAULT 0,
            notes TEXT,
            terms TEXT,
            shipping_address TEXT,
            created_by INTEGER NOT NULL,
            approved_by INTEGER,
            approved_date TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (approved_by) REFERENCES users(id),
            CHECK (supplier_id IS NULL OR (SELECT type FROM suppliers WHERE id = supplier_id) = 'RETREAD')
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ro_id INTEGER NOT NULL,
            tire_id INTEGER NOT NULL,
            size TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT CHECK(type IN ('NEW', 'RETREADED')) DEFAULT 'RETREADED',
            quantity INTEGER DEFAULT 1 CHECK(quantity > 0),
            unit_cost REAL NOT NULL,
            line_total REAL GENERATED ALWAYS AS (quantity * unit_cost) VIRTUAL,
            status TEXT CHECK(status IN (
                'PENDING',
                'ACCEPTED',
                'REJECTED',
                'RECEIVED'
            )) DEFAULT 'PENDING',
            rejection_reason TEXT,
            received_quantity INTEGER DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ro_id) REFERENCES retread_orders(id) ON DELETE CASCADE,
            FOREIGN KEY (tire_id) REFERENCES tires(id)
        )`,
        
        // Retread Receipts
        `CREATE TABLE IF NOT EXISTS retread_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_number TEXT UNIQUE NOT NULL,
            ro_id INTEGER NOT NULL,
            receipt_date DATE NOT NULL,
            received_by INTEGER NOT NULL,
            supplier_invoice_number TEXT,
            delivery_note_number TEXT,
            vehicle_number TEXT,
            driver_name TEXT,
            notes TEXT,
            status TEXT CHECK(status IN ('DRAFT', 'COMPLETED', 'CANCELLED')) DEFAULT 'DRAFT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ro_id) REFERENCES retread_orders(id),
            FOREIGN KEY (received_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS retread_receipt_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_id INTEGER NOT NULL,
            ro_item_id INTEGER NOT NULL,
            tire_id INTEGER NOT NULL,
            status TEXT CHECK(status IN ('ACCEPTED', 'REJECTED')) NOT NULL,
            rejection_reason TEXT,
            unit_cost REAL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (receipt_id) REFERENCES retread_receipts(id) ON DELETE CASCADE,
            FOREIGN KEY (ro_item_id) REFERENCES retread_order_items(id),
            FOREIGN KEY (tire_id) REFERENCES tires(id)
        )`,
        
        // Tires table
        `CREATE TABLE IF NOT EXISTS tires (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            serial_number TEXT UNIQUE NOT NULL,
            size TEXT NOT NULL,
            brand TEXT,
            model TEXT,
            type TEXT CHECK(type IN ('NEW', 'RETREADED')) DEFAULT 'NEW',
            status TEXT CHECK(status IN (
                'IN_STORE', 
                'ON_VEHICLE', 
                'AWAITING_RETREAD', 
                'AT_RETREAD_SUPPLIER', 
                'USED_STORE', 
                'DISPOSED'
            )) DEFAULT 'IN_STORE',
            purchase_cost REAL,
            supplier_id INTEGER,
            purchase_date DATE,
            current_location TEXT,
            po_item_id INTEGER REFERENCES purchase_order_items(id),
            grn_id INTEGER REFERENCES goods_received_notes(id),
            grn_item_id INTEGER REFERENCES grn_items(id),
            retread_count INTEGER DEFAULT 0,
            last_retread_date DATE,
            total_retread_cost REAL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`,
        
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
            po_id INTEGER REFERENCES purchase_orders(id),
            grn_id INTEGER REFERENCES goods_received_notes(id),
            ro_id INTEGER REFERENCES retread_orders(id),
            retread_receipt_id INTEGER REFERENCES retread_receipts(id),
            accounting_transaction_id INTEGER REFERENCES accounting_transactions(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
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
        
        // Tire movements (will be recreated with updated constraint)
        `CREATE TABLE IF NOT EXISTS tire_movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tire_id INTEGER NOT NULL,
            from_location TEXT NOT NULL,
            to_location TEXT NOT NULL,
            movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            movement_type TEXT CHECK(movement_type IN (
                'PURCHASE_TO_STORE',
                'STORE_TO_VEHICLE',
                'VEHICLE_TO_STORE',
                'STORE_TO_RETREAD_SUPPLIER',
                'RETREAD_SUPPLIER_TO_STORE',
                'STORE_TO_DISPOSAL',
                'INTERNAL_TRANSFER'
            )) NOT NULL,
            reference_id TEXT,
            reference_type TEXT,
            po_item_id INTEGER REFERENCES purchase_order_items(id),
            grn_id INTEGER REFERENCES goods_received_notes(id),
            user_id TEXT NOT NULL,
            notes TEXT,
            supplier_id INTEGER REFERENCES suppliers(id),
            vehicle_id INTEGER REFERENCES vehicles(id),
            supplier_name TEXT,
            vehicle_number TEXT,
            ro_id INTEGER REFERENCES retread_orders(id),
            ro_item_id INTEGER REFERENCES retread_order_items(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tire_id) REFERENCES tires(id)
        )`,
        
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
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
            FOREIGN KEY (received_by) REFERENCES users(id)
        )`,
        
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
        
        `CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            is_used BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS goods_received_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grn_number TEXT UNIQUE NOT NULL,
            po_id INTEGER NOT NULL,
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
            FOREIGN KEY (received_by) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS grn_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            grn_id INTEGER NOT NULL,
            po_item_id INTEGER NOT NULL,
            quantity_received INTEGER NOT NULL CHECK(quantity_received > 0),
            unit_cost REAL NOT NULL,
            batch_number TEXT,
            serial_numbers TEXT, -- JSON array of serial numbers
            brand TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id) ON DELETE CASCADE,
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
                'PURCHASE_INVOICE',
                'PAYMENT',
                'JOURNAL_ENTRY',
                'CREDIT_NOTE'
            )) NOT NULL,
            total_amount REAL NOT NULL,
            currency TEXT DEFAULT 'USD',
            status TEXT CHECK(status IN (
                'DRAFT',
                'POSTED',
                'VOID',
                'REVERSED'
            )) DEFAULT 'DRAFT',
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
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
            FOREIGN KEY (related_grn_id) REFERENCES goods_received_notes(id) ON DELETE SET NULL,
            FOREIGN KEY (related_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
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
                'ASSET',
                'LIABILITY',
                'EQUITY',
                'REVENUE',
                'EXPENSE'
            )) NOT NULL,
            sub_type TEXT,
            normal_balance TEXT CHECK(normal_balance IN ('DEBIT', 'CREDIT')),
            is_active BOOLEAN DEFAULT 1,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

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
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `CREATE TABLE IF NOT EXISTS audit_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            retention_days INTEGER DEFAULT 90,
            log_failed_logins BOOLEAN DEFAULT 1,
            log_successful_logins BOOLEAN DEFAULT 0,
            log_api_calls BOOLEAN DEFAULT 0,
            log_data_changes BOOLEAN DEFAULT 1,
            log_exports BOOLEAN DEFAULT 1,
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

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
            updated_by INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`
    ];

    for (let i = 0; i < tables.length; i++) {
        try {
            await runQuery(tables[i]);
            console.log(`Table ${i + 1} created/verified`);
        } catch (error) {
            console.error(`Error creating table ${i + 1}:`, error.message);
        }
    }
}

async function updateTireMovementsTable() {
    console.log('\nUpdating tire_movements table with retread fields...');
    
    try {
        // Check if we need to update the table
        const tableInfo = await allQuery('PRAGMA table_info(tire_movements)');
        const hasRoId = tableInfo.some(col => col.name === 'ro_id');
        
        if (!hasRoId) {
            // Create new table with updated structure
            await runQuery(`
                CREATE TABLE tire_movements_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tire_id INTEGER NOT NULL,
                    from_location TEXT NOT NULL,
                    to_location TEXT NOT NULL,
                    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    movement_type TEXT CHECK(movement_type IN (
                        'PURCHASE_TO_STORE',
                        'STORE_TO_VEHICLE',
                        'VEHICLE_TO_STORE',
                        'STORE_TO_RETREAD_SUPPLIER',
                        'RETREAD_SUPPLIER_TO_STORE',
                        'RETREAD_REJECTED_TO_STORE',
                        'STORE_TO_DISPOSAL',
                        'INTERNAL_TRANSFER'
                    )) NOT NULL,
                    reference_id TEXT,
                    reference_type TEXT,
                    po_item_id INTEGER REFERENCES purchase_order_items(id),
                    grn_id INTEGER REFERENCES goods_received_notes(id),
                    ro_id INTEGER REFERENCES retread_orders(id),
                    ro_item_id INTEGER REFERENCES retread_order_items(id),
                    supplier_id INTEGER REFERENCES suppliers(id),
                    vehicle_id INTEGER REFERENCES vehicles(id),
                    supplier_name TEXT,
                    vehicle_number TEXT,
                    user_id TEXT NOT NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tire_id) REFERENCES tires(id)
                )
            `);
            
            // Copy data from old table
            await runQuery(`
                INSERT INTO tire_movements_new (
                    id, tire_id, from_location, to_location, movement_date, movement_type,
                    reference_id, reference_type, po_item_id, grn_id, supplier_id, 
                    vehicle_id, supplier_name, vehicle_number, user_id, notes, created_at
                )
                SELECT 
                    id, tire_id, from_location, to_location, movement_date, movement_type,
                    reference_id, reference_type, po_item_id, grn_id, supplier_id,
                    vehicle_id, supplier_name, vehicle_number, user_id, notes, created_at
                FROM tire_movements
            `);
            
            // Drop old table and rename new one
            await runQuery('DROP TABLE tire_movements');
            await runQuery('ALTER TABLE tire_movements_new RENAME TO tire_movements');
            
            // Recreate indexes
            await createTireMovementsIndexes();
            
            console.log('✓ Updated tire_movements table with retread fields');
        } else {
            console.log('✓ tire_movements table already has retread fields');
        }
    } catch (error) {
        console.error('Error updating tire_movements table:', error.message);
    }
}

async function createTireMovementsIndexes() {
    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_movements_tire ON tire_movements(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_date ON tire_movements(movement_date)",
        "CREATE INDEX IF NOT EXISTS idx_movements_po_item ON tire_movements(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_grn ON tire_movements(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_ro ON tire_movements(ro_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_ro_item ON tire_movements(ro_item_id)"
    ];
    
    for (const index of indexes) {
        try {
            await runQuery(index);
        } catch (error) {
            console.error(`Error creating index: ${error.message}`);
        }
    }
}

async function addMissingColumns() {
    console.log('\nChecking for missing columns...');
    
    const columnUpdates = [
        { table: 'grn_items', column: 'brand', definition: 'TEXT' },
        { table: 'tire_movements', column: 'supplier_id', definition: 'INTEGER REFERENCES suppliers(id)' },
        { table: 'tire_movements', column: 'vehicle_id', definition: 'INTEGER REFERENCES vehicles(id)' },
        { table: 'tire_movements', column: 'supplier_name', definition: 'TEXT' },
        { table: 'tire_movements', column: 'vehicle_number', definition: 'TEXT' },
        { table: 'tire_movements', column: 'ro_id', definition: 'INTEGER REFERENCES retread_orders(id)' },
        { table: 'tire_movements', column: 'ro_item_id', definition: 'INTEGER REFERENCES retread_order_items(id)' },
        { table: 'roles', column: 'updated_at', definition: 'TIMESTAMP' },
        { table: 'tires', column: 'po_item_id', definition: 'INTEGER REFERENCES purchase_order_items(id)' },
        { table: 'tires', column: 'grn_id', definition: 'INTEGER REFERENCES goods_received_notes(id)' },
        { table: 'tires', column: 'grn_item_id', definition: 'INTEGER REFERENCES grn_items(id)' },
        { table: 'tires', column: 'retread_count', definition: 'INTEGER DEFAULT 0' },
        { table: 'tires', column: 'last_retread_date', definition: 'DATE' },
        { table: 'tires', column: 'total_retread_cost', definition: 'REAL DEFAULT 0' },
        { table: 'supplier_ledger', column: 'accounting_transaction_id', definition: 'INTEGER REFERENCES accounting_transactions(id)' },
        { table: 'supplier_ledger', column: 'ro_id', definition: 'INTEGER REFERENCES retread_orders(id)' },
        { table: 'supplier_ledger', column: 'retread_receipt_id', definition: 'INTEGER REFERENCES retread_receipts(id)' }
    ];
    
    for (const update of columnUpdates) {
        try {
            // Check if table exists
            const tables = await allQuery("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [update.table]);
            if (tables.length === 0) {
                console.log(`Table ${update.table} doesn't exist yet, skipping column check`);
                continue;
            }
            
            // Check if column exists
            const tableInfo = await allQuery(`PRAGMA table_info(${update.table})`);
            const columnExists = tableInfo.some(col => col.name === update.column);
            
            if (!columnExists) {
                console.log(`Adding column ${update.column} to ${update.table} table...`);
                await runQuery(`ALTER TABLE ${update.table} ADD COLUMN ${update.column} ${update.definition}`);
                console.log(`✓ Added column ${update.column} to ${update.table}`);
            } else {
                console.log(`✓ Column ${update.column} already exists in ${update.table}`);
            }
        } catch (error) {
            console.error(`Error checking/adding column ${update.column} to ${update.table}:`, error.message);
        }
    }
}

async function createIndexes() {
    console.log('\nCreating indexes...');
    
    const indexes = [
        // Tires indexes
        "CREATE INDEX IF NOT EXISTS idx_tires_serial ON tires(serial_number)",
        "CREATE INDEX IF NOT EXISTS idx_tires_status ON tires(status)",
        "CREATE INDEX IF NOT EXISTS idx_tires_size ON tires(size)",
        "CREATE INDEX IF NOT EXISTS idx_tires_po_item ON tires(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_tires_grn ON tires(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_tires_retread ON tires(retread_count)",
        
        // Movements indexes
        "CREATE INDEX IF NOT EXISTS idx_movements_tire ON tire_movements(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_date ON tire_movements(movement_date)",
        "CREATE INDEX IF NOT EXISTS idx_movements_po_item ON tire_movements(po_item_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_grn ON tire_movements(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_ro ON tire_movements(ro_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_ro_item ON tire_movements(ro_item_id)",
        
        // Assignments indexes
        "CREATE INDEX IF NOT EXISTS idx_assignments_tire ON tire_assignments(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON tire_assignments(vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_active ON tire_assignments(removal_date) WHERE removal_date IS NULL",
        
        // Supplier ledger indexes
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger ON supplier_ledger(supplier_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_po ON supplier_ledger(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_grn ON supplier_ledger(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_ro ON supplier_ledger(ro_id)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_accounting ON supplier_ledger(accounting_transaction_id)",
        
        // Purchase orders indexes
        "CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number)",
        "CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(po_date)",
        "CREATE INDEX IF NOT EXISTS idx_po_created_by ON purchase_orders(created_by)",
        "CREATE INDEX IF NOT EXISTS idx_po_approved_by ON purchase_orders(approved_by)",
        
        // Retread orders indexes
        "CREATE INDEX IF NOT EXISTS idx_ro_number ON retread_orders(ro_number)",
        "CREATE INDEX IF NOT EXISTS idx_ro_status ON retread_orders(status)",
        "CREATE INDEX IF NOT EXISTS idx_ro_supplier ON retread_orders(supplier_id)",
        "CREATE INDEX IF NOT EXISTS idx_ro_date ON retread_orders(ro_date)",
        
        // Retread order items indexes
        "CREATE INDEX IF NOT EXISTS idx_ro_items_ro ON retread_order_items(ro_id)",
        "CREATE INDEX IF NOT EXISTS idx_ro_items_tire ON retread_order_items(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_ro_items_status ON retread_order_items(status)",
        
        // Retread receipts indexes
        "CREATE INDEX IF NOT EXISTS idx_retread_receipts_ro ON retread_receipts(ro_id)",
        "CREATE INDEX IF NOT EXISTS idx_retread_receipts_date ON retread_receipts(receipt_date)",
        "CREATE INDEX IF NOT EXISTS idx_retread_receipts_status ON retread_receipts(status)",
        
        // Retread receipt items indexes
        "CREATE INDEX IF NOT EXISTS idx_retread_receipt_items_receipt ON retread_receipt_items(receipt_id)",
        "CREATE INDEX IF NOT EXISTS idx_retread_receipt_items_tire ON retread_receipt_items(tire_id)",
        
        // Purchase order items indexes
        "CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_items_size ON purchase_order_items(size)",
        
        // Inventory catalog indexes
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_size ON inventory_catalog(size, brand, model, type)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_stock ON inventory_catalog(current_stock)",
        
        // PO receipts indexes
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_po ON po_receipts(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_item ON po_receipts(po_item_id)",
        
        // GRN indexes
        "CREATE INDEX IF NOT EXISTS idx_grn_number ON goods_received_notes(grn_number)",
        "CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_received_notes(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_date ON goods_received_notes(receipt_date)",
        "CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_received_notes(status)",
        
        // GRN items indexes
        "CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id)",
        "CREATE INDEX IF NOT EXISTS idx_grn_items_po_item ON grn_items(po_item_id)",
        
        // Users indexes
        "CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)",
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id)",
        
        // Audit log indexes
        "CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id)",
        "CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)",
        
        // Suppliers indexes
        "CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)",
        "CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(type)",
        "CREATE INDEX IF NOT EXISTS idx_suppliers_balance ON suppliers(balance)",
        
        // Vehicles indexes
        "CREATE INDEX IF NOT EXISTS idx_vehicles_number ON vehicles(vehicle_number)",
        "CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status)",
        
        // Wheel positions indexes
        "CREATE INDEX IF NOT EXISTS idx_wheel_positions_vehicle ON wheel_positions(vehicle_id)",
        
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
        
        // Journal entries indexes
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_transaction ON journal_entries(transaction_id)",
        "CREATE INDEX IF NOT EXISTS idx_journal_entries_account ON journal_entries(account_code)",
        
        // Chart of accounts indexes
        "CREATE INDEX IF NOT EXISTS idx_chart_accounts_code ON chart_of_accounts(account_code)",
        "CREATE INDEX IF NOT EXISTS idx_chart_accounts_type ON chart_of_accounts(account_type)"
    ];

    for (let i = 0; i < indexes.length; i++) {
        try {
            await runQuery(indexes[i]);
            console.log(`✓ Created index ${i + 1}/${indexes.length}`);
        } catch (error) {
            console.error(`Error creating index ${i + 1}: ${error.message}`);
        }
    }
}

// Initialize sample chart of accounts
async function initializeChartOfAccounts() {
    console.log('\nInitializing chart of accounts...');
    
    const accounts = [
        // Assets
        { code: '1000', name: 'Cash', type: 'ASSET', normal_balance: 'DEBIT', description: 'Cash in bank' },
        { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normal_balance: 'DEBIT', description: 'Amounts owed by customers' },
        { code: '1200', name: 'Inventory - New Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'New tire inventory' },
        { code: '1210', name: 'Inventory - Retreaded Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'Retreaded tire inventory' },
        { code: '1220', name: 'Inventory - Used Tires', type: 'ASSET', normal_balance: 'DEBIT', description: 'Used tire inventory awaiting retread' },
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
        { code: '4100', name: 'Sales Revenue - Retreaded Tires', type: 'REVENUE', normal_balance: 'CREDIT', description: 'Revenue from retreaded tire sales' },
        { code: '4200', name: 'Service Revenue', type: 'REVENUE', normal_balance: 'CREDIT', description: 'Revenue from services' },
        
        // Expenses
        { code: '5000', name: 'Cost of Goods Sold - New Tires', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Cost of new tires sold' },
        { code: '5100', name: 'Cost of Goods Sold - Retreaded Tires', type: 'EXPENSE', normal_balance: 'DEBIT', description: 'Cost of retreaded tires sold' },
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
            const sql = `
                INSERT OR IGNORE INTO chart_of_accounts 
                (account_code, account_name, account_type, normal_balance, description)
                VALUES (?, ?, ?, ?, ?)`;
            
            await runQuery(sql, [
                account.code,
                account.name,
                account.type,
                account.normal_balance,
                account.description
            ]);
            console.log(`✓ Account ${account.code} - ${account.name} initialized`);
        } catch (error) {
            console.error(`Error initializing account ${account.code}:`, error.message);
        }
    }
}

async function seedPermissions() {
    console.log('\nSeeding permissions...');
    
    const permissions = getAllPermissions();
    
    for (const perm of permissions) {
        try {
            const sql = `
                INSERT OR IGNORE INTO permissions 
                (category, code, name, description)
                VALUES (?, ?, ?, ?)`;
            
            await runQuery(sql, [
                perm.category,
                perm.code,
                perm.name,
                `Permission to ${perm.name.toLowerCase()}`
            ]);
            console.log(`✓ Permission ${perm.code} seeded`);
        } catch (error) {
            console.error(`Error seeding permission ${perm.code}:`, error.message);
        }
    }
}

async function initializeSystemRolesAndPermissions() {
    console.log('\nInitializing system roles and permissions...');
    
    try {
        // Create system roles
        for (const [key, roleName] of Object.entries(SYSTEM_ROLES)) {
            const isSystemRole = key !== 'VIEWER'; // All except viewer are system roles
            const roleSql = `
                INSERT OR IGNORE INTO roles (name, description, is_system_role) 
                VALUES (?, ?, ?)`;
            
            await runQuery(roleSql, [
                roleName,
                `System role: ${roleName}`,
                isSystemRole ? 1 : 0
            ]);
            console.log(`✓ Role ${roleName} created`);
            
            // If this role has default permissions, assign them
            if (DEFAULT_ROLE_PERMISSIONS[roleName]) {
                const role = await getQuery("SELECT id FROM roles WHERE name = ?", [roleName]);
                const defaultPerms = DEFAULT_ROLE_PERMISSIONS[roleName]();
                
                for (const perm of defaultPerms) {
                    const permission = await getQuery(
                        "SELECT id FROM permissions WHERE code = ?", 
                        [perm.permission_code]
                    );
                    
                    if (permission) {
                        const rolePermSql = `
                            INSERT OR REPLACE INTO role_permissions 
                            (role_id, permission_id, can_view, can_create, can_edit, can_delete, can_approve)
                            VALUES (?, ?, ?, ?, ?, ?, ?)`;
                        
                        await runQuery(rolePermSql, [
                            role.id,
                            permission.id,
                            perm.can_view || 0,
                            perm.can_create || 0,
                            perm.can_edit || 0,
                            perm.can_delete || 0,
                            perm.can_approve || 0
                        ]);
                    }
                }
                console.log(`  ✓ Default permissions assigned to ${roleName}`);
            }
        }
    } catch (error) {
        console.error('Error initializing system roles:', error.message);
    }
}

async function initializeSampleData() {
    console.log('\nInitializing sample data...');
    
    try {
        // Create admin role if it doesn't exist
        const adminRoleSql = `
            INSERT OR IGNORE INTO roles (name, description, is_system_role) 
            VALUES ('Admin', 'System Administrator', 1)`;
        await runQuery(adminRoleSql);
        
        // Get admin role ID
        const role = await getQuery("SELECT id FROM roles WHERE name = 'Admin'");
        
        if (role) {
            // Create admin user (default password: admin123)
            const adminUserSql = `
                INSERT OR IGNORE INTO users 
                (username, email, password_hash, full_name, role_id, is_active)
                VALUES (?, ?, ?, ?, ?, 1)`;
            
            // Hash for 'admin123' - this is a sample hash, you should use proper bcrypt
            const hashedPassword = '$2b$10$N9qo8uLOickgx2ZMRZoMye9.Z.7H.3Q5J9z7Kz.8Qz8z8z8z8z8z8';
            
            await runQuery(adminUserSql, [
                'admin',
                'admin@tiremanager.com',
                hashedPassword,
                'System Administrator',
                role.id
            ]);
            
            console.log('✓ Admin user created (username: admin, password: admin123)');
        }

        // Create sample retread supplier
        const retreadSupplierSql = `
            INSERT OR IGNORE INTO suppliers (name, type, contact_person, phone, email, address)
            VALUES ('Premier Retreaders Ltd', 'RETREAD', 'John Smith', '+254 700 123456', 'info@premierretreaders.com', 'Nairobi Industrial Area')`;
        await runQuery(retreadSupplierSql);
        console.log('✓ Sample retread supplier created');

        // Create sample tire supplier
        const tireSupplierSql = `
            INSERT OR IGNORE INTO suppliers (name, type, contact_person, phone, email, address)
            VALUES ('Tire Distributors Ltd', 'TIRE', 'Jane Doe', '+254 711 789012', 'sales@tiredistributors.com', 'Mombasa Road, Nairobi')`;
        await runQuery(tireSupplierSql);
        console.log('✓ Sample tire supplier created');

        // Create sample inventory catalog items
        const catalogItems = [
            { size: '295/75R22.5', brand: 'Michelin', model: 'XZA2', type: 'NEW', min_stock: 10, reorder_point: 5 },
            { size: '11R22.5', brand: 'Bridgestone', model: 'M724', type: 'NEW', min_stock: 15, reorder_point: 8 },
            { size: '12R22.5', brand: 'Goodyear', model: 'G622', type: 'RETREADED', min_stock: 20, reorder_point: 10 },
            { size: '315/80R22.5', brand: 'Michelin', model: 'XDN2', type: 'NEW', min_stock: 8, reorder_point: 4 }
        ];

        for (const item of catalogItems) {
            const catalogSql = `
                INSERT OR IGNORE INTO inventory_catalog 
                (size, brand, model, type, min_stock, reorder_point, is_active)
                VALUES (?, ?, ?, ?, ?, ?, 1)`;
            
            await runQuery(catalogSql, [
                item.size,
                item.brand,
                item.model,
                item.type,
                item.min_stock,
                item.reorder_point
            ]);
        }
        console.log('✓ Sample inventory catalog created');

        // Create sample vehicles
        const vehicles = [
            { vehicle_number: 'KCA 001A', make: 'Scania', model: 'R500', year: 2022, wheel_config: '6x4' },
            { vehicle_number: 'KCB 002B', make: 'Volvo', model: 'FH16', year: 2021, wheel_config: '4x2' },
            { vehicle_number: 'KCD 003C', make: 'Mercedes', model: 'Actros', year: 2023, wheel_config: '6x2' }
        ];

        for (const vehicle of vehicles) {
            const vehicleSql = `
                INSERT OR IGNORE INTO vehicles 
                (vehicle_number, make, model, year, wheel_config, status)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE')`;
            
            await runQuery(vehicleSql, [
                vehicle.vehicle_number,
                vehicle.make,
                vehicle.model,
                vehicle.year,
                vehicle.wheel_config
            ]);
        }
        console.log('✓ Sample vehicles created');

        // Create wheel positions for vehicles
        const vehiclesList = await allQuery("SELECT id, vehicle_number, wheel_config FROM vehicles");
        for (const vehicle of vehiclesList) {
            const positions = [
                { code: 'FL', name: 'Front Left', axle: 1 },
                { code: 'FR', name: 'Front Right', axle: 1 },
                { code: 'R1L', name: 'Rear 1 Left', axle: 2 },
                { code: 'R1R', name: 'Rear 1 Right', axle: 2 },
                { code: 'R2L', name: 'Rear 2 Left', axle: 3 },
                { code: 'R2R', name: 'Rear 2 Right', axle: 3 }
            ];

            for (const pos of positions) {
                const posSql = `
                    INSERT OR IGNORE INTO wheel_positions 
                    (vehicle_id, position_code, position_name, axle_number)
                    VALUES (?, ?, ?, ?)`;
                
                await runQuery(posSql, [
                    vehicle.id,
                    pos.code,
                    pos.name,
                    pos.axle
                ]);
            }
        }
        console.log('✓ Wheel positions created');

        // Create sample used tires (for retread)
        const usedTires = [
            { serial: 'T2024001', size: '295/75R22.5', brand: 'Michelin', model: 'XZA2' },
            { serial: 'T2024002', size: '11R22.5', brand: 'Bridgestone', model: 'M724' },
            { serial: 'T2024003', size: '12R22.5', brand: 'Goodyear', model: 'G622' }
        ];

        for (const tire of usedTires) {
            const tireSql = `
                INSERT OR IGNORE INTO tires 
                (serial_number, size, brand, model, type, status, current_location)
                VALUES (?, ?, ?, ?, 'RETREADED', 'USED_STORE', 'Used Tire Store')`;
            
            await runQuery(tireSql, [
                tire.serial,
                tire.size,
                tire.brand,
                tire.model
            ]);
        }
        console.log('✓ Sample used tires created');

    } catch (error) {
        console.error('Error initializing sample data:', error.message);
    }
}

async function initializeDatabase() {
    try {
        // Enable foreign keys
        await runQuery('PRAGMA foreign_keys = ON');
        
        // Create tables
        await createTables();
        
        // Add missing columns
        await addMissingColumns();
        
        // Update tire movements table with retread fields
        await updateTireMovementsTable();
        
        // Create indexes
        await createIndexes();
        
        // Initialize chart of accounts
        await initializeChartOfAccounts();
        
        // Seed permissions
        await seedPermissions();
        
        // Initialize system roles and permissions
        await initializeSystemRolesAndPermissions();
        
        // Initialize sample data
        await initializeSampleData();
        
        console.log('\n✅ Database initialization complete!');
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    } finally {
        // Close database connection
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Database connection closed.');
            }
        });
    }
}

// Export the database functions
module.exports = {
    db,
    runQuery,
    getQuery,
    allQuery
};