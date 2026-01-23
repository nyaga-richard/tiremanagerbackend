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

module.exports = router;