const db = require('../config/database');

class Vehicle {
    static async create(vehicleData) {
        const {
            vehicle_number,
            make,
            model,
            year,
            wheel_config,
            current_odometer = 0,
            status = 'ACTIVE'
        } = vehicleData;

        const sql = `INSERT INTO vehicles 
                    (vehicle_number, make, model, year, wheel_config, current_odometer, status) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                vehicle_number, make, model, year, wheel_config, current_odometer, status
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async addWheelPositions(vehicleId, positions) {
        const sql = `INSERT INTO wheel_positions 
                    (vehicle_id, position_code, position_name, axle_number, is_trailer) 
                    VALUES (?, ?, ?, ?, ?)`;

        const promises = positions.map(pos => {
            return new Promise((resolve, reject) => {
                db.run(sql, [
                    vehicleId,
                    pos.position_code,
                    pos.position_name,
                    pos.axle_number || null,
                    pos.is_trailer || 0
                ], function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                });
            });
        });

        return Promise.all(promises);
    }

    static async getVehicleWithPositions(vehicleId) {
        const vehicleSql = `SELECT * FROM vehicles WHERE id = ?`;
        const positionsSql = `SELECT * FROM wheel_positions WHERE vehicle_id = ? ORDER BY axle_number, position_code`;
        
        return new Promise((resolve, reject) => {
            db.get(vehicleSql, [vehicleId], (err, vehicle) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.all(positionsSql, [vehicleId], (err, positions) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    vehicle.positions = positions;
                    resolve(vehicle);
                });
            });
        });
    }

    static async getCurrentTires(vehicleId) {
        const sql = `
            SELECT 
                ta.*,
                t.serial_number,
                t.size,
                t.brand,
                t.type,
                wp.position_code,
                wp.position_name,
                v.vehicle_number
            FROM tire_assignments ta
            JOIN tires t ON ta.tire_id = t.id
            JOIN wheel_positions wp ON ta.position_id = wp.id
            JOIN vehicles v ON ta.vehicle_id = v.id
            WHERE ta.vehicle_id = ? AND ta.removal_date IS NULL
            ORDER BY wp.axle_number, wp.position_code`;

        return new Promise((resolve, reject) => {
            db.all(sql, [vehicleId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getAllVehicles() {
        const sql = `
            SELECT v.*, 
                   COUNT(DISTINCT CASE WHEN ta.removal_date IS NULL THEN ta.id END) as active_tires_count
            FROM vehicles v
            LEFT JOIN tire_assignments ta ON v.id = ta.vehicle_id
            GROUP BY v.id
            ORDER BY v.vehicle_number`;

        return new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getPaginatedVehicles({ limit, offset, search }) {
    const where = search
        ? `WHERE vehicle_number LIKE ? OR make LIKE ? OR model LIKE ?`
        : '';

    const params = search
        ? [`%${search}%`, `%${search}%`, `%${search}%`]
        : [];

    const vehicles = await new Promise((resolve, reject) => {
        db.all(
            `
            SELECT v.*,
                (
                    SELECT COUNT(*)
                    FROM tire_assignments ta
                    WHERE ta.vehicle_id = v.id
                      AND ta.removal_date IS NULL
                ) AS active_tires_count
            FROM vehicles v
            ${where}
            ORDER BY v.created_at DESC
            LIMIT ? OFFSET ?
            `,
            [...params, limit, offset],
            (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            }
        );
    });

    const total = await new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM vehicles ${where}`,
            params,
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });

    return { vehicles, total };
}

}

module.exports = Vehicle;