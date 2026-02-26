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
            current_location,
            retread_count = 0
        } = tireData;

        // ✅ Validate tire size
        if (!isValidSize(size)) {
            throw new Error(`Invalid tire size: ${size}`);
        }

        const sql = `
            INSERT INTO tires (
                serial_number, size, brand, model, type, status,
                purchase_cost, supplier_id, purchase_date, current_location,
                retread_count, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
                current_location,
                retread_count
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
            SELECT t.*, 
                   s.name AS supplier_name,
                   u.full_name AS disposal_authorized_by_name
            FROM tires t
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
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
                COUNT(CASE WHEN status = 'AWAITING_RETREAD' THEN 1 END) AS retread_candidates_count,
                COUNT(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN 1 END) AS disposed_count
            FROM tires
            WHERE status IN ('IN_STORE', 'USED_STORE', 'AWAITING_RETREAD', 'DISPOSED', 'SCRAP')
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


    // models/Tire.js - Add these methods to your existing Tire class

    /**
     * Get disposed tires with filtering and pagination
     * @param {Object} filters - Filter options
     * @param {string} filters.start_date - Start date for disposal date range
     * @param {string} filters.end_date - End date for disposal date range
     * @param {string} filters.reason - Filter by disposal reason
     * @param {string} filters.method - Filter by disposal method
     * @param {number} filters.limit - Number of records per page
     * @param {number} filters.offset - Offset for pagination
     * @param {string} filters.search - Search term for serial number, size, brand
     * @returns {Promise<Object>} Disposed tires with pagination info
     */
    static async getDisposedTires(filters = {}) {
        const {
            start_date,
            end_date,
            reason,
            method,
            limit = 100,
            offset = 0,
            search
        } = filters;

        const db = require('../config/database');

        let sql = `
            SELECT 
                t.id,
                t.serial_number,
                t.size,
                t.brand,
                t.model,
                t.type,
                t.status,
                t.purchase_date,
                t.purchase_cost,
                t.retread_count,
                t.disposal_date,
                t.disposal_reason,
                t.disposal_method,
                t.disposal_notes,
                t.disposal_authorized_by,
                u.full_name as authorized_by_name,
                s.name as supplier_name,
                tm.movement_date,
                tm.notes as movement_notes,
                (
                    SELECT COUNT(*) 
                    FROM tire_assignments 
                    WHERE tire_id = t.id
                ) as total_assignments,
                (
                    SELECT MAX(removal_odometer) 
                    FROM tire_assignments 
                    WHERE tire_id = t.id
                ) as last_odometer
            FROM tires t
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            LEFT JOIN tire_movements tm ON t.id = tm.tire_id 
                AND tm.movement_type = 'STORE_TO_DISPOSAL'
            WHERE t.status IN ('DISPOSED', 'SCRAP')
        `;

        const params = [];
        const countParams = [];

        // Apply filters
        if (start_date) {
            sql += ` AND t.disposal_date >= ?`;
            params.push(start_date);
            countParams.push(start_date);
        }

        if (end_date) {
            sql += ` AND t.disposal_date <= ?`;
            params.push(end_date);
            countParams.push(end_date);
        }

        if (reason && reason !== 'all' && reason !== 'undefined') {
            sql += ` AND t.disposal_reason = ?`;
            params.push(reason);
            countParams.push(reason);
        }

        if (method && method !== 'all' && method !== 'undefined') {
            sql += ` AND t.disposal_method = ?`;
            params.push(method);
            countParams.push(method);
        }

        if (search && search !== 'undefined') {
            sql += ` AND (
                t.serial_number LIKE ? OR 
                t.size LIKE ? OR 
                t.brand LIKE ? OR 
                t.disposal_reason LIKE ?
            )`;
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
            countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }

        // Get total count for pagination
        let countSql = `
            SELECT COUNT(*) as total
            FROM tires t
            WHERE t.status IN ('DISPOSED', 'SCRAP')
        `;

        // Add filters to count query
        if (start_date) countSql += ` AND t.disposal_date >= ?`;
        if (end_date) countSql += ` AND t.disposal_date <= ?`;
        if (reason && reason !== 'all' && reason !== 'undefined') countSql += ` AND t.disposal_reason = ?`;
        if (method && method !== 'all' && method !== 'undefined') countSql += ` AND t.disposal_method = ?`;
        if (search && search !== 'undefined') {
            countSql += ` AND (
                t.serial_number LIKE ? OR 
                t.size LIKE ? OR 
                t.brand LIKE ? OR 
                t.disposal_reason LIKE ?
            )`;
        }

        const total = await new Promise((resolve, reject) => {
            db.get(countSql, countParams, (err, row) => {
                if (err) {
                    console.error('Error getting total count:', err);
                    reject(err);
                } else resolve(row?.total || 0);
            });
        });

        // Add ordering and pagination
        sql += ` ORDER BY t.disposal_date DESC, t.updated_at DESC
                LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const tires = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error getting disposed tires:', err);
                    reject(err);
                } else resolve(rows);
            });
        });

        return {
            data: tires,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                pages: Math.ceil(total / parseInt(limit)),
                current_page: Math.floor(parseInt(offset) / parseInt(limit)) + 1
            }
        };
    }

    /**
     * Get disposed tires summary statistics
     * @returns {Promise<Object>} Summary statistics for disposed tires
     */
    static async getDisposedTiresSummary() {
        const db = require('../config/database');
        
        const sql = `
            SELECT 
                COUNT(CASE WHEN status = 'DISPOSED' THEN 1 END) as total_disposed,
                COUNT(CASE WHEN status = 'SCRAP' THEN 1 END) as total_scrap,
                SUM(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN COALESCE(purchase_cost, 0) ELSE 0 END) as total_value,
                AVG(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN COALESCE(retread_count, 0) ELSE NULL END) as avg_retread_count,
                MAX(disposal_date) as last_disposal_date,
                MIN(disposal_date) as first_disposal_date,
                COUNT(CASE WHEN julianday('now') - julianday(disposal_date) <= 30 THEN 1 END) as disposed_last_30_days,
                COUNT(CASE WHEN julianday('now') - julianday(disposal_date) <= 90 THEN 1 END) as disposed_last_90_days,
                COUNT(DISTINCT disposal_reason) as unique_reasons,
                COUNT(DISTINCT size) as unique_sizes,
                COUNT(DISTINCT brand) as unique_brands
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
        `;

        return new Promise((resolve, reject) => {
            db.get(sql, [], (err, row) => {
                if (err) {
                    console.error('Error getting disposed tires summary:', err);
                    reject(err);
                } else resolve(row);
            });
        });
    }

    /**
     * Get disposed tires grouped by month for trend analysis
     * @param {number} months - Number of months to analyze
     * @returns {Promise<Array>} Monthly trend data
     */
    static async getDisposedTiresTrend(months = 12) {
        const db = require('../config/database');
        
        const sql = `
            SELECT 
                strftime('%Y-%m', disposal_date) as month,
                COUNT(*) as total_count,
                SUM(CASE WHEN status = 'DISPOSED' THEN 1 ELSE 0 END) as disposed_count,
                SUM(CASE WHEN status = 'SCRAP' THEN 1 ELSE 0 END) as scrap_count,
                SUM(COALESCE(purchase_cost, 0)) as total_value,
                AVG(COALESCE(retread_count, 0)) as avg_retread_count,
                COUNT(DISTINCT size) as unique_sizes,
                COUNT(DISTINCT brand) as unique_brands
            FROM tires
            WHERE disposal_date IS NOT NULL
                AND disposal_date >= date('now', '-' || ? || ' months')
            GROUP BY strftime('%Y-%m', disposal_date)
            ORDER BY month DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [months], (err, rows) => {
                if (err) {
                    console.error('Error getting disposed tires trend:', err);
                    reject(err);
                } else resolve(rows);
            });
        });
    }

    /**
     * Get disposed tires grouped by reason
     * @param {string} year - Optional year filter
     * @returns {Promise<Array>} Disposal reasons with counts
     */
    static async getDisposedTiresByReason(year = null) {
        const db = require('../config/database');
        
        let sql = `
            SELECT 
                disposal_reason,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as total_value,
                AVG(COALESCE(retread_count, 0)) as avg_retread_count,
                COUNT(DISTINCT size) as unique_sizes,
                COUNT(DISTINCT brand) as unique_brands,
                MIN(disposal_date) as first_disposal,
                MAX(disposal_date) as last_disposal
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
                AND disposal_reason IS NOT NULL
        `;

        const params = [];

        if (year) {
            sql += ` AND strftime('%Y', disposal_date) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY disposal_reason
                ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error getting disposed tires by reason:', err);
                    reject(err);
                } else resolve(rows);
            });
        });
    }

    /**
     * Get disposed tires grouped by method
     * @param {string} year - Optional year filter
     * @returns {Promise<Array>} Disposal methods with counts
     */
    static async getDisposedTiresByMethod(year = null) {
        const db = require('../config/database');
        
        let sql = `
            SELECT 
                disposal_method,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as total_value,
                AVG(COALESCE(retread_count, 0)) as avg_retread_count,
                COUNT(DISTINCT disposal_reason) as unique_reasons
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
                AND disposal_method IS NOT NULL
        `;

        const params = [];

        if (year) {
            sql += ` AND strftime('%Y', disposal_date) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY disposal_method
                ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error getting disposed tires by method:', err);
                    reject(err);
                } else resolve(rows);
            });
        });
    }

    /**
     * Get disposed tires grouped by size
     * @param {string} year - Optional year filter
     * @returns {Promise<Array>} Sizes with disposal counts
     */
    static async getDisposedTiresBySize(year = null) {
        const db = require('../config/database');
        
        let sql = `
            SELECT 
                size,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as total_value,
                AVG(COALESCE(retread_count, 0)) as avg_retread_count,
                COUNT(DISTINCT disposal_reason) as unique_reasons,
                COUNT(DISTINCT brand) as unique_brands
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
                AND disposal_date IS NOT NULL
        `;

        const params = [];

        if (year) {
            sql += ` AND strftime('%Y', disposal_date) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY size
                ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error getting disposed tires by size:', err);
                    reject(err);
                } else resolve(rows);
            });
        });
    }

    /**
     * Get a single disposed tire by ID with full details
     * @param {number} tireId - Tire ID
     * @returns {Promise<Object>} Disposed tire details
     */
    static async getDisposedTireById(tireId) {
        const db = require('../config/database');
        
        const sql = `
            SELECT 
                t.*,
                u.full_name as authorized_by_name,
                u.username as authorized_by_username,
                s.name as supplier_name,
                s.contact_person as supplier_contact,
                s.phone as supplier_phone,
                s.email as supplier_email,
                tm.movement_date as disposal_movement_date,
                tm.notes as movement_notes,
                tm.user_id as movement_user_id,
                mu.full_name as movement_user_name,
                (
                    SELECT COUNT(*) 
                    FROM tire_assignments 
                    WHERE tire_id = t.id
                ) as total_assignments,
                (
                    SELECT json_group_array(
                        json_object(
                            'vehicle_id', ta.vehicle_id,
                            'vehicle_number', v.vehicle_number,
                            'install_date', ta.install_date,
                            'removal_date', ta.removal_date,
                            'install_odometer', ta.install_odometer,
                            'removal_odometer', ta.removal_odometer,
                            'position_name', wp.position_name
                        )
                    )
                    FROM tire_assignments ta
                    LEFT JOIN vehicles v ON ta.vehicle_id = v.id
                    LEFT JOIN wheel_positions wp ON ta.position_id = wp.id
                    WHERE ta.tire_id = t.id
                    ORDER BY ta.install_date DESC
                ) as assignment_history
            FROM tires t
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            LEFT JOIN tire_movements tm ON t.id = tm.tire_id 
                AND tm.movement_type = 'STORE_TO_DISPOSAL'
            LEFT JOIN users mu ON tm.user_id = mu.id
            WHERE t.id = ?
                AND t.status IN ('DISPOSED', 'SCRAP')
        `;

        return new Promise((resolve, reject) => {
            db.get(sql, [tireId], (err, row) => {
                if (err) {
                    console.error('Error getting disposed tire by ID:', err);
                    reject(err);
                } else {
                    if (row && row.assignment_history) {
                        try {
                            row.assignment_history = JSON.parse(row.assignment_history);
                        } catch (e) {
                            row.assignment_history = [];
                        }
                    }
                    resolve(row);
                }
            });
        });
    }

    /**
     * Export disposed tires data
     * @param {Object} filters - Filter options
     * @returns {Promise<Array>} Disposed tires data for export
     */
    static async exportDisposedTires(filters = {}) {
        const {
            start_date,
            end_date,
            reason,
            method
        } = filters;

        const db = require('../config/database');

        let sql = `
            SELECT 
                t.serial_number,
                t.size,
                t.brand,
                t.model,
                t.type,
                t.status,
                t.purchase_date,
                t.purchase_cost,
                t.retread_count,
                t.disposal_date,
                t.disposal_reason,
                t.disposal_method,
                t.disposal_notes,
                u.full_name as authorized_by_name,
                s.name as supplier_name,
                (
                    SELECT COUNT(*) 
                    FROM tire_assignments 
                    WHERE tire_id = t.id
                ) as total_assignments,
                (
                    SELECT MAX(removal_odometer) 
                    FROM tire_assignments 
                    WHERE tire_id = t.id
                ) as last_odometer
            FROM tires t
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            WHERE t.status IN ('DISPOSED', 'SCRAP')
        `;

        const params = [];

        if (start_date) {
            sql += ` AND t.disposal_date >= ?`;
            params.push(start_date);
        }

        if (end_date) {
            sql += ` AND t.disposal_date <= ?`;
            params.push(end_date);
        }

        if (reason && reason !== 'all' && reason !== 'undefined') {
            sql += ` AND t.disposal_reason = ?`;
            params.push(reason);
        }

        if (method && method !== 'all' && method !== 'undefined') {
            sql += ` AND t.disposal_method = ?`;
            params.push(method);
        }

        sql += ` ORDER BY t.disposal_date DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) {
                    console.error('Error exporting disposed tires:', err);
                    reject(err);
                } else resolve(rows);
            });
        });
    }

    // ==================== DISPOSAL METHODS ====================

    /**
     * Dispose a single tire
     */
    static async dispose(tireId, disposalData) {
        const {
            disposal_date,
            disposal_reason,
            disposal_method = 'DISPOSAL',
            disposal_authorized_by,
            disposal_notes,
            user_id
        } = disposalData;

        const db = require('../config/database');

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Get current tire info for movement
                db.get(
                    'SELECT status, current_location, serial_number FROM tires WHERE id = ?',
                    [tireId],
                    (err, tire) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }

                        if (!tire) {
                            db.run('ROLLBACK');
                            reject(new Error('Tire not found'));
                            return;
                        }

                        // Update tire status to disposed
                        db.run(
                            `UPDATE tires 
                             SET status = ?,
                                 disposal_date = ?,
                                 disposal_reason = ?,
                                 disposal_method = ?,
                                 disposal_authorized_by = ?,
                                 disposal_notes = ?,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [
                                disposal_method === 'scrap' ? 'SCRAP' : 'DISPOSED',
                                disposal_date || new Date().toISOString().split('T')[0],
                                disposal_reason,
                                disposal_method,
                                disposal_authorized_by || user_id,
                                disposal_notes || null,
                                tireId
                            ],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                // Create movement record
                                db.run(
                                    `INSERT INTO tire_movements 
                                     (tire_id, from_location, to_location, movement_type,
                                      user_id, notes, reference_id, reference_type)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        tireId,
                                        tire.current_location || tire.status,
                                        'DISPOSAL',
                                        'STORE_TO_DISPOSAL',
                                        user_id,
                                        disposal_notes || `Disposed: ${disposal_reason} (${disposal_method})`,
                                        null,
                                        'DISPOSAL'
                                    ],
                                    function(err) {
                                        if (err) {
                                            console.error('Error creating movement:', err);
                                            // Continue even if movement fails
                                        }

                                        db.run('COMMIT', (err) => {
                                            if (err) reject(err);
                                            else resolve({
                                                id: tireId,
                                                serial_number: tire.serial_number,
                                                status: disposal_method === 'scrap' ? 'SCRAP' : 'DISPOSED',
                                                disposal_date: disposal_date || new Date().toISOString().split('T')[0]
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    }

    /**
     * Bulk dispose multiple tires
     */
    static async bulkDispose(tireIds, disposalData) {
        const {
            disposal_date,
            disposal_reason,
            disposal_method = 'DISPOSAL',
            disposal_authorized_by,
            disposal_notes,
            user_id
        } = disposalData;

        const results = {
            success: [],
            failed: []
        };

        for (const tireId of tireIds) {
            try {
                const result = await this.dispose(tireId, {
                    disposal_date,
                    disposal_reason,
                    disposal_method,
                    disposal_authorized_by,
                    disposal_notes,
                    user_id
                });
                results.success.push(result);
            } catch (error) {
                results.failed.push({
                    id: tireId,
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Get disposal history with filters
     */
    static async getDisposalHistory(filters = {}) {
        const {
            start_date,
            end_date,
            reason,
            method,
            limit = 100,
            offset = 0
        } = filters;

        let sql = `
            SELECT 
                t.id,
                t.serial_number,
                t.size,
                t.brand,
                t.model,
                t.type,
                t.status,
                t.disposal_date,
                t.disposal_reason,
                t.disposal_method,
                t.disposal_notes,
                t.purchase_cost,
                t.retread_count,
                u.full_name as authorized_by_name,
                tm.movement_date,
                tm.notes as movement_notes
            FROM tires t
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
            LEFT JOIN tire_movements tm ON t.id = tm.tire_id 
                AND tm.movement_type = 'STORE_TO_DISPOSAL'
            WHERE t.status IN ('DISPOSED', 'SCRAP')
        `;

        const params = [];

        if (start_date) {
            sql += ` AND t.disposal_date >= ?`;
            params.push(start_date);
        }

        if (end_date) {
            sql += ` AND t.disposal_date <= ?`;
            params.push(end_date);
        }

        if (reason) {
            sql += ` AND t.disposal_reason = ?`;
            params.push(reason);
        }

        if (method) {
            sql += ` AND t.disposal_method = ?`;
            params.push(method);
        }

        // Get total count
        const countSql = sql.replace(
            /SELECT.*?FROM/,
            'SELECT COUNT(DISTINCT t.id) as total FROM'
        ).split('ORDER BY')[0];

        const total = await new Promise((resolve, reject) => {
            db.get(countSql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row?.total || 0);
            });
        });

        // Add ordering and pagination
        sql += ` ORDER BY t.disposal_date DESC, t.updated_at DESC
                LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const history = await new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        return {
            data: history,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };
    }

    /**
     * Get disposal summary statistics
     */
    static async getDisposalStats() {
        const sql = `
            SELECT 
                COUNT(CASE WHEN status = 'DISPOSED' THEN 1 END) as disposed_count,
                COUNT(CASE WHEN status = 'SCRAP' THEN 1 END) as scrap_count,
                SUM(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN COALESCE(purchase_cost, 0) ELSE 0 END) as total_disposed_value,
                AVG(CASE WHEN status IN ('DISPOSED', 'SCRAP') THEN COALESCE(retread_count, 0) ELSE NULL END) as avg_retread_count_before_disposal,
                COUNT(DISTINCT disposal_reason) as unique_disposal_reasons,
                MAX(disposal_date) as last_disposal_date,
                COUNT(CASE WHEN julianday('now') - julianday(disposal_date) <= 30 THEN 1 END) as disposed_last_30_days
            FROM tires
        `;

        return new Promise((resolve, reject) => {
            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get disposal summary by reason
     */
    static async getDisposalSummaryByReason(year = null) {
        let sql = `
            SELECT 
                disposal_reason,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as total_value,
                AVG(COALESCE(retread_count, 0)) as avg_retread_count,
                MIN(disposal_date) as first_disposal,
                MAX(disposal_date) as last_disposal
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
            AND disposal_reason IS NOT NULL
        `;

        const params = [];

        if (year) {
            sql += ` AND strftime('%Y', disposal_date) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY disposal_reason
                 ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get disposal summary by method
     */
    static async getDisposalSummaryByMethod(year = null) {
        let sql = `
            SELECT 
                disposal_method,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as total_value
            FROM tires
            WHERE status IN ('DISPOSED', 'SCRAP')
            AND disposal_method IS NOT NULL
        `;

        const params = [];

        if (year) {
            sql += ` AND strftime('%Y', disposal_date) = ?`;
            params.push(year);
        }

        sql += ` GROUP BY disposal_method
                 ORDER BY count DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get monthly disposal trend
     */
    static async getMonthlyDisposalTrend(months = 12) {
        const sql = `
            SELECT 
                strftime('%Y-%m', disposal_date) as month,
                COUNT(*) as count,
                SUM(COALESCE(purchase_cost, 0)) as value,
                COUNT(CASE WHEN disposal_method = 'scrap' THEN 1 END) as scrap_count,
                COUNT(CASE WHEN disposal_method != 'scrap' THEN 1 END) as disposal_count
            FROM tires
            WHERE disposal_date IS NOT NULL
            GROUP BY strftime('%Y-%m', disposal_date)
            ORDER BY month DESC
            LIMIT ?
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [months], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get eligible tires for disposal
     */
    static async getEligibleForDisposal(statuses = ['USED_STORE', 'DAMAGED']) {
        const placeholders = statuses.map(() => '?').join(',');

        const sql = `
            SELECT 
                t.*,
                s.name as supplier_name,
                MAX(ta.install_date) as last_used_date,
                MAX(ta.removal_date) as last_removal_date,
                MAX(ta.removal_odometer) as last_odometer,
                COUNT(DISTINCT ta.id) as usage_count,
                (
                    SELECT COUNT(*) 
                    FROM tire_movements 
                    WHERE tire_id = t.id
                ) as movement_count
            FROM tires t
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            LEFT JOIN tire_assignments ta ON t.id = ta.tire_id
            WHERE t.status IN (${placeholders})
            GROUP BY t.id
            ORDER BY 
                CASE 
                    WHEN t.status = 'DAMAGED' THEN 1
                    WHEN t.status = 'USED_STORE' THEN 2
                    ELSE 3
                END,
                t.retread_count DESC,
                t.purchase_date ASC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, statuses, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get all unique disposal reasons
     */
    static async getDisposalReasons() {
        const sql = `
            SELECT 
                disposal_reason,
                COUNT(*) as count
            FROM tires
            WHERE disposal_reason IS NOT NULL
            GROUP BY disposal_reason
            ORDER BY count DESC
        `;

        return new Promise((resolve, reject) => {
            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    /**
     * Get disposal certificate data for a tire
     */
    static async getDisposalCertificate(tireId) {
        const sql = `
            SELECT 
                t.*,
                s.name as supplier_name,
                u.full_name as authorized_by_name,
                tm.movement_date as disposal_movement_date,
                tm.notes as movement_notes
            FROM tires t
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            LEFT JOIN users u ON t.disposal_authorized_by = u.id
            LEFT JOIN tire_movements tm ON t.id = tm.tire_id 
                AND tm.movement_type = 'STORE_TO_DISPOSAL'
            WHERE t.id = ?
        `;

        return new Promise((resolve, reject) => {
            db.get(sql, [tireId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Reverse/Cancel a disposal (admin only)
     */
    static async reverseDisposal(tireId, user_id, reason) {
        const db = require('../config/database');

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Check if tire is disposed
                db.get(
                    'SELECT status, serial_number FROM tires WHERE id = ?',
                    [tireId],
                    (err, tire) => {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }

                        if (!tire) {
                            db.run('ROLLBACK');
                            reject(new Error('Tire not found'));
                            return;
                        }

                        if (tire.status !== 'DISPOSED' && tire.status !== 'SCRAP') {
                            db.run('ROLLBACK');
                            reject(new Error('Tire is not disposed'));
                            return;
                        }

                        // Revert to previous status (USED_STORE as default)
                        db.run(
                            `UPDATE tires 
                             SET status = 'USED_STORE',
                                 current_location = 'MAIN_WAREHOUSE',
                                 disposal_date = NULL,
                                 disposal_reason = NULL,
                                 disposal_method = NULL,
                                 disposal_authorized_by = NULL,
                                 disposal_notes = NULL,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [tireId],
                            function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                // Create reversal movement
                                db.run(
                                    `INSERT INTO tire_movements 
                                     (tire_id, from_location, to_location, movement_type,
                                      user_id, notes)
                                     VALUES (?, ?, ?, ?, ?, ?)`,
                                    [
                                        tireId,
                                        'DISPOSAL',
                                        'MAIN_WAREHOUSE',
                                        'DISPOSAL_REVERSAL',
                                        user_id,
                                        reason || 'Disposal reversed'
                                    ],
                                    function(err) {
                                        if (err) {
                                            console.error('Error creating movement:', err);
                                        }

                                        db.run('COMMIT', (err) => {
                                            if (err) reject(err);
                                            else resolve({
                                                id: tireId,
                                                serial_number: tire.serial_number,
                                                status: 'USED_STORE'
                                            });
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            });
        });
    }
}

module.exports = Tire;