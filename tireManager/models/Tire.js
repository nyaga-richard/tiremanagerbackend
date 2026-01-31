const db = require('../config/database');
const { TIRE_SIZES, isValidSize } = require('../constants/tireSizes');

class Tire {

    static async create(tireData) {
        const {
            serial_number,
            size,
            brand,
            model,
            type = 'NEW',
            status = 'IN_STORE',
            purchase_cost,
            supplier_id,
            purchase_date,
            current_location
        } = tireData;

        // ✅ Validate tire size
        if (!isValidSize(size)) {
            throw new Error(`Invalid tire size: ${size}`);
        }

        const sql = `
            INSERT INTO tires (
                serial_number, size, brand, model, type, status,
                purchase_cost, supplier_id, purchase_date, current_location
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                serial_number,
                size,
                brand,
                model,
                type,
                status,
                purchase_cost,
                supplier_id,
                purchase_date,
                current_location
            ], function (err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async findBySerial(serialNumber) {
        const sql = `SELECT * FROM tires WHERE serial_number = ?`;
        return new Promise((resolve, reject) => {
            db.get(sql, [serialNumber], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findById(id) {
        const sql = `
            SELECT t.*, s.name AS supplier_name
            FROM tires t
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            WHERE t.id = ?
        `;
        return new Promise((resolve, reject) => {
            db.get(sql, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async updateStatus(id, status, location = null) {
        const sql = location
            ? `UPDATE tires SET status = ?, current_location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            : `UPDATE tires SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

        const params = location ? [status, location, id] : [status, id];

        return new Promise((resolve, reject) => {
            db.run(sql, params, function (err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async findAllByStatus(status) {
        const sql = `SELECT * FROM tires WHERE status = ? ORDER BY size, brand`;
        return new Promise((resolve, reject) => {
            db.all(sql, [status], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getInventoryBySize() {
        const sql = `
            SELECT 
                size,
                COUNT(CASE WHEN status = 'IN_STORE' AND type = 'NEW' THEN 1 END) AS new_count,
                COUNT(CASE WHEN status = 'IN_STORE' AND type = 'RETREADED' THEN 1 END) AS retreaded_count,
                COUNT(CASE WHEN status = 'USED_STORE' THEN 1 END) AS used_count,
                COUNT(CASE WHEN status = 'AWAITING_RETREAD' THEN 1 END) AS retread_candidates_count
            FROM tires
            WHERE status IN ('IN_STORE', 'USED_STORE', 'AWAITING_RETREAD')
            GROUP BY size
            ORDER BY size
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getRetreadCandidates() {
        const sql = `
            SELECT t.*, s.name AS supplier_name
            FROM tires t
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            WHERE t.status = 'AWAITING_RETREAD'
            ORDER BY t.size, t.brand
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getHistory(tireId) {
        const sql = `
            SELECT 
                tm.*,
                ta.vehicle_id,
                v.vehicle_number,
                ta.position_id,
                wp.position_name
            FROM tire_movements tm
            LEFT JOIN tire_assignments ta 
                ON tm.reference_id = ta.id 
                AND tm.reference_type = 'ASSIGNMENT'
            LEFT JOIN vehicles v ON ta.vehicle_id = v.id
            LEFT JOIN wheel_positions wp ON ta.position_id = wp.id
            WHERE tm.tire_id = ?
            ORDER BY tm.movement_date DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [tireId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getTiresBySize(size, status = null) {
        // ✅ Validate size before querying
        if (!isValidSize(size)) {
            throw new Error(`Invalid tire size: ${size}`);
        }

        let sql = `
            SELECT 
                t.*,
                v.vehicle_number AS current_vehicle,
                wp.position_name AS position
            FROM tires t
            LEFT JOIN tire_assignments ta 
                ON t.id = ta.tire_id AND ta.removal_date IS NULL
            LEFT JOIN vehicles v ON ta.vehicle_id = v.id
            LEFT JOIN wheel_positions wp ON ta.position_id = wp.id
            WHERE t.size = ?
        `;

        const params = [size];

        if (status && status !== 'all') {
            sql += ` AND t.status = ?`;
            params.push(status);
        }

        sql += ` ORDER BY t.status, t.brand, t.serial_number`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }
}

module.exports = Tire;
