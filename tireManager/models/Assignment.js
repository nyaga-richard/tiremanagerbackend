const db = require('../config/database');

class Assignment {
    static async create(assignmentData) {
        const {
            tire_id,
            vehicle_id,
            position_id,
            install_date,
            install_odometer,
            reason_for_change = null,
            created_by
        } = assignmentData;

        // First, check if there's an existing assignment at this position
        const checkSql = `SELECT id FROM tire_assignments 
                         WHERE vehicle_id = ? AND position_id = ? AND removal_date IS NULL`;
        
        return new Promise((resolve, reject) => {
            db.get(checkSql, [vehicle_id, position_id], async (err, existing) => {
                if (err) {
                    reject(err);
                    return;
                }

                // If there's an existing assignment, mark it as removed
                if (existing) {
                    await this.markAsRemoved(existing.id, install_date, install_odometer, reason_for_change);
                }

                // Create new assignment
                const insertSql = `INSERT INTO tire_assignments 
                                  (tire_id, vehicle_id, position_id, install_date, 
                                   install_odometer, reason_for_change, created_by) 
                                  VALUES (?, ?, ?, ?, ?, ?, ?)`;

                db.run(insertSql, [
                    tire_id,
                    vehicle_id,
                    position_id,
                    install_date,
                    install_odometer,
                    reason_for_change,
                    created_by
                ], function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
            });
        });
    }

    static async markAsRemoved(assignmentId, removalDate, removalOdometer, reason) {
        const sql = `UPDATE tire_assignments 
                    SET removal_date = ?, removal_odometer = ?, reason_for_change = ?
                    WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, [removalDate, removalOdometer, reason, assignmentId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async getTireHistory(tireId) {
        const sql = `
            SELECT 
                ta.*,
                v.vehicle_number,
                v.make,
                v.model,
                wp.position_code,
                wp.position_name
            FROM tire_assignments ta
            JOIN vehicles v ON ta.vehicle_id = v.id
            JOIN wheel_positions wp ON ta.position_id = wp.id
            WHERE ta.tire_id = ?
            ORDER BY ta.install_date DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [tireId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getVehicleHistory(vehicleId, limit = 100) {
        const sql = `
            SELECT 
                ta.*,
                t.serial_number,
                t.size,
                t.brand,
                t.type,
                wp.position_code,
                wp.position_name
            FROM tire_assignments ta
            JOIN tires t ON ta.tire_id = t.id
            JOIN wheel_positions wp ON ta.position_id = wp.id
            WHERE ta.vehicle_id = ?
            ORDER BY ta.install_date DESC
            LIMIT ?`;

        return new Promise((resolve, reject) => {
            db.all(sql, [vehicleId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getPositionHistory(vehicleId, positionId) {
        const sql = `
            SELECT 
                ta.*,
                t.serial_number,
                t.size,
                t.brand,
                t.type
            FROM tire_assignments ta
            JOIN tires t ON ta.tire_id = t.id
            WHERE ta.vehicle_id = ? AND ta.position_id = ?
            ORDER BY ta.install_date DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [vehicleId, positionId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getCurrentAssignment(tireId) {
        const sql = `
            SELECT ta.*, v.vehicle_number, wp.position_code
            FROM tire_assignments ta
            JOIN vehicles v ON ta.vehicle_id = v.id
            JOIN wheel_positions wp ON ta.position_id = wp.id
            WHERE ta.tire_id = ? AND ta.removal_date IS NULL`;

        return new Promise((resolve, reject) => {
            db.get(sql, [tireId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = Assignment;