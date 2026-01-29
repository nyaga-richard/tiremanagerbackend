const sqlite3 = require('sqlite3').verbose();
const path = require('path');

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

async function initializeDatabase() {
    try {
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // First, let's check which tables exist and their schema
        await createTables();
        await addMissingColumns();
        await createIndexes();
        
        console.log('Database initialization complete!');
        db.close();
    } catch (error) {
        console.error('Database initialization error:', error);
        db.close();
    }
}

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function allQuery(sql, params = []) {
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        
        // Purchase orders (create this first to avoid circular dependencies)
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
        
        // Tires table - will add po_item_id column separately if needed
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
        
        // Supplier ledger - will add po_id column separately if needed
        `CREATE TABLE IF NOT EXISTS supplier_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER NOT NULL,
            date DATE NOT NULL,
            description TEXT NOT NULL,
            transaction_type TEXT CHECK(transaction_type IN ('PURCHASE', 'PAYMENT', 'RETREAD_SERVICE')) NOT NULL,
            amount REAL NOT NULL,
            reference_number TEXT,
            created_by TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
        )`,
        
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
        
        // Tire movements - will add po_item_id column separately if needed
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
            user_id TEXT NOT NULL,
            notes TEXT,
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
            FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id)
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

async function addMissingColumns() {
    console.log('\nChecking for missing columns...');
    
    // List of columns to add if they don't exist
    const columnUpdates = [
        { table: 'tires', column: 'po_item_id', definition: 'INTEGER REFERENCES purchase_order_items(id)' },
        { table: 'supplier_ledger', column: 'po_id', definition: 'INTEGER REFERENCES purchase_orders(id)' },
        { table: 'tire_movements', column: 'po_item_id', definition: 'INTEGER REFERENCES purchase_order_items(id)' },
        { table: 'purchase_orders', column: 'created_by', definition: 'INTEGER NOT NULL' },
        { table: 'purchase_orders', column: 'approved_by', definition: 'INTEGER' }
    ];
    
    for (const update of columnUpdates) {
        try {
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
        
        // Movements indexes
        "CREATE INDEX IF NOT EXISTS idx_movements_tire ON tire_movements(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_date ON tire_movements(movement_date)",
        "CREATE INDEX IF NOT EXISTS idx_movements_po_item ON tire_movements(po_item_id)",
        
        // Assignments indexes
        "CREATE INDEX IF NOT EXISTS idx_assignments_tire ON tire_assignments(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON tire_assignments(vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_active ON tire_assignments(removal_date) WHERE removal_date IS NULL",
        
        // Supplier ledger indexes
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger ON supplier_ledger(supplier_id, date)",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger_po ON supplier_ledger(po_id)",
        
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
        
        // Inventory catalog indexes
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_size ON inventory_catalog(size, brand, model, type)",
        "CREATE INDEX IF NOT EXISTS idx_inventory_catalog_stock ON inventory_catalog(current_stock)",
        
        // PO receipts indexes
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_po ON po_receipts(po_id)",
        "CREATE INDEX IF NOT EXISTS idx_po_receipts_item ON po_receipts(po_item_id)",
        
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
        "CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id)"
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