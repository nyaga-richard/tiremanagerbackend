// update-tires-table.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tires.db');

console.log('Checking tires table structure...');

// Use serialize to ensure operations complete before closing
db.serialize(() => {
    // Check current columns
    db.all("PRAGMA table_info(tires)", (err, columns) => {
        if (err) {
            console.error('Error getting table info:', err.message);
            db.close();
            return;
        }
        
        console.log('\nCurrent columns in tires table:');
        console.log('--------------------------------');
        columns.forEach(col => {
            console.log(`${col.name} (${col.type})`);
        });
        console.log('--------------------------------\n');
        
        // Check if current_position column exists
        const hasCurrentPosition = columns.some(col => col.name === 'current_position');
        
        if (!hasCurrentPosition) {
            console.log('Adding current_position column to tires table...');
            db.run("ALTER TABLE tires ADD COLUMN current_position TEXT", function(err) {
                if (err) {
                    console.error('Error adding current_position column:', err.message);
                } else {
                    console.log('✓ Added current_position column to tires table');
                }
                // Close database after operation
                db.close(() => {
                    console.log('\nDatabase update completed!');
                });
            });
        } else {
            console.log('✓ current_position column already exists');
            db.close(() => {
                console.log('\nDatabase check completed!');
            });
        }
    });
});

// Handle errors
db.on('error', (err) => {
    console.error('Database error:', err.message);
});