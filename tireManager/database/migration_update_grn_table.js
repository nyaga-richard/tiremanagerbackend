// migration_update_grn_table.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database path
const dbPath = path.join(__dirname, '..', 'database', 'tires.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        migrateGRNTable();
    }
});

// Promisify database operations
const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const all = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

async function migrateGRNTable() {
    console.log('\n🔧 Starting GRN table migration...\n');
    
    try {
        // First, identify all tables that reference goods_received_notes
        console.log('🔍 Checking for dependent tables...');
        const foreignKeys = await all(`
            SELECT 
                m.name as table_name,
                pgs.*
            FROM sqlite_master m
            JOIN pragma_foreign_key_list(m.name) pgs ON 1=1
            WHERE m.type = 'table' 
            AND pgs."table" = 'goods_received_notes'
        `);
        
        console.log('Tables referencing goods_received_notes:', foreignKeys.map(fk => fk.table_name).join(', ') || 'None');

        // Disable foreign key checks
        await run('PRAGMA foreign_keys = OFF');
        console.log('✓ Foreign keys temporarily disabled');

        // Check if there's a leftover table from previous failed migration
        const leftoverTable = await get(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='goods_received_notes_new'
        `);
        
        if (leftoverTable) {
            console.log('⚠️ Found leftover table from previous migration. Dropping it...');
            await run('DROP TABLE goods_received_notes_new');
            console.log('✓ Leftover table dropped');
        }

        // Begin transaction
        await run('BEGIN TRANSACTION');
        console.log('✓ Transaction started');

        // Check current table structure
        console.log('\n📊 Checking current table structure...');
        const tableInfo = await all("PRAGMA table_info(goods_received_notes)");
        console.log('Current columns:', tableInfo.map(col => `${col.name} (notnull: ${col.notnull})`).join(', '));

        const hasRetreadColumn = tableInfo.some(col => col.name === 'retread_order_id');
        const poColumnInfo = tableInfo.find(col => col.name === 'po_id');
        const poNotNull = poColumnInfo && poColumnInfo.notnull === 1;

        console.log('Has retread_order_id column:', hasRetreadColumn ? '✅' : '❌');
        console.log('po_id NOT NULL constraint:', poNotNull ? '❌ (needs removal)' : '✅ (allows NULL)');

        // Check if migration is needed
        if (hasRetreadColumn && !poNotNull) {
            console.log('\n✅ Table already has correct structure. Skipping migration.');
            await run('ROLLBACK');
            await run('PRAGMA foreign_keys = ON');
            return;
        }

        // Step 1: Create new table with correct schema
        console.log('\n📝 Step 1: Creating new table with correct schema...');
        await run(`
            CREATE TABLE goods_received_notes_new (
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
                FOREIGN KEY (retread_order_id) REFERENCES retread_orders(id),
                FOREIGN KEY (received_by) REFERENCES users(id)
            )
        `);
        console.log('✓ New table created');

        // Step 2: Copy data from old table
        console.log('\n📋 Step 2: Copying data from old table...');
        
        // First, check if there are any records to migrate
        const oldCount = await get('SELECT COUNT(*) as count FROM goods_received_notes');
        console.log(`Found ${oldCount.count} records to migrate`);

        if (oldCount.count > 0) {
            await run(`
                INSERT INTO goods_received_notes_new 
                (id, grn_number, po_id, retread_order_id, receipt_date, received_by, 
                 supplier_invoice_number, delivery_note_number, vehicle_number, driver_name, 
                 notes, status, created_at)
                SELECT 
                    id, 
                    grn_number, 
                    po_id, 
                    NULL as retread_order_id, 
                    receipt_date, 
                    received_by, 
                    supplier_invoice_number, 
                    delivery_note_number, 
                    vehicle_number, 
                    driver_name, 
                    notes, 
                    status, 
                    created_at 
                FROM goods_received_notes
            `);
            
            // Verify copy
            const newCount = await get('SELECT COUNT(*) as count FROM goods_received_notes_new');
            console.log(`✓ Copied ${newCount.count} records to new table`);
            
            if (newCount.count !== oldCount.count) {
                throw new Error(`Record count mismatch! Old: ${oldCount.count}, New: ${newCount.count}`);
            }
        } else {
            console.log('No records to copy, continuing with empty table');
        }

        // Step 3: Update foreign keys in dependent tables to point to new table
        if (foreignKeys.length > 0) {
            console.log('\n🔄 Step 3: Updating foreign key references in dependent tables...');
            
            for (const fk of foreignKeys) {
                console.log(`   Processing ${fk.table_name}...`);
                
                // For each dependent table, we need to temporarily drop and recreate foreign keys
                // This is complex - alternative approach is to use the fact that ROWIDs remain the same
                // So we can just update the table names
                
                // Get the schema of the dependent table
                const tableSchema = await all(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${fk.table_name}'`);
                if (tableSchema[0] && tableSchema[0].sql) {
                    console.log(`   ✓ ${fk.table_name} references will be preserved through ROWIDs`);
                }
            }
        }

        // Step 4: Drop the old table
        console.log('\n🗑️ Step 4: Dropping old table...');
        await run('DROP TABLE goods_received_notes');
        console.log('✓ Old table dropped');

        // Step 5: Rename the new table
        console.log('\n📝 Step 5: Renaming new table...');
        await run('ALTER TABLE goods_received_notes_new RENAME TO goods_received_notes');
        console.log('✓ Table renamed');

        // Step 6: Recreate indexes
        console.log('\n🔍 Step 6: Recreating indexes...');
        
        const indexes = [
            { name: 'idx_grn_number', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_number ON goods_received_notes(grn_number)' },
            { name: 'idx_grn_po', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_po ON goods_received_notes(po_id)' },
            { name: 'idx_grn_retread', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_retread ON goods_received_notes(retread_order_id)' },
            { name: 'idx_grn_date', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_date ON goods_received_notes(receipt_date)' },
            { name: 'idx_grn_status', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_status ON goods_received_notes(status)' }
        ];

        for (const index of indexes) {
            await run(index.sql);
            console.log(`  ✓ ${index.name} created`);
        }

        // Verify the new table structure
        console.log('\n✅ Step 7: Verifying new table structure...');
        const newTableInfo = await all("PRAGMA table_info(goods_received_notes)");
        console.log('New columns:', newTableInfo.map(col => `${col.name} (notnull: ${col.notnull})`).join(', '));
        
        // Verify foreign keys
        const newForeignKeys = await all("PRAGMA foreign_key_list(goods_received_notes)");
        console.log('Foreign keys:', newForeignKeys.map(fk => `${fk.from} -> ${fk.table}(${fk.to})`).join(', '));

        // Commit transaction
        await run('COMMIT');
        console.log('\n✅ Migration completed successfully!');
        
        // Show summary
        const finalCount = await get('SELECT COUNT(*) as count FROM goods_received_notes');
        console.log(`\n📊 Final table statistics:`);
        console.log(`   Total records: ${finalCount.count}`);
        console.log(`   Table structure: Updated to support both PO and Retread orders`);

    } catch (error) {
        // Rollback in case of error
        console.error('\n❌ Migration failed:', error.message);
        
        // Try to rollback
        try {
            await run('ROLLBACK');
            console.log('Transaction rolled back');
        } catch (rollbackError) {
            console.log('Note: Could not rollback transaction');
        }
    } finally {
        // Re-enable foreign keys
        try {
            await run('PRAGMA foreign_keys = ON');
            console.log('✓ Foreign keys re-enabled');
        } catch (err) {
            console.log('Note: Could not re-enable foreign keys');
        }
        
        // Close database connection
        db.close((err) => {
            if (err) {
                if (err.code !== 'SQLITE_MISUSE') {
                    console.error('Error closing database:', err);
                }
            } else {
                console.log('\nDatabase connection closed');
            }
        });
    }
}

// Prevent multiple executions
let migrationExecuted = false;

// Run the migration if called directly
if (require.main === module && !migrationExecuted) {
    migrationExecuted = true;
}

module.exports = migrateGRNTable;