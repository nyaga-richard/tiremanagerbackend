const db = require('../config/database');

class Movement {
    static async logMovement(movementData) {
        const {
            tire_id,
            from_location,
            to_location,
            movement_type,
            reference_id = null,
            reference_type = null,
            user_id,
            notes = null
        } = movementData;

        const sql = `INSERT INTO tire_movements 
                    (tire_id, from_location, to_location, movement_type, 
                     reference_id, reference_type, user_id, notes) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                tire_id,
                from_location,
                to_location,
                movement_type,
                reference_id,
                reference_type,
                user_id,
                notes
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async getMovementsByTire(tireId, limit = 50) {
        const sql = `
            SELECT 
                tm.*,
                t.serial_number,
                t.size,
                t.brand,
                v.vehicle_number
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN tire_assignments ta
                ON tm.reference_type = 'ASSIGNMENT'
                AND tm.reference_id = ta.id
            LEFT JOIN vehicles v ON ta.vehicle_id = v.id
            WHERE tm.tire_id = ?
            ORDER BY tm.movement_date DESC
            LIMIT ?`;

        return new Promise((resolve, reject) => {
            db.all(sql, [tireId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }


    static async getMovementsByDate(startDate, endDate) {
        const sql = `
            SELECT 
                tm.*,
                t.serial_number,
                t.size,
                t.brand,
                v.vehicle_number
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN tire_assignments ta
                ON tm.reference_type = 'ASSIGNMENT'
                AND tm.reference_id = ta.id
            LEFT JOIN vehicles v ON ta.vehicle_id = v.id
            WHERE DATE(tm.movement_date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY tm.movement_date DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [startDate, endDate], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

        static async getMovementsBySize(size, startDate, endDate) {
        const sql = `
            SELECT 
                tm.*,
                t.serial_number,
                t.size,
                t.brand,
                v.vehicle_number
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN tire_assignments ta
                ON tm.reference_type = 'ASSIGNMENT'
                AND tm.reference_id = ta.id
            LEFT JOIN vehicles v ON ta.vehicle_id = v.id
            WHERE t.size = ?
            AND tm.movement_date >= ?
            AND tm.movement_date < DATE(?, '+1 day')
            ORDER BY tm.movement_date DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [size, startDate, endDate], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }




    static async getDashboardStats(startDate, endDate) {
        const sql = `
            SELECT 
                movement_type,
                COUNT(*) as count,
                COUNT(DISTINCT tire_id) as unique_tires
            FROM tire_movements
            WHERE DATE(movement_date) BETWEEN DATE(?) AND DATE(?)
            GROUP BY movement_type
            ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [startDate, endDate], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = Movement;