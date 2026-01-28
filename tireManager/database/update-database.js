const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./tires.db');

console.log('Adding retirement columns to vehicles table...');

db.serialize(() => {
    // Add retired_date column if it doesn't exist
    db.run("ALTER TABLE vehicles ADD COLUMN retired_date TEXT", function(err) {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column retired_date already exists');
            } else {
                console.error('Error adding retired_date:', err.message);
            }
        } else {
            console.log('✓ Added retired_date column');
        }
    });

    // Add retirement_reason column if it doesn't exist
    db.run("ALTER TABLE vehicles ADD COLUMN retirement_reason TEXT", function(err) {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column retirement_reason already exists');
            } else {
                console.error('Error adding retirement_reason:', err.message);
            }
        } else {
            console.log('✓ Added retirement_reason column');
        }
    });

    // Add retired_by column if it doesn't exist
    db.run("ALTER TABLE vehicles ADD COLUMN retired_by INTEGER", function(err) {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column retired_by already exists');
            } else {
                console.error('Error adding retired_by:', err.message);
            }
        } else {
            console.log('✓ Added retired_by column');
        }
    });


    // Add updated_at column if it doesn't exist (without default value first)
    db.run("ALTER TABLE vehicles ADD COLUMN updated_at DATETIME", function(err) {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('Column updated_at already exists');
            } else {
                console.error('Error adding updated_at:', err.message);
            }
        } else {
            console.log('✓ Added updated_at column');
            // Now update existing rows with current timestamp
            db.run("UPDATE vehicles SET updated_at = datetime('now') WHERE updated_at IS NULL", function(err) {
                if (err) {
                    console.error('Error setting updated_at values:', err.message);
                } else {
                    console.log('✓ Set initial updated_at values for existing records');
                }
            });
        }
    });
    // Create vehicle_history table if it doesn't exist
    db.run(`
        CREATE TABLE IF NOT EXISTS vehicle_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_id INTEGER NOT NULL,
            action VARCHAR(50) NOT NULL,
            details TEXT,
            user_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
        )
    `, function(err) {
        if (err) {
            console.error('Error creating vehicle_history table:', err.message);
        } else {
            console.log('✓ Created/Verified vehicle_history table');
        }
    });
});

db.close(() => {
    console.log('Database update completed!');
    console.log('\nYou can now use the retirement features.');
});