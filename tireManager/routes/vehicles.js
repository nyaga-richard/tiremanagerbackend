const express = require('express');
const router = express.Router();
const Vehicle = require('../models/Vehicle');

// Create vehicle
router.post('/', async (req, res) => {
    try {
        const vehicleId = await Vehicle.create(req.body);
        
        // Add wheel positions if provided
        if (req.body.positions && req.body.positions.length > 0) {
            await Vehicle.addWheelPositions(vehicleId, req.body.positions);
        }

        const vehicle = await Vehicle.getVehicleWithPositions(vehicleId);
        res.status(201).json(vehicle);
    } catch (error) {
        console.error('Error creating vehicle:', error);
        res.status(500).json({ error: 'Failed to create vehicle' });
    }
});

// Get all vehicles
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const result = await Vehicle.getPaginatedVehicles({
            limit,
            offset,
            search
        });

        res.json({
            vehicles: result.vehicles,
            total: result.total,
            page,
            totalPages: Math.ceil(result.total / limit)
        });
    } catch (error) {
        console.error('Error getting vehicles:', error);
        res.status(500).json({ error: 'Failed to get vehicles' });
    }
});

// Get vehicle details
router.get('/:id', async (req, res) => {
    try {
        const vehicle = await Vehicle.getVehicleWithPositions(req.params.id);
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        // Get current tires
        const currentTires = await Vehicle.getCurrentTires(req.params.id);
        vehicle.current_tires = currentTires;

        // Get installation history
        const db = require('../config/database');
        const history = await new Promise((resolve, reject) => {
            db.all(`
                SELECT 
                    ta.*,
                    t.serial_number,
                    t.size,
                    t.brand,
                    wp.position_code,
                    wp.position_name
                FROM tire_assignments ta
                JOIN tires t ON ta.tire_id = t.id
                JOIN wheel_positions wp ON ta.position_id = wp.id
                WHERE ta.vehicle_id = ?
                ORDER BY ta.install_date DESC
                LIMIT 50
            `, [req.params.id], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        vehicle.history = history;
        res.json(vehicle);
    } catch (error) {
        console.error('Error getting vehicle:', error);
        res.status(500).json({ error: 'Failed to get vehicle' });
    }
});

// Update vehicle details
router.put('/:id', async (req, res) => {
    try {
        const {
            vehicle_number,
            make,
            model,
            wheel_config,
            status
        } = req.body;

        const db = require('../config/database');

        await new Promise((resolve, reject) => {
            db.run(
                `
                UPDATE vehicles
                SET 
                    vehicle_number = ?,
                    make = ?,
                    model = ?,
                    wheel_config = ?,
                    status = ?
                WHERE id = ?
                `,
                [
                    vehicle_number,
                    make,
                    model,
                    wheel_config,
                    status,
                    req.params.id
                ],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        // Return updated vehicle
        const updatedVehicle = await Vehicle.getVehicleWithPositions(req.params.id);

        if (!updatedVehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }

        res.json(updatedVehicle);
    } catch (error) {
        console.error('Error updating vehicle:', error);
        res.status(500).json({ error: 'Failed to update vehicle' });
    }
});

// Update vehicle odometer
router.patch('/:id/odometer', async (req, res) => {
    try {
        const { current_odometer } = req.body;
        const db = require('../config/database');
        
        await new Promise((resolve, reject) => {
            db.run(
                'UPDATE vehicles SET current_odometer = ? WHERE id = ?',
                [current_odometer, req.params.id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });

        res.json({ message: 'Odometer updated successfully' });
    } catch (error) {
        console.error('Error updating odometer:', error);
        res.status(500).json({ error: 'Failed to update odometer' });
    }
});

// Retire a vehicle
router.post('/:id/retire', async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const { reason, retirement_date, retired_by } = req.body;
        
        const db = require('../config/database');
        
        // Check if vehicle exists and is not already retired
        const vehicle = await Vehicle.getVehicleWithPositions(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        if (vehicle.status === 'RETIRED') {
            return res.status(400).json({ error: 'Vehicle is already retired' });
        }

        // Start a transaction
        await new Promise((resolve, reject) => {
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        try {
            // 1. Get all current tire assignments on the vehicle
            const currentAssignments = await Vehicle.getCurrentTires(vehicleId);
            
            // 2. Remove all tires from the vehicle
            if (currentAssignments && currentAssignments.length > 0) {
                for (const assignment of currentAssignments) {
                    // Remove tire from vehicle
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE tire_assignments 
                             SET removal_date = ?, 
                                 removal_odometer = ?,
                                 reason_for_change = ?
                             WHERE id = ?`,
                            [
                                retirement_date || new Date().toISOString().split('T')[0],
                                vehicle.current_odometer,
                                `Vehicle retirement: ${reason || 'No reason provided'}`,
                                assignment.id
                            ],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.changes);
                            }
                        );
                    });
                    
                    // Update tire status to IN_STORE
                    await new Promise((resolve, reject) => {
                        db.run(
                            `UPDATE tires 
                             SET status = 'IN_STORE',
                                 current_position = NULL,
                                 updated_at = CURRENT_TIMESTAMP
                             WHERE id = ?`,
                            [assignment.tire_id],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.changes);
                            }
                        );
                    });
                    
                    // Log movement
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO tire_movements 
                             (tire_id, from_location, to_location, movement_type, reference_id, reference_type, user_id, notes, created_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                assignment.tire_id,
                                `Vehicle-${vehicleId}`,
                                'MAIN_WAREHOUSE',
                                'VEHICLE_TO_STORE',
                                assignment.id,
                                'ASSIGNMENT',
                                retired_by || 1,
                                `Vehicle ${vehicle.vehicle_number} retired: ${reason || 'No reason provided'}`,
                                new Date().toISOString()
                            ],
                            function(err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    });
                }
            }
            
            // 3. Update vehicle status to RETIRED
            await new Promise((resolve, reject) => {
                db.run(
                    `UPDATE vehicles 
                     SET status = 'RETIRED',
                         retired_date = ?,
                         retirement_reason = ?,
                         retired_by = ?,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        retirement_date || new Date().toISOString().split('T')[0],
                        reason || 'Vehicle retired',
                        retired_by || 1,
                        vehicleId
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.changes);
                    }
                );
            });
            
            // 4. Log vehicle retirement
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO vehicle_history 
                     (vehicle_id, action, details, user_id, created_at)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        vehicleId,
                        'RETIRED',
                        JSON.stringify({
                            reason: reason || 'Vehicle retired',
                            retirement_date: retirement_date || new Date().toISOString().split('T')[0],
                            odometer_at_retirement: vehicle.current_odometer,
                            tires_removed: currentAssignments ? currentAssignments.length : 0
                        }),
                        retired_by || 1,
                        new Date().toISOString()
                    ],
                    function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    }
                );
            });
            
            // Commit transaction
            await new Promise((resolve, reject) => {
                db.run('COMMIT', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            
            // Get updated vehicle info
            const retiredVehicle = await Vehicle.getVehicleWithPositions(vehicleId);
            
            res.json({
                message: 'Vehicle retired successfully',
                vehicle: retiredVehicle,
                tires_removed: currentAssignments ? currentAssignments.length : 0
            });
            
        } catch (error) {
            // Rollback transaction on error
            await new Promise((resolve, reject) => {
                db.run('ROLLBACK', (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
            throw error;
        }
        
    } catch (error) {
        console.error('Error retiring vehicle:', error);
        res.status(500).json({ error: 'Failed to retire vehicle' });
    }
});

// Reactivate a retired vehicle
router.post('/:id/reactivate', async (req, res) => {
    try {
        const vehicleId = req.params.id;
        const { reason, reactivated_by } = req.body;
        
        const db = require('../config/database');
        
        // Check if vehicle exists and is retired
        const vehicle = await Vehicle.getVehicleWithPositions(vehicleId);
        if (!vehicle) {
            return res.status(404).json({ error: 'Vehicle not found' });
        }
        
        if (vehicle.status !== 'RETIRED') {
            return res.status(400).json({ error: 'Vehicle is not retired' });
        }

        // Update vehicle status back to ACTIVE
        await new Promise((resolve, reject) => {
            db.run(
                `UPDATE vehicles 
                 SET status = 'ACTIVE',
                     retired_date = NULL,
                     retirement_reason = NULL,
                     retired_by = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [vehicleId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
        
        // Log vehicle reactivation
        await new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO vehicle_history 
                 (vehicle_id, action, details, user_id, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    vehicleId,
                    'REACTIVATED',
                    JSON.stringify({
                        reason: reason || 'Vehicle reactivated'
                    }),
                    reactivated_by || 1,
                    new Date().toISOString()
                ],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
        
        // Get updated vehicle info
        const reactivatedVehicle = await Vehicle.getVehicleWithPositions(vehicleId);
        
        res.json({
            message: 'Vehicle reactivated successfully',
            vehicle: reactivatedVehicle
        });
        
    } catch (error) {
        console.error('Error reactivating vehicle:', error);
        res.status(500).json({ error: 'Failed to reactivate vehicle' });
    }
});

// Get retired vehicles
router.get('/retired/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        const db = require('../config/database');

        const where = search
            ? `WHERE status = 'RETIRED' AND (vehicle_number LIKE ? OR make LIKE ? OR model LIKE ?)`
            : `WHERE status = 'RETIRED'`;

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
                ORDER BY v.retired_date DESC
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

        res.json({
            vehicles: vehicles,
            total: total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Error getting retired vehicles:', error);
        res.status(500).json({ error: 'Failed to get retired vehicles' });
    }
});

module.exports = router;