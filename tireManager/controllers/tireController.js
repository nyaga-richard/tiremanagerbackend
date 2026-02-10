const Tire = require('../models/Tire');
const Movement = require('../models/Movement');
const Assignment = require('../models/Assignment');
const Supplier = require('../models/Supplier');


class TireController {

     static async getRetreadEligibleTires(req, res) {
        try {
            const { size, brand } = req.query;
            
            let sql = `
                SELECT 
                    t.*,
                    s.name as supplier_name,
                    (SELECT COUNT(*) FROM tire_movements 
                     WHERE tire_id = t.id 
                     AND movement_type = 'STORE_TO_RETREAD_SUPPLIER') as previous_retread_count
                FROM tires t
                LEFT JOIN suppliers s ON t.supplier_id = s.id
                WHERE t.status IN ('USED_STORE', 'AWAITING_RETREAD')
                `;
            
            const params = [];
            
            if (size) {
                sql += ` AND t.size = ?`;
                params.push(size);
            }
            
            if (brand) {
                sql += ` AND t.brand LIKE ?`;
                params.push(`%${brand}%`);
            }
            
            sql += ` ORDER BY t.size, t.brand, t.serial_number`;
            
            const db = require('../config/database');
            const tires = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            res.json({
                success: true,
                count: tires.length,
                data: tires
            });
            
        } catch (error) {
            console.error('Error fetching retread eligible tires:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch retread eligible tires' 
            });
        }
    }

    // 2. Send multiple tires for retreading in batch
    static async sendForRetreading(req, res) {
        try {
            const { 
                tire_ids, 
                supplier_id, 
                send_date, 
                expected_cost, 
                user_id, 
                notes,
                expected_return_date 
            } = req.body;

            // Validate required fields
            if (!tire_ids || !Array.isArray(tire_ids) || tire_ids.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one tire must be selected for retreading' 
                });
            }

            if (!supplier_id || !user_id || !send_date) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Supplier, user, and send date are required' 
                });
            }

            const db = require('../config/database');
            const errors = [];
            const sentTires = [];
            const failedTires = [];

            // Process each tire individually
            for (const tire_id of tire_ids) {
                try {
                    // Validate tire eligibility
                    const tire = await Tire.findById(tire_id);
                    
                    if (!tire) {
                        errors.push(`Tire ID ${tire_id}: Not found`);
                        failedTires.push({ tire_id, error: 'Not found' });
                        continue;
                    }

                    // Check if tire is eligible for retreading
                    if (tire.status !== 'USED_STORE' && tire.status !== 'AWAITING_RETREAD')  {
                        errors.push(`Tire ${tire.serial_number}: Not in USED_STORE status (current: ${tire.status})`);
                        failedTires.push({ 
                            tire_id, 
                            serial_number: tire.serial_number, 
                            error: `Invalid status: ${tire.status}` 
                        });
                        continue;
                    }

                    // if (tire.type !== 'NEW') {
                    //     errors.push(`Tire ${tire.serial_number}: Already retreaded (type: ${tire.type})`);
                    //     failedTires.push({ 
                    //         tire_id, 
                    //         serial_number: tire.serial_number, 
                    //         error: `Already retreaded: ${tire.type}` 
                    //     });
                    //     continue;
                    // }

                    // Get supplier details
                    const supplier = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT id, name, type FROM suppliers WHERE id = ?',
                            [supplier_id],
                            (err, row) => err ? reject(err) : resolve(row)
                        );
                    });

                    if (!supplier) {
                        errors.push(`Supplier ID ${supplier_id}: Not a valid retread supplier`);
                        failedTires.push({ 
                            tire_id, 
                            serial_number: tire.serial_number, 
                            error: 'Invalid retread supplier' 
                        });
                        continue;
                    }

                    // Begin transaction for this tire
                    await new Promise((resolve, reject) => {
                        db.serialize(() => {
                            db.run('BEGIN TRANSACTION');

                            // Update tire status to "AT_RETREAD_SUPPLIER"
                            db.run(
                                `UPDATE tires 
                                 SET status = 'AT_RETREAD_SUPPLIER', 
                                     current_location = ?, 
                                     updated_at = CURRENT_TIMESTAMP 
                                 WHERE id = ?`,
                                [`RETREAD_SUPPLIER-${supplier_id}`, tire_id],
                                function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }

                                    // Log movement with supplier information
                                    const movementSql = `
                                        INSERT INTO tire_movements 
                                        (tire_id, from_location, to_location, movement_type,
                                         user_id, notes, supplier_id, supplier_name)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

                                    db.run(movementSql, [
                                        tire_id,
                                        'MAIN_WAREHOUSE',
                                        `RETREAD_SUPPLIER-${supplier_id}`,
                                        'STORE_TO_RETREAD_SUPPLIER',
                                        user_id,
                                        notes || `Sent for retreading to ${supplier.name}`,
                                        supplier_id,
                                        supplier.name
                                    ], function(err) {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }

                                        // Add to supplier ledger
                                        const ledgerSql = `
                                            INSERT INTO supplier_ledger 
                                            (supplier_id, date, description, transaction_type,
                                             amount, reference_number, created_by)
                                            VALUES (?, ?, ?, ?, ?, ?, ?)`;

                                        const expectedCostPerTire = expected_cost / tire_ids.length;
                                        
                                        db.run(ledgerSql, [
                                            supplier_id,
                                            send_date,
                                            `Retreading service for tire ${tire.serial_number}`,
                                            'RETREAD_SERVICE',
                                            expectedCostPerTire,
                                            `RETREAD-${Date.now()}-${tire.serial_number}`,
                                            user_id
                                        ], function(err) {
                                            if (err) {
                                                db.run('ROLLBACK');
                                                reject(err);
                                            } else {
                                                db.run('COMMIT');
                                                resolve();
                                            }
                                        });
                                    });
                                }
                            );
                        });
                    });

                    sentTires.push({
                        tire_id,
                        serial_number: tire.serial_number,
                        size: tire.size,
                        brand: tire.brand,
                        success: true
                    });

                } catch (tireError) {
                    console.error(`Error processing tire ${tire_id}:`, tireError);
                    failedTires.push({ 
                        tire_id, 
                        error: tireError.message || 'Processing failed' 
                    });
                }
            }

            // Prepare response
            const response = {
                success: sentTires.length > 0,
                message: `Sent ${sentTires.length} tire(s) for retreading, ${failedTires.length} failed`,
                sent_tires: sentTires,
                failed_tires: failedTires
            };

            if (errors.length > 0) {
                response.errors = errors;
            }

            if (sentTires.length === 0) {
                return res.status(400).json(response);
            }

            res.json(response);

        } catch (error) {
            console.error('Error sending tires for retreading:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to send tires for retreading',
                details: error.message 
            });
        }
    }

    // 3. Return tire from retreading
    static async returnFromRetreading(req, res) {
        try {
            const { 
                tire_ids, 
                return_date, 
                actual_cost, 
                user_id, 
                notes,
                new_serial_numbers = []  // Optional: new serial numbers after retreading
            } = req.body;

            // Validate required fields
            if (!tire_ids || !Array.isArray(tire_ids) || tire_ids.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one tire must be selected for return' 
                });
            }

            if (!user_id || !return_date) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'User and return date are required' 
                });
            }

            const db = require('../config/database');
            const returnedTires = [];
            const failedTires = [];
            const errors = [];

            // Process each tire
            for (let i = 0; i < tire_ids.length; i++) {
                const tire_id = tire_ids[i];
                const new_serial = new_serial_numbers[i] || null;

                try {
                    // Validate tire
                    const tire = await Tire.findById(tire_id);
                    
                    if (!tire) {
                        errors.push(`Tire ID ${tire_id}: Not found`);
                        failedTires.push({ tire_id, error: 'Not found' });
                        continue;
                    }

                    // Check if tire is at retread supplier
                    if (tire.status !== 'AT_RETREAD_SUPPLIER') {
                        errors.push(`Tire ${tire.serial_number}: Not at retread supplier (current: ${tire.status})`);
                        failedTires.push({ 
                            tire_id, 
                            serial_number: tire.serial_number, 
                            error: `Invalid status: ${tire.status}` 
                        });
                        continue;
                    }

                    // Get supplier info
                    const movement = await new Promise((resolve, reject) => {
                        db.get(
                            `SELECT supplier_id, supplier_name 
                             FROM tire_movements 
                             WHERE tire_id = ? 
                             AND movement_type = 'STORE_TO_RETREAD_SUPPLIER'
                             ORDER BY movement_date DESC LIMIT 1`,
                            [tire_id],
                            (err, row) => err ? reject(err) : resolve(row)
                        );
                    });

                    if (!movement) {
                        errors.push(`Tire ${tire.serial_number}: No retread movement found`);
                        failedTires.push({ 
                            tire_id, 
                            serial_number: tire.serial_number, 
                            error: 'No retread history found' 
                        });
                        continue;
                    }

                    // Begin transaction
                    await new Promise((resolve, reject) => {
                        db.serialize(() => {
                            db.run('BEGIN TRANSACTION');

                            // Update tire with retreaded type
                            const updateSql = `
                                UPDATE tires 
                                SET status = 'IN_STORE',
                                    type = 'RETREADED',
                                    current_location = 'MAIN_WAREHOUSE',
                                    serial_number = COALESCE(?, serial_number),
                                    updated_at = CURRENT_TIMESTAMP
                                WHERE id = ?`;

                            db.run(updateSql, [new_serial, tire_id], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                // Log return movement
                                const movementSql = `
                                    INSERT INTO tire_movements 
                                    (tire_id, from_location, to_location, movement_type,
                                     user_id, notes, supplier_id, supplier_name)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

                                db.run(movementSql, [
                                    tire_id,
                                    `RETREAD_SUPPLIER-${movement.supplier_id}`,
                                    'MAIN_WAREHOUSE',
                                    'RETREAD_SUPPLIER_TO_STORE',
                                    user_id,
                                    notes || `Returned from retreading`,
                                    movement.supplier_id,
                                    movement.supplier_name
                                ], function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                    } else {
                                        db.run('COMMIT');
                                        resolve();
                                    }
                                });
                            });
                        });
                    });

                    returnedTires.push({
                        tire_id,
                        old_serial_number: tire.serial_number,
                        new_serial_number: new_serial || tire.serial_number,
                        size: tire.size,
                        brand: tire.brand,
                        status: 'RETREADED',
                        success: true
                    });

                } catch (tireError) {
                    console.error(`Error processing tire ${tire_id}:`, tireError);
                    failedTires.push({ 
                        tire_id, 
                        error: tireError.message || 'Processing failed' 
                    });
                }
            }

            // Update inventory catalog for retreaded tires
            if (returnedTires.length > 0) {
                for (const returnedTire of returnedTires) {
                    try {
                        await this.updateRetreadedInventory(returnedTire.tire_id);
                    } catch (inventoryError) {
                        console.error('Error updating inventory:', inventoryError);
                    }
                }
            }

            // Prepare response
            const response = {
                success: returnedTires.length > 0,
                message: `Returned ${returnedTires.length} retreaded tire(s), ${failedTires.length} failed`,
                returned_tires: returnedTires,
                failed_tires: failedTires
            };

            if (errors.length > 0) {
                response.errors = errors;
            }

            if (returnedTires.length === 0) {
                return res.status(400).json(response);
            }

            res.json(response);

        } catch (error) {
            console.error('Error returning tires from retreading:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to return tires from retreading',
                details: error.message 
            });
        }
    }

    // 4. Helper method to update inventory for retreaded tires
    static async updateRetreadedInventory(tireId) {
        const db = require('../config/database');
        
        const sql = `
            INSERT OR REPLACE INTO inventory_catalog 
            (size, brand, model, type, current_stock, 
             last_purchase_date, last_purchase_price, supplier_id)
            SELECT 
                t.size,
                t.brand,
                t.model,
                t.type,
                COALESCE(SUM(CASE WHEN t2.id IS NOT NULL AND t2.status = 'IN_STORE' AND t2.type = 'RETREADED' THEN 1 ELSE 0 END), 0) as retreaded_stock,
                MAX(t.created_at) as last_retread_date,
                NULL as last_purchase_price,  -- Retread cost is different
                t.supplier_id
            FROM tires t
            LEFT JOIN tires t2 ON t.size = t2.size AND t.brand = t2.brand 
                AND t.model = t2.model AND t2.type = 'RETREADED' AND t2.status = 'IN_STORE'
            WHERE t.id = ?
            GROUP BY t.size, t.brand, t.model
            ON CONFLICT(size, brand, model, type) DO UPDATE SET
                current_stock = EXCLUDED.current_stock,
                last_purchase_date = EXCLUDED.last_purchase_date,
                updated_at = CURRENT_TIMESTAMP`;

        return new Promise((resolve, reject) => {
            db.run(sql, [tireId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // 5. Get retread status report
    static async getRetreadStatusReport(req, res) {
        try {
            const { supplier_id, status, start_date, end_date } = req.query;
            
            const db = require('../config/database');
            
            let sql = `
                SELECT 
                    tm.id,
                    tm.movement_date,
                    tm.movement_type,
                    tm.supplier_id,
                    tm.supplier_name,
                    t.id as tire_id,
                    t.serial_number,
                    t.size,
                    t.brand,
                    t.type,
                    t.status,
                    tm.notes,
                    u.full_name as processed_by
                FROM tire_movements tm
                JOIN tires t ON tm.tire_id = t.id
                LEFT JOIN users u ON tm.user_id = u.id
                WHERE tm.movement_type IN ('STORE_TO_RETREAD_SUPPLIER', 'RETREAD_SUPPLIER_TO_STORE')
            `;
            
            const params = [];
            
            if (supplier_id) {
                sql += ` AND tm.supplier_id = ?`;
                params.push(supplier_id);
            }
            
            if (status) {
                if (status === 'AT_RETREAD_SUPPLIER') {
                    sql += ` AND t.status = 'AT_RETREAD_SUPPLIER'`;
                } else if (status === 'RETURNED') {
                    sql += ` AND t.type = 'RETREADED'`;
                }
            }
            
            if (start_date) {
                sql += ` AND DATE(tm.movement_date) >= DATE(?)`;
                params.push(start_date);
            }
            
            if (end_date) {
                sql += ` AND DATE(tm.movement_date) <= DATE(?)`;
                params.push(end_date);
            }
            
            sql += ` ORDER BY tm.movement_date DESC`;
            
            const movements = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            // Group by status for summary
            const summary = {
                at_supplier: movements.filter(m => m.status === 'AT_RETREAD_SUPPLIER').length,
                returned: movements.filter(m => m.type === 'RETREADED').length,
                total: movements.length
            };
            
            res.json({
                success: true,
                summary,
                data: movements
            });
            
        } catch (error) {
            console.error('Error fetching retread status report:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch retread status report' 
            });
        }
    }

    // 6. Get retread cost analysis
    static async getRetreadCostAnalysis(req, res) {
        try {
            const { start_date, end_date, supplier_id } = req.query;
            
            const db = require('../config/database');
            
            let sql = `
                SELECT 
                    sl.supplier_id,
                    s.name as supplier_name,
                    COUNT(DISTINCT sl.reference_number) as job_count,
                    COUNT(DISTINCT CASE WHEN tm.movement_type = 'RETREAD_SUPPLIER_TO_STORE' THEN t.id END) as tires_returned,
                    SUM(sl.amount) as total_cost,
                    AVG(sl.amount) as avg_cost_per_job
                FROM supplier_ledger sl
                JOIN suppliers s ON sl.supplier_id = s.id
                LEFT JOIN tire_movements tm ON sl.reference_number LIKE '%' || tm.reference_id || '%'
                LEFT JOIN tires t ON tm.tire_id = t.id
                WHERE sl.transaction_type = 'RETREAD_SERVICE'
                AND s.type = 'RETREAD'
            `;
            
            const params = [];
            
            if (start_date) {
                sql += ` AND DATE(sl.date) >= DATE(?)`;
                params.push(start_date);
            }
            
            if (end_date) {
                sql += ` AND DATE(sl.date) <= DATE(?)`;
                params.push(end_date);
            }
            
            if (supplier_id) {
                sql += ` AND sl.supplier_id = ?`;
                params.push(supplier_id);
            }
            
            sql += ` GROUP BY sl.supplier_id, s.name ORDER BY total_cost DESC`;
            
            const costAnalysis = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
            
            // Calculate totals
            const totals = costAnalysis.reduce((acc, curr) => ({
                job_count: acc.job_count + curr.job_count,
                tires_returned: acc.tires_returned + curr.tires_returned,
                total_cost: acc.total_cost + curr.total_cost
            }), { job_count: 0, tires_returned: 0, total_cost: 0 });
            
            totals.avg_cost_per_tire = totals.tires_returned > 0 
                ? totals.total_cost / totals.tires_returned 
                : 0;
            
            res.json({
                success: true,
                totals,
                suppliers: costAnalysis
            });
            
        } catch (error) {
            console.error('Error fetching retread cost analysis:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to fetch retread cost analysis' 
            });
        }
    }

    // 7. Bulk mark tires as ready for retreading (from USED_STORE)
    static async markForRetreading(req, res) {
        try {
            const { tire_ids, user_id, notes } = req.body;
            
            if (!tire_ids || !Array.isArray(tire_ids) || tire_ids.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'At least one tire must be selected' 
                });
            }
            
            const db = require('../config/database');
            const markedTires = [];
            const failedTires = [];
            
            for (const tire_id of tire_ids) {
                try {
                    const tire = await Tire.findById(tire_id);
                    
                    if (!tire) {
                        failedTires.push({ tire_id, error: 'Not found' });
                        continue;
                    }
                    
                    // Only mark if in USED_STORE status
                    if (tire.status !== 'USED_STORE') {
                        failedTires.push({ 
                            tire_id, 
                            serial_number: tire.serial_number,
                            error: `Cannot mark for retreading: Current status is ${tire.status}` 
                        });
                        continue;
                    }
                    
                    // Update status to AWAITING_RETREAD
                    await Tire.updateStatus(tire_id, 'AWAITING_RETREAD', 'MAIN_WAREHOUSE');
                    
                    // Log movement
                    await new Promise((resolve, reject) => {
                        const movementSql = `
                            INSERT INTO tire_movements 
                            (tire_id, from_location, to_location, movement_type,
                             user_id, notes)
                            VALUES (?, ?, ?, ?, ?, ?)`;
                        
                        db.run(movementSql, [
                            tire_id,
                            'USED_STORE',
                            'AWAITING_RETREAD',
                            'INTERNAL_TRANSFER',
                            user_id,
                            notes || 'Marked for retreading'
                        ], function(err) {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                    
                    markedTires.push({
                        tire_id,
                        serial_number: tire.serial_number,
                        size: tire.size,
                        brand: tire.brand,
                        success: true
                    });
                    
                } catch (tireError) {
                    failedTires.push({ tire_id, error: tireError.message });
                }
            }
            
            res.json({
                success: markedTires.length > 0,
                message: `Marked ${markedTires.length} tire(s) for retreading`,
                marked_tires: markedTires,
                failed_tires: failedTires
            });
            
        } catch (error) {
            console.error('Error marking tires for retreading:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to mark tires for retreading' 
            });
        }
    }


    // 2. Install tire on vehicle
    static async installOnVehicle(req, res) {
        try {
            const {
                tire_id,
                vehicle_id,
                position_code,   // 👈 expect R3 from frontend
                install_date,
                install_odometer,
                user_id,
                reason
            } = req.body;

            const db = require('../config/database');

            // 1️⃣ Validate tire
            const tire = await Tire.findById(tire_id);
            if (!tire) {
                return res.status(400).json({ error: 'Tire not available for installation' });
            }

            // 2️⃣ Resolve wheel position ID
            const position = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT id FROM wheel_positions 
                    WHERE vehicle_id = ? AND position_code = ?`,
                    [vehicle_id, position_code],
                    (err, row) => err ? reject(err) : resolve(row)
                );
            });

            if (!position) {
                return res.status(400).json({ error: 'Invalid wheel position for vehicle' });
            }

            // 3️⃣ Create assignment (FK-safe)
            const assignmentId = await Assignment.create({
                tire_id,
                vehicle_id,
                position_id: position.id, // ✅ INTEGER
                install_date,
                install_odometer,
                reason_for_change: reason,
                created_by: user_id
            });

            // 4️⃣ Update tire status
            await Tire.updateStatus(tire_id, 'ON_VEHICLE', `Vehicle ${vehicle_id}`);

            // 5️⃣ Log movement with vehicle_id
            await Movement.logMovement({
                tire_id,
                from_location: 'MAIN_WAREHOUSE',
                to_location: `Vehicle-${vehicle_id}`,
                movement_type: 'STORE_TO_VEHICLE',
                reference_id: assignmentId,
                reference_type: 'ASSIGNMENT',
                user_id,
                notes: `Installed on vehicle ${vehicle_id}`,
                vehicle_id: vehicle_id  // Added vehicle_id
            });

            res.json({
                message: 'Tire installed successfully',
                assignment_id: assignmentId
            });

        } catch (error) {
            console.error('Error installing tire:', error);
            res.status(500).json({ error: 'Failed to install tire' });
        }
    }

    // 3. Remove tire from vehicle
    static async removeFromVehicle(req, res) {
        try {
            const { assignment_id, removal_date, removal_odometer, user_id, reason, next_status = 'USED_STORE' } = req.body;

            const db = require('../config/database');

            // Get current assignment with vehicle details
            const assignment = await new Promise((resolve, reject) => {
                db.get(`
                    SELECT 
                        ta.*, 
                        t.id as tire_id,
                        v.vehicle_number,
                        v.id as vehicle_id
                    FROM tire_assignments ta 
                    JOIN tires t ON ta.tire_id = t.id 
                    JOIN vehicles v ON ta.vehicle_id = v.id
                    WHERE ta.id = ? AND ta.removal_date IS NULL`, 
                    [assignment_id], 
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!assignment) {
                return res.status(404).json({ error: 'Active assignment not found' });
            }

            // Mark assignment as removed
            await Assignment.markAsRemoved(assignment_id, removal_date, removal_odometer, reason);

            // Update tire status
            await Tire.updateStatus(assignment.tire_id, next_status, 'MAIN_WAREHOUSE');

            // Log movement with vehicle_id
            await Movement.logMovement({
                tire_id: assignment.tire_id,
                from_location: `Vehicle-${assignment.vehicle_id}`,
                to_location: 'MAIN_WAREHOUSE',
                movement_type: 'VEHICLE_TO_STORE',
                user_id,
                notes: `Removed from vehicle ${assignment.vehicle_number}: ${reason}`,
                reference_id: assignment_id,
                reference_type: 'ASSIGNMENT',
                vehicle_id: assignment.vehicle_id  // Added vehicle_id
            });

            const tire = await Tire.findById(assignment.tire_id);
            res.json({
                message: 'Tire removed successfully',
                tire
            });
        } catch (error) {
            console.error('Error removing tire:', error);
            res.status(500).json({ error: 'Failed to remove tire' });
        }
    }


    // 6. Dispose tire
    static async disposeTire(req, res) {
        try {
            const { tire_id, disposal_date, disposal_reason, user_id } = req.body;

            const tire = await Tire.findById(tire_id);
            if (!tire) {
                return res.status(404).json({ error: 'Tire not found' });
            }

            // Update tire status
            await Tire.updateStatus(tire_id, 'DISPOSED', 'DISPOSAL');

            // Log movement
            await Movement.logMovement({
                tire_id,
                from_location: tire.current_location,
                to_location: 'DISPOSAL',
                movement_type: 'STORE_TO_DISPOSAL',
                user_id,
                notes: `Disposed: ${disposal_reason}`
            });

            const updatedTire = await Tire.findById(tire_id);
            res.json({
                message: 'Tire disposed successfully',
                tire: updatedTire
            });
        } catch (error) {
            console.error('Error disposing tire:', error);
            res.status(500).json({ error: 'Failed to dispose tire' });
        }
    }

    // 7. Get tire details
    static async getTireDetails(req, res) {
        try {
            const { id } = req.params;
            const tire = await Tire.findById(id);
            
            if (!tire) {
                return res.status(404).json({ error: 'Tire not found' });
            }

            // Get tire history
            const history = await Tire.getHistory(id);
            
            // Get current assignment if any
            const currentAssignment = await Assignment.getCurrentAssignment(id);

            res.json({
                ...tire,
                history,
                current_assignment: currentAssignment
            });
        } catch (error) {
            console.error('Error getting tire details:', error);
            res.status(500).json({ error: 'Failed to get tire details' });
        }
    }

    // 8. Search tires
    static async searchTires(req, res) {
        try {
            const { serial, size, brand, status, type } = req.query;
            const db = require('../config/database');
            
            let sql = `SELECT t.*, s.name as supplier_name FROM tires t LEFT JOIN suppliers s ON t.supplier_id = s.id WHERE 1=1`;
            const params = [];

            if (serial) {
                sql += ` AND t.serial_number LIKE ?`;
                params.push(`%${serial}%`);
            }
            if (size) {
                sql += ` AND t.size LIKE ?`;
                params.push(`%${size}%`);
            }
            if (brand) {
                sql += ` AND t.brand LIKE ?`;
                params.push(`%${brand}%`);
            }
            if (status) {
                sql += ` AND t.status = ?`;
                params.push(status);
            }
            if (type) {
                sql += ` AND t.type = ?`;
                params.push(type);
            }

            sql += ` ORDER BY t.serial_number`;

            const tires = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            res.json(tires);
        } catch (error) {
            console.error('Error searching tires:', error);
            res.status(500).json({ error: 'Failed to search tires' });
        }
    }

    // 9. Get transactions with enhanced supplier and vehicle data
    static async getTransactions(req, res) {
        try {
            const db = require('../config/database');

            // Optional filters from query
            const { type, status, startDate, endDate } = req.query;
            let sql = `
                SELECT 
                    m.id,
                    m.movement_type as type,
                    m.movement_date as date,
                    m.created_at,
                    m.notes as description,
                    t.serial_number as tire_serial,
                    t.size as tire_size,
                    t.brand as tire_brand,
                    t.status as tire_status,
                    -- Use directly stored supplier_name or join to suppliers table
                    COALESCE(m.supplier_name, s.name) as supplier_name,
                    -- Use directly stored vehicle_number
                    COALESCE(
                        m.vehicle_number,
                        (SELECT v.vehicle_number 
                         FROM tire_assignments ta 
                         JOIN vehicles v ON ta.vehicle_id = v.id 
                         WHERE ta.id = m.reference_id AND m.reference_type = 'ASSIGNMENT')
                    ) as vehicle_number,
                    m.user_id,
                    m.reference_id as reference,
                    m.reference_type
                FROM tire_movements m
                LEFT JOIN tires t ON m.tire_id = t.id
                LEFT JOIN suppliers s ON t.supplier_id = s.id
                WHERE 1=1
            `;
            const params = [];

            if (type) {
                sql += ` AND m.movement_type = ?`;
                params.push(type);
            }

            if (status) {
                sql += ` AND t.status = ?`;
                params.push(status);
            }

            if (startDate) {
                sql += ` AND DATE(m.movement_date) >= DATE(?)`;
                params.push(startDate);
            }

            if (endDate) {
                sql += ` AND DATE(m.movement_date) <= DATE(?)`;
                params.push(endDate);
            }

            sql += ` ORDER BY m.movement_date DESC, m.created_at DESC`;

            const transactions = await new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });

            res.json(transactions);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            res.status(500).json({ error: 'Failed to fetch transactions' });
        }
    }

}

module.exports = TireController;