const Tire = require('../models/Tire');
const Movement = require('../models/Movement');
const Assignment = require('../models/Assignment');
const Supplier = require('../models/Supplier');


class TireController {
    // 1. Buy Tires from Supplier
    static async purchaseTires(req, res) {
        try {
            const { tires, supplier_id, purchase_date, purchase_cost, user_id } = req.body;

            // Validate supplier exists
            const supplier = await new Promise((resolve, reject) => {
                const db = require('../config/database');
                db.get('SELECT * FROM suppliers WHERE id = ?', [supplier_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });

            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }

            const createdTires = [];
            
            for (const tireData of tires) {
                // Create tire record
                const tireId = await Tire.create({
                    ...tireData,
                    supplier_id,
                    purchase_date,
                    purchase_cost: tireData.purchase_cost || purchase_cost,
                    status: 'IN_STORE',
                    current_location: 'MAIN_WAREHOUSE'
                });

                // Log movement
                await Movement.logMovement({
                    tire_id: tireId,
                    from_location: 'SUPPLIER',
                    to_location: 'MAIN_WAREHOUSE',
                    movement_type: 'PURCHASE_TO_STORE',
                    user_id,
                    notes: `Purchase from ${supplier.name}`
                });

                // Add to supplier ledger
                await Supplier.addLedgerEntry({
                    supplier_id,
                    date: purchase_date,
                    description: `Purchase of tire ${tireData.serial_number}`,
                    transaction_type: 'PURCHASE',
                    amount: tireData.purchase_cost || purchase_cost,
                    reference_number: `TIRE-${tireData.serial_number}`,
                    created_by: user_id
                });

                const tire = await Tire.findById(tireId);
                createdTires.push(tire);
            }

            res.status(201).json({
                message: 'Tires purchased successfully',
                tires: createdTires
            });
        } catch (error) {
            console.error('Error purchasing tires:', error);
            res.status(500).json({ error: 'Failed to purchase tires' });
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
            if (!tire || tire.status !== 'IN_STORE') {
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

            // 5️⃣ Log movement
            await Movement.logMovement({
                tire_id,
                from_location: 'MAIN_WAREHOUSE',
                to_location: `Vehicle-${vehicle_id}`,
                movement_type: 'STORE_TO_VEHICLE',
                reference_id: assignmentId,
                reference_type: 'ASSIGNMENT',
                user_id,
                notes: `Installed on vehicle ${vehicle_id}`
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

            // Get current assignment
            const assignment = await new Promise((resolve, reject) => {
                const db = require('../config/database');
                db.get(`
                    SELECT ta.*, t.id as tire_id 
                    FROM tire_assignments ta 
                    JOIN tires t ON ta.tire_id = t.id 
                    WHERE ta.id = ?`, 
                    [assignment_id], 
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    }
                );
            });

            if (!assignment) {
                return res.status(404).json({ error: 'Assignment not found' });
            }

            // Mark assignment as removed
            await Assignment.markAsRemoved(assignment_id, removal_date, removal_odometer, reason);

            // Update tire status
            await Tire.updateStatus(assignment.tire_id, next_status, 'MAIN_WAREHOUSE');

            // Log movement
            await Movement.logMovement({
                tire_id: assignment.tire_id,
                from_location: `Vehicle-${assignment.vehicle_id}`,
                to_location: 'MAIN_WAREHOUSE',
                movement_type: 'VEHICLE_TO_STORE',
                user_id,
                notes: `Removed from vehicle: ${reason}`
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

    // 4. Send for retreading
    static async sendForRetreading(req, res) {
        try {
            const { tire_id, supplier_id, send_date, expected_cost, user_id } = req.body;

            const tire = await Tire.findById(tire_id);
            if (!tire || tire.status !== 'USED_STORE') {
                return res.status(400).json({ error: 'Tire not eligible for retreading' });
            }

            // Update tire status
            await Tire.updateStatus(tire_id, 'AT_RETREAD_SUPPLIER', `Retread Supplier ${supplier_id}`);

            // Add to supplier ledger
            await Supplier.addLedgerEntry({
                supplier_id,
                date: send_date,
                description: `Retreading service for tire ${tire.serial_number}`,
                transaction_type: 'RETREAD_SERVICE',
                amount: expected_cost,
                reference_number: `RETREAD-${tire.serial_number}`,
                created_by: user_id
            });

            // Log movement
            await Movement.logMovement({
                tire_id,
                from_location: 'MAIN_WAREHOUSE',
                to_location: `RETREAD_SUPPLIER-${supplier_id}`,
                movement_type: 'STORE_TO_RETREAD_SUPPLIER',
                user_id,
                notes: 'Sent for retreading'
            });

            const updatedTire = await Tire.findById(tire_id);
            res.json({
                message: 'Tire sent for retreading',
                tire: updatedTire
            });
        } catch (error) {
            console.error('Error sending for retreading:', error);
            res.status(500).json({ error: 'Failed to send for retreading' });
        }
    }

    // 5. Return from retreading
    static async returnFromRetreading(req, res) {
        try {
            const { tire_id, return_date, actual_cost, user_id } = req.body;

            const tire = await Tire.findById(tire_id);
            if (!tire || tire.status !== 'AT_RETREAD_SUPPLIER') {
                return res.status(400).json({ error: 'Tire not at retread supplier' });
            }

            // Update tire
            const db = require('../config/database');
            await new Promise((resolve, reject) => {
                db.run(
                    'UPDATE tires SET status = ?, type = ?, current_location = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    ['IN_STORE', 'RETREADED', 'MAIN_WAREHOUSE', tire_id],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });

            // Log movement
            await Movement.logMovement({
                tire_id,
                from_location: `RETREAD_SUPPLIER`,
                to_location: 'MAIN_WAREHOUSE',
                movement_type: 'RETREAD_SUPPLIER_TO_STORE',
                user_id,
                notes: 'Returned from retreading'
            });

            const updatedTire = await Tire.findById(tire_id);
            res.json({
                message: 'Tire returned from retreading',
                tire: updatedTire
            });
        } catch (error) {
            console.error('Error returning from retreading:', error);
            res.status(500).json({ error: 'Failed to return from retreading' });
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

    // TireController.js
    static async getTransactions(req, res) {
        try {
            const db = require('../config/database');

            // Optional filters from query
            const { type, status } = req.query;
            let sql = `
                SELECT 
                    m.id,
                    m.movement_type as type,
                    m.created_at as date,
                    m.notes as description,
                    t.serial_number as tire_serial,
                    t.size as tire_size,
                    t.brand as tire_brand,
                    s.name as supplier_name,
                    v.vehicle_number,
                    m.user_id,
                    m.id as reference
                FROM tire_movements m
                LEFT JOIN tires t ON m.tire_id = t.id
                LEFT JOIN suppliers s ON t.supplier_id = s.id
                LEFT JOIN tire_assignments ta ON m.reference_id = ta.id AND m.reference_type = 'ASSIGNMENT'
                LEFT JOIN vehicles v ON ta.vehicle_id = v.id
                WHERE 1=1
            `;
            const params = [];

            if (type) {
                sql += ` AND m.movement_type = ?`;
                params.push(type);
            }

            if (status) {
                // Example: filter by tire status at the time of query
                sql += ` AND t.status = ?`;
                params.push(status);
            }

            sql += ` ORDER BY m.created_at DESC`;

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