const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../config/database');
const Tire = require('../models/Tire');
const Vehicle = require('../models/Vehicle'); // Added Vehicle model import

// Configure multer for memory storage
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ==================== TIRE UPLOAD FUNCTIONS ====================

// Helper function to update inventory catalog (for tires)
async function updateInventoryCatalog(record) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT id FROM inventory_catalog 
             WHERE size = ? AND brand = ? AND (model = ? OR (model IS NULL AND ? IS NULL)) AND type = ?`,
            [record.size, record.brand, record.model || null, record.model || null, record.type || 'NEW'],
            (err, row) => {
                if (err) reject(err);
                
                if (row) {
                    // Update existing
                    db.run(
                        `UPDATE inventory_catalog 
                         SET current_stock = current_stock + 1,
                             last_purchase_date = ?,
                             last_purchase_price = ?,
                             updated_at = CURRENT_TIMESTAMP
                         WHERE id = ?`,
                        [record.purchase_date || new Date().toISOString().split('T')[0],
                         record.purchase_cost || null,
                         row.id],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                } else {
                    // Insert new
                    db.run(
                        `INSERT INTO inventory_catalog 
                         (size, brand, model, type, current_stock, last_purchase_date, last_purchase_price)
                         VALUES (?, ?, ?, ?, 1, ?, ?)`,
                        [record.size, record.brand, record.model || null, record.type || 'NEW',
                         record.purchase_date || new Date().toISOString().split('T')[0],
                         record.purchase_cost || null],
                        (err) => {
                            if (err) reject(err);
                            else resolve();
                        }
                    );
                }
            }
        );
    });
}

// Helper function to log tire movement
async function logTireMovement(data) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO tire_movements 
             (tire_id, from_location, to_location, movement_type, vehicle_id, user_id, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [data.tire_id, data.from_location, data.to_location, data.movement_type, data.vehicle_id || null, data.user_id, data.notes],
            (err) => {
                if (err) reject(err);
                else resolve();
            }
        );
    });
}

// Helper function to format date from DD/MM/YYYY to YYYY-MM-DD
function formatDate(dateString) {
    if (!dateString) return null;
    
    // If it's already in YYYY-MM-DD format, return as is
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateString;
    }
    
    // Handle DD/MM/YYYY format
    if (dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
        const [day, month, year] = dateString.split('/');
        return `${year}-${month}-${day}`;
    }
    
    // Handle other formats or return as is
    return dateString;
}

// ==================== VEHICLE UPLOAD FUNCTIONS ====================

// Transaction helpers
async function beginTransaction() {
    return new Promise((resolve, reject) => {
        db.run('BEGIN TRANSACTION', (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

async function commitTransaction() {
    return new Promise((resolve, reject) => {
        db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function rollbackTransaction() {
    return new Promise((resolve, reject) => {
        db.run('ROLLBACK', (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// Wheel configuration mapping from Vehicle model
const wheelConfigPositions = {
    "4x2": [
        { position_code: "FL", position_name: "Front Left", axle_number: 1, is_trailer: 0 },
        { position_code: "FR", position_name: "Front Right", axle_number: 1, is_trailer: 0 },
        { position_code: "RL", position_name: "Rear Left", axle_number: 2, is_trailer: 0 },
        { position_code: "RR", position_name: "Rear Right", axle_number: 2, is_trailer: 0 },
    ],
    "6x4": [
        { position_code: "FL", position_name: "Front Left", axle_number: 1, is_trailer: 0 },
        { position_code: "FR", position_name: "Front Right", axle_number: 1, is_trailer: 0 },
        { position_code: "RL1", position_name: "Rear Left Inner", axle_number: 2, is_trailer: 0 },
        { position_code: "RL2", position_name: "Rear Left Outer", axle_number: 2, is_trailer: 0 },
        { position_code: "RR1", position_name: "Rear Right Inner", axle_number: 2, is_trailer: 0 },
        { position_code: "RR2", position_name: "Rear Right Outer", axle_number: 2, is_trailer: 0 },
    ],
    "8x4": [
        { position_code: "FL", position_name: "Front Left", axle_number: 1, is_trailer: 0 },
        { position_code: "FR", position_name: "Front Right", axle_number: 1, is_trailer: 0 },
        { position_code: "RL1", position_name: "Rear Left Inner", axle_number: 2, is_trailer: 0 },
        { position_code: "RL2", position_name: "Rear Left Outer", axle_number: 2, is_trailer: 0 },
        { position_code: "RR1", position_name: "Rear Right Inner", axle_number: 2, is_trailer: 0 },
        { position_code: "RR2", position_name: "Rear Right Outer", axle_number: 2, is_trailer: 0 },
        { position_code: "RL3", position_name: "Rear Left Inner", axle_number: 3, is_trailer: 0 },
        { position_code: "RL4", position_name: "Rear Left Outer", axle_number: 3, is_trailer: 0 },
        { position_code: "RR3", position_name: "Rear Right Inner", axle_number: 3, is_trailer: 0 },
        { position_code: "RR4", position_name: "Rear Right Outer", axle_number: 3, is_trailer: 0 },
        { position_code: "RL5", position_name: "Rear Left Inner", axle_number: 4, is_trailer: 0 },
        { position_code: "RL6", position_name: "Rear Left Outer", axle_number: 4, is_trailer: 0 },
        { position_code: "RR5", position_name: "Rear Right Inner", axle_number: 4, is_trailer: 0 },
        { position_code: "RR6", position_name: "Rear Right Outer", axle_number: 4, is_trailer: 0 },
        { position_code: "RL7", position_name: "Rear Left Inner", axle_number: 5, is_trailer: 0 },
        { position_code: "RL8", position_name: "Rear Left Outer", axle_number: 5, is_trailer: 0 },
        { position_code: "RR7", position_name: "Rear Right Inner", axle_number: 5, is_trailer: 0 },
        { position_code: "RR8", position_name: "Rear Right Outer", axle_number: 5, is_trailer: 0 },
        { position_code: "RL9", position_name: "Rear Left Inner", axle_number: 6, is_trailer: 0 },
        { position_code: "RL10", position_name: "Rear Left Outer", axle_number: 6, is_trailer: 0 },
        { position_code: "RR9", position_name: "Rear Right Inner", axle_number: 6, is_trailer: 0 },
        { position_code: "RR10", position_name: "Rear Right Outer", axle_number: 6, is_trailer: 0 },
    ],
    "6x2": [
        { position_code: "FL", position_name: "Front Left", axle_number: 1, is_trailer: 0 },
        { position_code: "FR", position_name: "Front Right", axle_number: 1, is_trailer: 0 },
        { position_code: "RL", position_name: "Rear Left", axle_number: 2, is_trailer: 0 },
        { position_code: "RR", position_name: "Rear Right", axle_number: 2, is_trailer: 0 },
        { position_code: "RCL", position_name: "Rear Center Left", axle_number: 3, is_trailer: 0 },
        { position_code: "RCR", position_name: "Rear Center Right", axle_number: 3, is_trailer: 0 },
    ],
    "4x4": [
        { position_code: "FL", position_name: "Front Left", axle_number: 1, is_trailer: 0 },
        { position_code: "FR", position_name: "Front Right", axle_number: 1, is_trailer: 0 },
        { position_code: "RL", position_name: "Rear Left", axle_number: 2, is_trailer: 0 },
        { position_code: "RR", position_name: "Rear Right", axle_number: 2, is_trailer: 0 },
    ],
};

// Helper function to create wheel positions using the mapping
async function createWheelPositions(vehicleId, config) {
    const positions = wheelConfigPositions[config] || [];
    
    if (positions.length === 0) {
        console.log(`No positions found for config: ${config}`);
        return [];
    }
    
    // Use the Vehicle model's addWheelPositions method if available
    if (Vehicle.addWheelPositions) {
        return await Vehicle.addWheelPositions(vehicleId, positions);
    }
    
    // Fallback: manually insert positions
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

// ==================== TIRE UPLOAD ROUTES ====================

// Upload tires CSV endpoint
router.post('/upload-tires', (req, res) => {
    // Use multer as middleware with error handling
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: 'File upload error: ' + err.message });
        }

        try {
            const file = req.file;
            const userId = req.body.userId;

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log('Tire file received:', file.originalname, 'Size:', file.size, 'Type:', file.mimetype);

            // Parse CSV content
            const fileContent = file.buffer.toString('utf8');
            const records = parse(fileContent, { 
                columns: true, 
                skip_empty_lines: true, 
                trim: true 
            });

            console.log(`Parsed ${records.length} tire records from CSV`);

            const results = { 
                success: [], 
                errors: [], 
                total: records.length 
            };

            for (const record of records) {
                try {
                    // Validate required fields
                    if (!record.serial_number || !record.size || !record.brand) {
                        throw new Error('Missing required fields: serial_number, size, brand');
                    }

                    const formattedDate = formatDate(record.purchase_date) || new Date().toISOString().split('T')[0];

                    // Check if serial number exists
                    const existing = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT id FROM tires WHERE serial_number = ?',
                            [record.serial_number.trim()],
                            (err, row) => (err ? reject(err) : resolve(row))
                        );
                    });

                    if (existing) {
                        throw new Error(`Serial number ${record.serial_number} already exists`);
                    }

                    // Insert into tires table
                    const tireId = await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO tires (
                                serial_number, size, brand, model, type, status,
                                purchase_cost, supplier_id, purchase_date, current_location,
                                created_at, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                            [
                                record.serial_number.trim(),
                                record.size.trim(),
                                record.brand.trim(),
                                record.model || null,
                                (record.type || 'NEW').toUpperCase(),
                                'IN_STORE',
                                record.purchase_cost ? parseFloat(record.purchase_cost) : null,
                                record.supplier_id ? parseInt(record.supplier_id) : null,
                                formattedDate,
                                record.current_location || 'Main Store',
                            ],
                            function (err) {
                                if (err) reject(err);
                                else resolve(this.lastID);
                            }
                        );
                    });

                    // Update inventory catalog
                    await updateInventoryCatalog({ 
                        ...record, 
                        purchase_date: formattedDate 
                    });

                    // Log tire movement
                    await logTireMovement({
                        tire_id: tireId,
                        from_location: 'UPLOAD',
                        to_location: record.current_location || 'Main Store',
                        movement_type: 'PURCHASE_TO_STORE',
                        user_id: userId,
                        notes: 'Imported via CSV upload'
                    });

                    results.success.push({ 
                        serial_number: record.serial_number, 
                        id: tireId 
                    });
                    
                } catch (err) {
                    console.error('Error processing record:', record.serial_number, err.message);
                    results.errors.push({ 
                        row: record, 
                        error: err.message 
                    });
                }
            }

            res.json({
                success: true,
                message: `Processed ${results.success.length} of ${results.total} tires`,
                results
            });
            
        } catch (err) {
            console.error('CSV upload error:', err);
            res.status(500).json({ error: err.message });
        }
    });
});

// Download tires CSV template endpoint
router.get('/tires-template', async (req, res) => {
    try {
        // Generate CSV template
        const headers = [
            'serial_number',
            'size',
            'brand',
            'model',
            'type',
            'purchase_cost',
            'supplier_id',
            'purchase_date',
            'current_location'
        ];

        const exampleRow = {
            serial_number: 'TIRE001234',
            size: '11R22.5',
            brand: 'Michelin',
            model: 'XZA2',
            type: 'NEW',
            purchase_cost: '45000',
            supplier_id: '1',
            purchase_date: '2024-01-15',
            current_location: 'Main Store'
        };

        const csv = [
            headers.join(','),
            headers.map(h => exampleRow[h]).join(',')
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="tires-upload-template.csv"');
        res.send(csv);

    } catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== VEHICLE UPLOAD ROUTES ====================

// Upload vehicles CSV endpoint - UPDATED with wheel configuration mapping
router.post('/upload-vehicles', (req, res) => {
    upload.single('file')(req, res, async (err) => {
        if (err) {
            console.error('Multer error:', err);
            return res.status(400).json({ error: 'File upload error: ' + err.message });
        }

        try {
            const file = req.file;
            const userId = req.body.userId;
            
            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }

            console.log('Vehicle file received:', file.originalname, 'Size:', file.size);

            const fileContent = file.buffer.toString();
            const records = parse(fileContent, {
                columns: true,
                skip_empty_lines: true,
                trim: true,
            });

            console.log(`Parsed ${records.length} vehicle records from CSV`);

            const results = {
                vehicles: { success: [], errors: [] },
                tireAssignments: { success: [], errors: [] },
                total: records.length
            };

            // Valid wheel configurations
            const validConfigs = ['4x2', '6x4', '8x4', '6x2', '4x4'];

            // Process each vehicle record
            for (const record of records) {
                const connection = await beginTransaction();

                try {
                    // Validate required fields
                    if (!record.vehicle_number) {
                        throw new Error('Vehicle number is required');
                    }

                    // Validate wheel configuration if provided
                    if (record.wheel_config && !validConfigs.includes(record.wheel_config)) {
                        throw new Error(`Invalid wheel configuration: ${record.wheel_config}. Must be one of: ${validConfigs.join(', ')}`);
                    }

                    // Format date if needed
                    const assignmentDate = formatDate(record.assignment_date);

                    // Check if vehicle exists
                    const existingVehicle = await new Promise((resolve, reject) => {
                        db.get(
                            'SELECT id FROM vehicles WHERE vehicle_number = ?',
                            [record.vehicle_number.trim()],
                            (err, row) => {
                                if (err) reject(err);
                                else resolve(row);
                            }
                        );
                    });

                    let vehicleId;

                    if (existingVehicle) {
                        // Update existing vehicle
                        await new Promise((resolve, reject) => {
                            db.run(
                                `UPDATE vehicles 
                                 SET make = ?, model = ?, year = ?, wheel_config = ?, 
                                     current_odometer = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                                 WHERE id = ?`,
                                [
                                    record.make || null,
                                    record.model || null,
                                    record.year ? parseInt(record.year) : null,
                                    record.wheel_config || null,
                                    record.current_odometer ? parseFloat(record.current_odometer) : 0,
                                    record.status || 'ACTIVE',
                                    existingVehicle.id
                                ],
                                (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                }
                            );
                        });
                        vehicleId = existingVehicle.id;
                        
                        // Check if positions exist for this vehicle
                        const existingPositions = await new Promise((resolve, reject) => {
                            db.all(
                                'SELECT id FROM wheel_positions WHERE vehicle_id = ?',
                                [vehicleId],
                                (err, rows) => {
                                    if (err) reject(err);
                                    else resolve(rows);
                                }
                            );
                        });

                        // If no positions exist and wheel config is provided, create them
                        if (existingPositions.length === 0 && record.wheel_config) {
                            await createWheelPositions(vehicleId, record.wheel_config);
                        }
                        
                        results.vehicles.success.push({ 
                            vehicle_number: record.vehicle_number, 
                            id: vehicleId, 
                            action: 'updated' 
                        });
                    } else {
                        // Insert new vehicle using direct DB insert (or you could use Vehicle.create)
                        vehicleId = await new Promise((resolve, reject) => {
                            db.run(
                                `INSERT INTO vehicles 
                                 (vehicle_number, make, model, year, wheel_config, current_odometer, status, created_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                                [
                                    record.vehicle_number.trim(),
                                    record.make || null,
                                    record.model || null,
                                    record.year ? parseInt(record.year) : null,
                                    record.wheel_config || null,
                                    record.current_odometer ? parseFloat(record.current_odometer) : 0,
                                    record.status || 'ACTIVE',
                                ],
                                function(err) {
                                    if (err) reject(err);
                                    else resolve(this.lastID);
                                }
                            );
                        });

                        // Create wheel positions based on configuration
                        if (record.wheel_config) {
                            await createWheelPositions(vehicleId, record.wheel_config);
                        }
                        
                        results.vehicles.success.push({ 
                            vehicle_number: record.vehicle_number, 
                            id: vehicleId, 
                            action: 'created' 
                        });
                    }

                    // Process tire assignments if provided
                    const positions = ['position_1', 'position_2', 'position_3', 'position_4', 'position_5', 'position_6'];
                    
                    for (const position of positions) {
                        const serialNumber = record[`tire_${position}`];
                        if (serialNumber && serialNumber.trim()) {
                            try {
                                // Find the tire
                                const tire = await new Promise((resolve, reject) => {
                                    db.get(
                                        'SELECT id, status FROM tires WHERE serial_number = ?',
                                        [serialNumber.trim()],
                                        (err, row) => {
                                            if (err) reject(err);
                                            else resolve(row);
                                        }
                                    );
                                });

                                if (!tire) {
                                    throw new Error(`Tire ${serialNumber} not found`);
                                }

                                if (tire.status !== 'IN_STORE' && tire.status !== 'USED_STORE') {
                                    throw new Error(`Tire ${serialNumber} is not available (status: ${tire.status})`);
                                }

                                // Map position number to position code based on wheel config
                                let positionCode = position; // Default fallback
                                if (record.wheel_config && wheelConfigPositions[record.wheel_config]) {
                                    const configPositions = wheelConfigPositions[record.wheel_config];
                                    const index = parseInt(position.split('_')[1]) - 1;
                                    if (index >= 0 && index < configPositions.length) {
                                        positionCode = configPositions[index].position_code;
                                    }
                                }

                                // Find wheel position
                                const wheelPosition = await new Promise((resolve, reject) => {
                                    db.get(
                                        `SELECT id FROM wheel_positions 
                                         WHERE vehicle_id = ? AND position_code = ?`,
                                        [vehicleId, positionCode],
                                        (err, row) => {
                                            if (err) reject(err);
                                            else resolve(row);
                                        }
                                    );
                                });

                                if (!wheelPosition) {
                                    throw new Error(`Wheel position ${positionCode} not found for vehicle`);
                                }

                                // Create tire assignment
                                await new Promise((resolve, reject) => {
                                    db.run(
                                        `INSERT INTO tire_assignments 
                                         (tire_id, vehicle_id, position_id, install_date, install_odometer, created_by)
                                         VALUES (?, ?, ?, ?, ?, ?)`,
                                        [
                                            tire.id,
                                            vehicleId,
                                            wheelPosition.id,
                                            assignmentDate || new Date().toISOString().split('T')[0],
                                            record.current_odometer ? parseFloat(record.current_odometer) : 0,
                                            userId
                                        ],
                                        (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        }
                                    );
                                });

                                // Update tire status
                                await new Promise((resolve, reject) => {
                                    db.run(
                                        'UPDATE tires SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                        ['ON_VEHICLE', tire.id],
                                        (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        }
                                    );
                                });

                                // Log movement
                                await logTireMovement({
                                    tire_id: tire.id,
                                    from_location: 'STORE',
                                    to_location: `VEHICLE_${record.vehicle_number}_${positionCode}`,
                                    movement_type: 'STORE_TO_VEHICLE',
                                    vehicle_id: vehicleId,
                                    user_id: userId,
                                    notes: `Assigned to vehicle ${record.vehicle_number} position ${positionCode} via CSV upload`
                                });

                                results.tireAssignments.success.push({
                                    serial_number: serialNumber,
                                    vehicle: record.vehicle_number,
                                    position: positionCode
                                });

                            } catch (error) {
                                results.tireAssignments.errors.push({
                                    serial_number: serialNumber,
                                    vehicle: record.vehicle_number,
                                    position: position,
                                    error: error.message
                                });
                            }
                        }
                    }

                    await commitTransaction(connection);

                } catch (error) {
                    await rollbackTransaction(connection);
                    results.vehicles.errors.push({
                        vehicle_number: record.vehicle_number,
                        error: error.message
                    });
                }
            }

            res.json({
                success: true,
                message: `Processed ${results.vehicles.success.length} vehicles with ${results.tireAssignments.success.length} tire assignments`,
                results
            });

        } catch (error) {
            console.error('Vehicle CSV upload error:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// Download vehicle CSV template endpoint
router.get('/vehicles-template', async (req, res) => {
    try {
        // Generate vehicle upload template
        const headers = [
            'vehicle_number',
            'make',
            'model',
            'year',
            'wheel_config',
            'current_odometer',
            'status',
            'assignment_date',
            'tire_position_1',
            'tire_position_2',
            'tire_position_3',
            'tire_position_4',
            'tire_position_5',
            'tire_position_6'
        ];

        const exampleRow = {
            vehicle_number: 'KBA 123A',
            make: 'Scania',
            model: 'R500',
            year: '2023',
            wheel_config: '6x4',
            current_odometer: '125000',
            status: 'ACTIVE',
            assignment_date: '2024-01-15',
            tire_position_1: 'TIRE001',
            tire_position_2: 'TIRE002',
            tire_position_3: '',
            tire_position_4: '',
            tire_position_5: '',
            tire_position_6: ''
        };

        const csv = [
            headers.join(','),
            headers.map(h => exampleRow[h] || '').join(',')
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="vehicles-upload-template.csv"');
        res.send(csv);

    } catch (error) {
        console.error('Template generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== EXISTING ROUTES ====================

// Get inventory grouped by size
router.get('/by-size', async (req, res) => {
    try {
        const inventory = await Tire.getInventoryBySize();
        res.json(inventory);
    } catch (error) {
        console.error('Error getting inventory:', error);
        res.status(500).json({ error: 'Failed to get inventory' });
    }
});

// Get tires in store
router.get('/store/:status?', async (req, res) => {
    try {
        const status = req.params.status || 'IN_STORE';
        const tires = await Tire.findAllByStatus(status);
        res.json(tires);
    } catch (error) {
        console.error('Error getting store tires:', error);
        res.status(500).json({ error: 'Failed to get store tires' });
    }
});

// Get retread candidates
router.get('/retread-candidates', async (req, res) => {
    try {
        const candidates = await Tire.getRetreadCandidates();
        res.json(candidates);
    } catch (error) {
        console.error('Error getting retread candidates:', error);
        res.status(500).json({ error: 'Failed to get retread candidates' });
    }
});

// Get tires pending disposal
router.get('/pending-disposal', async (req, res) => {
    try {
        const tires = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, 
                       MAX(ta.install_date) as last_used_date,
                       MAX(ta.removal_odometer) as last_odometer
                FROM tires t
                LEFT JOIN tire_assignments ta ON t.id = ta.tire_id
                WHERE t.status = 'USED_STORE'
                AND (julianday('now') - julianday(COALESCE(MAX(ta.removal_date), t.purchase_date))) > 180
                GROUP BY t.id
                ORDER BY t.size, t.brand
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(tires);
    } catch (error) {
        console.error('Error getting pending disposal:', error);
        res.status(500).json({ error: 'Failed to get pending disposal' });
    }
});

// Get tires by size (optionally filtered by status)
router.get('/size/:size', async (req, res) => {
    try {
        const size = decodeURIComponent(req.params.size);
        const { status } = req.query;

        const tires = await Tire.getTiresBySize(size, status);
        res.json(tires);
    } catch (error) {
        console.error('Error getting tires by size:', error);
        res.status(500).json({ error: 'Failed to get tires by size' });
    }
});

// Get dashboard stats
router.get('/dashboard-stats', async (req, res) => {
    try {        
        const stats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(CASE WHEN status = 'IN_STORE' THEN 1 END) as in_store,
                    COUNT(CASE WHEN status = 'ON_VEHICLE' THEN 1 END) as on_vehicle,
                    COUNT(CASE WHEN status = 'USED_STORE' THEN 1 END) as used_store,
                    COUNT(CASE WHEN status = 'AWAITING_RETREAD' THEN 1 END) as awaiting_retread,
                    COUNT(CASE WHEN status = 'AT_RETREAD_SUPPLIER' THEN 1 END) as at_retreader,
                    COUNT(CASE WHEN status = 'DISPOSED' THEN 1 END) as disposed,
                    COUNT(CASE WHEN type = 'NEW' THEN 1 END) as new_tires,
                    COUNT(CASE WHEN type = 'RETREADED' THEN 1 END) as retreaded_tires,
                    SUM(purchase_cost) as total_value
                FROM tires
            `, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json(stats);
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

module.exports = router;