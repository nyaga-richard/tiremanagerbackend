require("dotenv").config()
const sqlite3 = require('sqlite3').verbose();


const DB_PATH = process.env.DB_PATH || "./database/tires.db"

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error connecting to database:', err.message);
    } else {
        console.log('Connected to SQLite database');
        
        // Enable foreign keys
        db.run('PRAGMA foreign_keys = ON');
        
        // Enable WAL mode for better concurrency
        db.run('PRAGMA journal_mode = WAL');
        
        // Set busy timeout
        db.configure('busyTimeout', 5000);
    }
});

// Error handler
db.on('error', (err) => {
    console.error('Database error:', err);
});

// Close database connection on process exit
process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
        process.exit(0);
    });
});

module.exports = db;
