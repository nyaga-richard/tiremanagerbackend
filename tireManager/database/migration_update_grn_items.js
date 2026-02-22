// migration_update_grn_items.js
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
        // Run migration after connection is established
        migrateGRNItemsTable();
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

// Flag to prevent multiple executions
let migrationExecuted = false;

async function migrateGRNItemsTable() {
    // Prevent multiple executions
    if (migrationExecuted) {
        return;
    }
    migrationExecuted = true;

    console.log('\n🔧 Starting GRN Items table migration...\n');
    
    try {
        // First, disable foreign key checks
        await run('PRAGMA foreign_keys = OFF');
        console.log('✓ Foreign keys temporarily disabled');

        // Check if there's a leftover table from previous failed migration
        try {
            const leftoverTable = await get(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='grn_items_new'
            `);
            
            if (leftoverTable) {
                console.log('⚠️ Found leftover table from previous migration. Dropping it...');
                await run('DROP TABLE IF EXISTS grn_items_new');
                console.log('✓ Leftover table dropped');
            }
        } catch (error) {
            console.log('Note: No leftover table found or error checking:', error.message);
        }

        // Begin transaction
        await run('BEGIN TRANSACTION');
        console.log('✓ Transaction started');

        // Check current table structure
        console.log('\n📊 Checking current table structure...');
        const tableInfo = await all("PRAGMA table_info(grn_items)");
        console.log('Current columns:', tableInfo.map(col => `${col.name} (notnull: ${col.notnull})`).join(', '));

        const hasRetreadColumn = tableInfo.some(col => col.name === 'retread_order_item_id');
        const poColumnInfo = tableInfo.find(col => col.name === 'po_item_id');
        const poNotNull = poColumnInfo && poColumnInfo.notnull === 1;

        console.log('Has retread_order_item_id column:', hasRetreadColumn ? '✅' : '❌');
        console.log('po_item_id NOT NULL constraint:', poNotNull ? '❌ (needs removal)' : '✅ (allows NULL)');

        // Check if migration is needed
        if (hasRetreadColumn && !poNotNull) {
            console.log('\n✅ Table already has correct structure. Skipping migration.');
            await run('ROLLBACK');
            await run('PRAGMA foreign_keys = ON');
            console.log('✓ Foreign keys re-enabled');
            return;
        }

        // Step 1: Create new table with correct schema
        console.log('\n📝 Step 1: Creating new table with correct schema...');
        await run(`
            CREATE TABLE grn_items_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grn_id INTEGER NOT NULL,
                po_item_id INTEGER,
                retread_order_item_id INTEGER,
                quantity_received INTEGER NOT NULL CHECK(quantity_received > 0),
                unit_cost REAL NOT NULL,
                batch_number TEXT,
                serial_numbers TEXT, -- JSON array of serial numbers
                brand TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (grn_id) REFERENCES goods_received_notes(id) ON DELETE CASCADE,
                FOREIGN KEY (po_item_id) REFERENCES purchase_order_items(id),
                FOREIGN KEY (retread_order_item_id) REFERENCES retread_order_items(id)
            )
        `);
        console.log('✓ New table created');

        // Step 2: Copy data from old table
        console.log('\n📋 Step 2: Copying data from old table...');
        
        // First, check if there are any records to migrate
        const oldCount = await get('SELECT COUNT(*) as count FROM grn_items');
        console.log(`Found ${oldCount.count} records to migrate`);

        if (oldCount.count > 0) {
            // Check if brand column exists in old table
            const hasBrandColumn = tableInfo.some(col => col.name === 'brand');
            
            let insertSQL;
            if (hasBrandColumn) {
                insertSQL = `
                    INSERT INTO grn_items_new 
                    (id, grn_id, po_item_id, retread_order_item_id, quantity_received, unit_cost, 
                     batch_number, serial_numbers, brand, notes, created_at)
                    SELECT 
                        id, 
                        grn_id, 
                        po_item_id, 
                        NULL as retread_order_item_id, 
                        quantity_received, 
                        unit_cost, 
                        batch_number, 
                        serial_numbers, 
                        brand, 
                        notes, 
                        created_at 
                    FROM grn_items
                `;
            } else {
                insertSQL = `
                    INSERT INTO grn_items_new 
                    (id, grn_id, po_item_id, retread_order_item_id, quantity_received, unit_cost, 
                     batch_number, serial_numbers, brand, notes, created_at)
                    SELECT 
                        id, 
                        grn_id, 
                        po_item_id, 
                        NULL as retread_order_item_id, 
                        quantity_received, 
                        unit_cost, 
                        batch_number, 
                        serial_numbers, 
                        NULL as brand, 
                        notes, 
                        created_at 
                    FROM grn_items
                `;
            }
            
            await run(insertSQL);
            
            // Verify copy
            const newCount = await get('SELECT COUNT(*) as count FROM grn_items_new');
            console.log(`✓ Copied ${newCount.count} records to new table`);
            
            if (newCount.count !== oldCount.count) {
                throw new Error(`Record count mismatch! Old: ${oldCount.count}, New: ${newCount.count}`);
            }
        } else {
            console.log('No records to copy, continuing with empty table');
        }

        // Step 3: Drop the old table
        console.log('\n🗑️ Step 3: Dropping old table...');
        await run('DROP TABLE grn_items');
        console.log('✓ Old table dropped');

        // Step 4: Rename the new table
        console.log('\n📝 Step 4: Renaming new table...');
        await run('ALTER TABLE grn_items_new RENAME TO grn_items');
        console.log('✓ Table renamed');

        // Step 5: Recreate indexes
        console.log('\n🔍 Step 5: Recreating indexes...');
        
        const indexes = [
            { name: 'idx_grn_items_grn', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_items_grn ON grn_items(grn_id)' },
            { name: 'idx_grn_items_po_item', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_items_po_item ON grn_items(po_item_id)' },
            { name: 'idx_grn_items_retread_item', sql: 'CREATE INDEX IF NOT EXISTS idx_grn_items_retread_item ON grn_items(retread_order_item_id)' }
        ];

        for (const index of indexes) {
            await run(index.sql);
            console.log(`  ✓ ${index.name} created`);
        }

        // Verify the new table structure
        console.log('\n✅ Step 6: Verifying new table structure...');
        const newTableInfo = await all("PRAGMA table_info(grn_items)");
        console.log('New columns:', newTableInfo.map(col => `${col.name} (notnull: ${col.notnull})`).join(', '));
        
        // Verify foreign keys
        const foreignKeys = await all("PRAGMA foreign_key_list(grn_items)");
        console.log('Foreign keys:', foreignKeys.map(fk => `${fk.from} -> ${fk.table}(${fk.to})`).join(', '));

        // Commit transaction
        await run('COMMIT');
        console.log('\n✅ Migration completed successfully!');
        
        // Show summary
        const finalCount = await get('SELECT COUNT(*) as count FROM grn_items');
        console.log(`\n📊 Final table statistics:`);
        console.log(`   Total records: ${finalCount.count}`);
        console.log(`   Table structure: Updated to support both PO and Retread items`);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        
        // Try to rollback if we have an active transaction
        try {
            await run('ROLLBACK');
            console.log('Transaction rolled back');
        } catch (rollbackError) {
            console.log('Note: Could not rollback transaction - it may not be active');
        }
    } finally {
        // Re-enable foreign keys
        try {
            await run('PRAGMA foreign_keys = ON');
            console.log('✓ Foreign keys re-enabled');
        } catch (err) {
            console.log('Note: Could not re-enable foreign keys:', err.message);
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

// Only run if this is the main module
if (require.main === module) {
    // The function will be called from the database connection callback
    // Don't call it here
}

module.exports = migrateGRNItemsTable;