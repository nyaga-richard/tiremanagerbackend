const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const dbPath = path.join(__dirname, '..', 'database', 'tires.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database');
        initializeTables();
    }
});

function initializeTables() {
    // 1. Tire Master Table (Core Asset Registry)
    db.run(`CREATE TABLE IF NOT EXISTS tires (
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
    )`, (err) => {
        if (err) console.error('Error creating tires table:', err);
        else console.log('Tires table created/verified');
    });

    // 2. Suppliers Table
    db.run(`CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT CHECK(type IN ('TIRE', 'RETREAD')) NOT NULL,
        contact_person TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        balance REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating suppliers table:', err);
        else console.log('Suppliers table created/verified');
    });

    // 3. Supplier Ledger (Accounting-lite)
    db.run(`CREATE TABLE IF NOT EXISTS supplier_ledger (
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
    )`, (err) => {
        if (err) console.error('Error creating supplier_ledger table:', err);
        else console.log('Supplier ledger table created/verified');
    });

    // 4. Vehicles Table
    db.run(`CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_number TEXT UNIQUE NOT NULL,
        make TEXT,
        model TEXT,
        year INTEGER,
        wheel_config TEXT,
        current_odometer REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating vehicles table:', err);
        else console.log('Vehicles table created/verified');
    });

    // 5. Wheel Positions Table
    db.run(`CREATE TABLE IF NOT EXISTS wheel_positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL,
        position_code TEXT NOT NULL,
        position_name TEXT NOT NULL,
        axle_number INTEGER,
        is_trailer BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vehicle_id, position_code),
        FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
    )`, (err) => {
        if (err) console.error('Error creating wheel_positions table:', err);
        else console.log('Wheel positions table created/verified');
    });

    // 6. Vehicle Tire Assignments (Installation History)
    db.run(`CREATE TABLE IF NOT EXISTS tire_assignments (
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
    )`, (err) => {
        if (err) console.error('Error creating tire_assignments table:', err);
        else console.log('Tire assignments table created/verified');
    });

    // 7. Tire Movement History (Critical Audit Trail)
    db.run(`CREATE TABLE IF NOT EXISTS tire_movements (
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
    )`, (err) => {
        if (err) console.error('Error creating tire_movements table:', err);
        else console.log('Tire movements table created/verified');
    });

    // 8. Create Indexes for Performance
    const indexes = [
        "CREATE INDEX IF NOT EXISTS idx_tires_serial ON tires(serial_number)",
        "CREATE INDEX IF NOT EXISTS idx_tires_status ON tires(status)",
        "CREATE INDEX IF NOT EXISTS idx_tires_size ON tires(size)",
        "CREATE INDEX IF NOT EXISTS idx_movements_tire ON tire_movements(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_movements_date ON tire_movements(movement_date)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_tire ON tire_assignments(tire_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_vehicle ON tire_assignments(vehicle_id)",
        "CREATE INDEX IF NOT EXISTS idx_assignments_active ON tire_assignments(removal_date) WHERE removal_date IS NULL",
        "CREATE INDEX IF NOT EXISTS idx_supplier_ledger ON supplier_ledger(supplier_id, date)"
    ];

        // 9. Users Table
    db.run(`CREATE TABLE IF NOT EXISTS users (
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
    )`, (err) => {
        if (err) console.error('Error creating users table:', err);
        else console.log('Users table created/verified');
    });

    // 10. Roles Table
    db.run(`CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        is_system_role BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating roles table:', err);
        else console.log('Roles table created/verified');
    });

    // 11. Permissions Table
    db.run(`CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error('Error creating permissions table:', err);
        else console.log('Permissions table created/verified');
    });

    // 12. Role Permissions Junction Table
    db.run(`CREATE TABLE IF NOT EXISTS role_permissions (
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
    )`, (err) => {
        if (err) console.error('Error creating role_permissions table:', err);
        else console.log('Role permissions table created/verified');
    });

    // 13. User Sessions Table
    db.run(`CREATE TABLE IF NOT EXISTS user_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        device_info TEXT,
        ip_address TEXT,
        expires_at TIMESTAMP NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) console.error('Error creating user_sessions table:', err);
        else console.log('User sessions table created/verified');
    });

    // 14. Audit Log Table
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
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
    )`, (err) => {
        if (err) console.error('Error creating audit_log table:', err);
        else console.log('Audit log table created/verified');
    });

    // 15. Password Reset Tokens
    db.run(`CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        is_used BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`, (err) => {
        if (err) console.error('Error creating password_resets table:', err);
        else console.log('Password reset table created/verified');
    });

    indexes.forEach((sql, index) => {
        db.run(sql, (err) => {
            if (err) console.error(`Error creating index ${index + 1}:`, err);
        });
    });

    console.log('Database initialization complete!');
    db.close();
}