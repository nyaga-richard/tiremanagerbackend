const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'tires.db');
const db = new sqlite3.Database(dbPath);

// Promisify for easier handling
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

async function addRetreadTables() {
    console.log('🔧 Adding retread tables to existing database...\n');

    try {
        // Enable foreign keys
        await run('PRAGMA foreign_keys = ON');
        
        // Check if tables already exist
        const checkTable = (tableName) => {
            return new Promise((resolve, reject) => {
                db.get(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
                    [tableName],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(!!row);
                    }
                );
            });
        };

        // 1. Retread Orders Table
        if (!await checkTable('retread_orders')) {
            console.log('Creating retread_orders table...');
            await run(`
                CREATE TABLE retread_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_number TEXT UNIQUE NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    status TEXT CHECK(status IN (
                        'DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RECEIVED', 'PARTIALLY_RECEIVED'
                    )) DEFAULT 'DRAFT',
                    total_tires INTEGER DEFAULT 0,
                    total_cost REAL DEFAULT 0,
                    expected_completion_date DATE,
                    sent_date DATE,
                    received_date DATE,
                    notes TEXT,
                    created_by INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            `);
            console.log('✅ retread_orders table created');
        } else {
            console.log('✓ retread_orders table already exists');
        }

        // 2. Retread Order Items Table
        if (!await checkTable('retread_order_items')) {
            console.log('\nCreating retread_order_items table...');
            await run(`
                CREATE TABLE retread_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    retread_order_id INTEGER NOT NULL,
                    tire_id INTEGER NOT NULL,
                    cost REAL,
                    status TEXT DEFAULT 'PENDING',
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id) ON DELETE CASCADE,
                    FOREIGN KEY (tire_id) REFERENCES tires(id) ON DELETE CASCADE,
                    UNIQUE(retread_order_id, tire_id)
                )
            `);
            console.log('✅ retread_order_items table created');
        } else {
            console.log('✓ retread_order_items table already exists');
        }

        // 3. Retread Receiving Table
        if (!await checkTable('retread_receiving')) {
            console.log('\nCreating retread_receiving table...');
            await run(`
                CREATE TABLE retread_receiving (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    retread_order_id INTEGER NOT NULL,
                    received_date DATE NOT NULL,
                    received_by INTEGER NOT NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id),
                    FOREIGN KEY (received_by) REFERENCES users(id)
                )
            `);
            console.log('✅ retread_receiving table created');
        } else {
            console.log('✓ retread_receiving table already exists');
        }

        // 4. Retread Received Items Table
        if (!await checkTable('retread_received_items')) {
            console.log('\nCreating retread_received_items table...');
            await run(`
                CREATE TABLE retread_received_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    receiving_id INTEGER NOT NULL,
                    tire_id INTEGER NOT NULL,
                    received_depth REAL,
                    quality TEXT CHECK(quality IN ('GOOD', 'ACCEPTABLE', 'POOR')) DEFAULT 'GOOD',
                    status TEXT CHECK(status IN ('RECEIVED', 'REJECTED')) NOT NULL,
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (receiving_id) REFERENCES retread_receiving(id) ON DELETE CASCADE,
                    FOREIGN KEY (tire_id) REFERENCES tires(id)
                )
            `);
            console.log('✅ retread_received_items table created');
        } else {
            console.log('✓ retread_received_items table already exists');
        }

        // 5. Retread Timeline Table
        if (!await checkTable('retread_timeline')) {
            console.log('\nCreating retread_timeline table...');
            await run(`
                CREATE TABLE retread_timeline (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    retread_order_id INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    note TEXT,
                    user_id INTEGER NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);
            console.log('✅ retread_timeline table created');
        } else {
            console.log('✓ retread_timeline table already exists');
        }

        // 6. Add retread_count to tires table if it doesn't exist
        console.log('\nChecking for retread_count column in tires table...');
        const tireColumns = await new Promise((resolve, reject) => {
            db.all("PRAGMA table_info(tires)", (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(r => r.name));
            });
        });

        if (!tireColumns.includes('retread_count')) {
            console.log('Adding retread_count column to tires table...');
            await run('ALTER TABLE tires ADD COLUMN retread_count INTEGER DEFAULT 0');
            console.log('✅ retread_count column added to tires table');
        } else {
            console.log('✓ retread_count column already exists in tires table');
        }

        // Create indexes for better performance
        console.log('\nCreating indexes...');
        
        const indexes = [
            "CREATE INDEX IF NOT EXISTS idx_retread_orders_number ON retread_orders(order_number)",
            "CREATE INDEX IF NOT EXISTS idx_retread_orders_supplier ON retread_orders(supplier_id)",
            "CREATE INDEX IF NOT EXISTS idx_retread_orders_status ON retread_orders(status)",
            "CREATE INDEX IF NOT EXISTS idx_retread_orders_dates ON retread_orders(sent_date, received_date)",
            "CREATE INDEX IF NOT EXISTS idx_retread_items_order ON retread_order_items(retread_order_id)",
            "CREATE INDEX IF NOT EXISTS idx_retread_items_tire ON retread_order_items(tire_id)",
            "CREATE INDEX IF NOT EXISTS idx_retread_timeline_order ON retread_timeline(retread_order_id)"
        ];

        for (const index of indexes) {
            await run(index);
        }
        console.log('✅ Indexes created');

        console.log('\n✅ All retread tables added successfully!');
        
        // Show summary
        const tables = ['retread_orders', 'retread_order_items', 'retread_receiving', 
                       'retread_received_items', 'retread_timeline'];
        
        console.log('\n📊 Table Summary:');
        for (const table of tables) {
            const count = await new Promise((resolve, reject) => {
                db.get(`SELECT COUNT(*) as count FROM ${table}`, (err, row) => {
                    if (err) resolve(0);
                    else resolve(row.count);
                });
            });
            console.log(`   ${table}: ${count} records`);
        }

    } catch (error) {
        console.error('❌ Error adding retread tables:', error);
    } finally {
        db.close();
    }
}

addRetreadTables();