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
            notes = null,
            supplier_id = null,  // Added supplier_id parameter
            vehicle_id = null    // Added vehicle_id parameter
        } = movementData;

        // Get supplier name if supplier_id is provided
        let supplier_name = null;
        if (supplier_id) {
            supplier_name = await new Promise((resolve) => {
                db.get('SELECT name FROM suppliers WHERE id = ?', [supplier_id], (err, row) => {
                    resolve(err ? null : row?.name);
                });
            });
        }

        // Get vehicle number if vehicle_id is provided
        let vehicle_number = null;
        if (vehicle_id) {
            vehicle_number = await new Promise((resolve) => {
                db.get('SELECT vehicle_number FROM vehicles WHERE id = ?', [vehicle_id], (err, row) => {
                    resolve(err ? null : row?.vehicle_number);
                });
            });
        }

        const sql = `INSERT INTO tire_movements 
                    (tire_id, from_location, to_location, movement_type, 
                     reference_id, reference_type, user_id, notes,
                     supplier_id, supplier_name, vehicle_id, vehicle_number) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                tire_id,
                from_location,
                to_location,
                movement_type,
                reference_id,
                reference_type,
                user_id,
                notes,
                supplier_id,
                supplier_name,
                vehicle_id,
                vehicle_number
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
                t.status,
                -- Use stored vehicle_number if available, otherwise try to get it
                COALESCE(
                    tm.vehicle_number,
                    (SELECT v.vehicle_number 
                     FROM tire_assignments ta 
                     JOIN vehicles v ON ta.vehicle_id = v.id 
                     WHERE ta.id = tm.reference_id AND tm.reference_type = 'ASSIGNMENT')
                ) as vehicle_number,
                -- Use stored supplier_name if available
                COALESCE(
                    tm.supplier_name,
                    s.name
                ) as supplier_name
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
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
                t.status,
                COALESCE(
                    tm.vehicle_number,
                    (SELECT v.vehicle_number 
                     FROM tire_assignments ta 
                     JOIN vehicles v ON ta.vehicle_id = v.id 
                     WHERE ta.id = tm.reference_id AND tm.reference_type = 'ASSIGNMENT')
                ) as vehicle_number,
                COALESCE(
                    tm.supplier_name,
                    s.name
                ) as supplier_name
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
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
                t.status,
                COALESCE(
                    tm.vehicle_number,
                    (SELECT v.vehicle_number 
                     FROM tire_assignments ta 
                     JOIN vehicles v ON ta.vehicle_id = v.id 
                     WHERE ta.id = tm.reference_id AND tm.reference_type = 'ASSIGNMENT')
                ) as vehicle_number,
                COALESCE(
                    tm.supplier_name,
                    s.name
                ) as supplier_name
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
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