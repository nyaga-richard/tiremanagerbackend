const db = require('../config/database');
const PurchaseOrder = require('./PurchaseOrder');

class GoodsReceivedNote {
    static async findAll(filters = {}, page = 1, limit = 20) {
        const {
            search,
            status,
            start_date,
            end_date,
            supplier_id,
            order_number,
            order_type,
            sort_by = 'receipt_date',
            sort_order = 'DESC'
        } = filters;

        const offset = (page - 1) * limit;

        // Build WHERE clause
        const whereConditions = [];
        const params = [];

        if (search) {
            whereConditions.push(`
                (grn.grn_number LIKE ? OR 
                 COALESCE(po.po_number, ro.order_number) LIKE ? OR 
                 COALESCE(s.name, s_retread.name) LIKE ? OR 
                 COALESCE(s.id, s_retread.id) LIKE ? OR 
                 grn.supplier_invoice_number LIKE ? OR 
                 grn.delivery_note_number LIKE ?)
            `);
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        if (status) {
            whereConditions.push('grn.status = ?');
            params.push(status);
        }

        if (start_date) {
            whereConditions.push('grn.receipt_date >= ?');
            params.push(start_date);
        }

        if (end_date) {
            whereConditions.push('grn.receipt_date <= ?');
            params.push(end_date);
        }

        if (supplier_id) {
            whereConditions.push('(s.id = ? OR s_retread.id = ?)');
            params.push(supplier_id, supplier_id);
        }

        if (order_number) {
            whereConditions.push('(po.po_number = ? OR ro.order_number = ?)');
            params.push(order_number, order_number);
        }

        if (order_type) {
            if (order_type === 'PURCHASE_ORDER') {
                whereConditions.push('grn.po_id IS NOT NULL');
            } else if (order_type === 'RETREAD_ORDER') {
                whereConditions.push('grn.retread_order_id IS NOT NULL');
            }
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}` 
            : '';

        // Count total records
        const countSql = `
            SELECT COUNT(*) as total
            FROM goods_received_notes grn
            LEFT JOIN purchase_orders po ON grn.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN retread_orders ro ON grn.retread_order_id = ro.id
            LEFT JOIN suppliers s_retread ON ro.supplier_id = s_retread.id
            ${whereClause}`;

        // Get paginated data
        const dataSql = `
            SELECT 
                grn.*,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN po.po_number 
                    ELSE ro.order_number 
                END as order_number,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN 'PURCHASE_ORDER'
                    ELSE 'RETREAD_ORDER'
                END as order_type,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN s.name
                    ELSE s_retread.name
                END as supplier_name,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN s.id
                    ELSE s_retread.id
                END as supplier_code,
                u.full_name as received_by_name,
                (
                    SELECT COUNT(*) 
                    FROM grn_items gi 
                    WHERE gi.grn_id = grn.id
                ) as item_count,
                (
                    SELECT SUM(gi.quantity_received) 
                    FROM grn_items gi 
                    WHERE gi.grn_id = grn.id
                ) as total_quantity,
                (
                    SELECT SUM(gi.quantity_received * gi.unit_cost) 
                    FROM grn_items gi 
                    WHERE gi.grn_id = grn.id
                ) as total_value
            FROM goods_received_notes grn
            LEFT JOIN purchase_orders po ON grn.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN retread_orders ro ON grn.retread_order_id = ro.id
            LEFT JOIN suppliers s_retread ON ro.supplier_id = s_retread.id
            LEFT JOIN users u ON grn.received_by = u.id
            ${whereClause}
            ORDER BY grn.${sort_by} ${sort_order}
            LIMIT ? OFFSET ?`;

        return new Promise((resolve, reject) => {
            db.get(countSql, params, (err, countResult) => {
                if (err) {
                    reject(err);
                    return;
                }

                const queryParams = [...params, limit, offset];
                db.all(dataSql, queryParams, (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve({
                        data: rows,
                        total: countResult.total,
                        page: page,
                        limit: limit,
                        total_pages: Math.ceil(countResult.total / limit)
                    });
                });
            });
        });
    }

    static async generateGrnNumber() {
        const year = new Date().getFullYear().toString().slice(-2);
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        
        const sql = `
            SELECT COUNT(*) as count 
            FROM goods_received_notes 
            WHERE grn_number LIKE 'GRN-${year}${month}%'`;
        
        return new Promise((resolve, reject) => {
            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const sequence = (row.count + 1).toString().padStart(4, '0');
                    resolve(`GRN-${year}${month}-${sequence}`);
                }
            });
        });
    }

    static async create(grnData) {
        const {
            po_id, // For purchase orders
            retread_order_id, // For retread orders
            receipt_date,
            received_by,
            supplier_invoice_number,
            delivery_note_number,
            vehicle_number,
            driver_name,
            notes,
            items // Array of items
        } = grnData;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Determine order type and verify order exists
                let orderType = po_id ? 'PURCHASE_ORDER' : 'RETREAD_ORDER';
                let orderId = po_id || retread_order_id;

                if (!orderId) {
                    db.run('ROLLBACK');
                    reject(new Error('Either po_id or retread_order_id is required'));
                    return;
                }

                // Verify the order exists and get supplier_id
                let checkOrderSql;
                if (orderType === 'PURCHASE_ORDER') {
                    checkOrderSql = `SELECT id, supplier_id FROM purchase_orders WHERE id = ?`;
                } else {
                    checkOrderSql = `SELECT id, supplier_id FROM retread_orders WHERE id = ?`;
                }

                db.get(checkOrderSql, [orderId], (err, order) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(new Error(`Error checking order: ${err.message}`));
                        return;
                    }
                    
                    if (!order) {
                        db.run('ROLLBACK');
                        reject(new Error(`${orderType} with ID ${orderId} does not exist`));
                        return;
                    }

                    // Generate GRN number
                    this.generateGrnNumber().then(grnNumber => {
                        // 1. Create GRN with appropriate foreign key
                        let grnSql, grnParams;

                        if (orderType === 'PURCHASE_ORDER') {
                            grnSql = `
                                INSERT INTO goods_received_notes 
                                (grn_number, po_id, receipt_date, received_by, supplier_invoice_number, delivery_note_number,
                                vehicle_number, driver_name, notes, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`;
                            
                            grnParams = [
                                grnNumber,
                                po_id,
                                receipt_date,
                                received_by,
                                supplier_invoice_number || null,
                                delivery_note_number || null,
                                vehicle_number || null,
                                driver_name || null,
                                notes || null
                            ];
                        } else {
                            grnSql = `
                                INSERT INTO goods_received_notes 
                                (grn_number, retread_order_id, receipt_date, received_by, supplier_invoice_number, delivery_note_number,
                                vehicle_number, driver_name, notes, status)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`;
                            
                            grnParams = [
                                grnNumber,
                                retread_order_id,
                                receipt_date,
                                received_by,
                                supplier_invoice_number || null,
                                delivery_note_number || null,
                                vehicle_number || null,
                                driver_name || null,
                                notes || null
                            ];
                        }

                        db.run(grnSql, grnParams, function(err) {
                            if (err) {
                                console.error('Error inserting GRN:', err);
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            const grnId = this.lastID;
                            console.log(`GRN created with ID: ${grnId} for ${orderType}`);

                            const processedItems = [];
                            const processedTires = [];

                            // 2. Process each item
                            const processNextItem = (index) => {
                                if (index >= items.length) {
                                    // All items processed
                                    db.run('COMMIT', (err) => {
                                        if (err) {
                                            console.error('Error committing transaction:', err);
                                            db.run('ROLLBACK');
                                            reject(err);
                                        } else {
                                            resolve({
                                                grnId: grnId,
                                                grnNumber: grnNumber,
                                                orderType: orderType,
                                                items: processedItems,
                                                tires: processedTires
                                            });
                                        }
                                    });
                                    return;
                                }

                                const item = items[index];
                                const {
                                    po_item_id,
                                    retread_order_item_id,
                                    quantity_received,
                                    unit_cost,
                                    batch_number,
                                    brand,
                                    serial_numbers,
                                    notes: itemNotes,
                                    condition
                                } = item;

                                // Determine item ID based on order type
                                const itemId = orderType === 'PURCHASE_ORDER' ? po_item_id : retread_order_item_id;

                                console.log(`Processing item ${index + 1}:`, { 
                                    itemId, 
                                    quantity_received, 
                                    brand,
                                    grnId 
                                });

                                // Verify the order item exists
                                let checkItemSql;
                                if (orderType === 'PURCHASE_ORDER') {
                                    checkItemSql = `SELECT id FROM purchase_order_items WHERE id = ?`;
                                } else {
                                    checkItemSql = `SELECT id FROM retread_order_items WHERE id = ?`;
                                }

                                db.get(checkItemSql, [itemId], (err, orderItem) => {
                                    if (err) {
                                        console.error('Error checking order item:', err);
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }

                                    if (!orderItem) {
                                        db.run('ROLLBACK');
                                        reject(new Error(`${orderType} item with ID ${itemId} does not exist`));
                                        return;
                                    }

                                    // Create GRN item
                                    const grnItemSql = `
                                        INSERT INTO grn_items 
                                        (grn_id, po_item_id, retread_order_item_id, quantity_received, unit_cost, 
                                        batch_number, serial_numbers, notes, brand)
                                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                                    const serialNumbersJson = JSON.stringify(serial_numbers || []);

                                    db.run(grnItemSql, [
                                        grnId,
                                        orderType === 'PURCHASE_ORDER' ? itemId : null,
                                        orderType === 'RETREAD_ORDER' ? itemId : null,
                                        quantity_received,
                                        unit_cost,
                                        batch_number,
                                        serialNumbersJson,
                                        itemNotes,
                                        brand
                                    ], function(err) {
                                        if (err) {
                                            console.error('Error inserting GRN item:', err);
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }

                                        const grnItemId = this.lastID;
                                        console.log(`GRN item created with ID: ${grnItemId}`);

                                        // Update the order item based on type
                                        if (orderType === 'PURCHASE_ORDER') {
                                            // Update PO item received quantity
                                            const updatePoItemSql = `
                                                UPDATE purchase_order_items 
                                                SET received_quantity = COALESCE(received_quantity, 0) + ?
                                                WHERE id = ?`;

                                            db.run(updatePoItemSql, [quantity_received, itemId], function(err) {
                                                if (err) {
                                                    console.error('Error updating PO item:', err);
                                                    db.run('ROLLBACK');
                                                    reject(err);
                                                    return;
                                                }
                                                processNextItemAfterUpdate();
                                            });
                                        } else {
                                            // For retread orders, mark the item as received
                                            const updateRetreadItemSql = `
                                                UPDATE retread_order_items 
                                                SET status = ?,
                                                    cost = ?,
                                                    notes = ?
                                                WHERE id = ?`;

                                            const newStatus = condition === 'REJECTED' ? 'REJECTED' : 'RECEIVED';
                                            
                                            db.run(updateRetreadItemSql, [
                                                newStatus,
                                                unit_cost,
                                                itemNotes || null,
                                                itemId
                                            ], function(err) {
                                                if (err) {
                                                    console.error('Error updating retread item:', err);
                                                    db.run('ROLLBACK');
                                                    reject(err);
                                                    return;
                                                }
                                                processNextItemAfterUpdate();
                                            });
                                        }

                                        const processNextItemAfterUpdate = () => {
                                            // Get item details based on order type
                                            let detailsSql;
                                            
                                            if (orderType === 'PURCHASE_ORDER') {
                                                detailsSql = `
                                                    SELECT 
                                                        poi.*,
                                                        po.supplier_id,
                                                        po.po_date
                                                    FROM purchase_order_items poi
                                                    JOIN purchase_orders po ON poi.po_id = po.id
                                                    WHERE poi.id = ?`;
                                            } else {
                                                detailsSql = `
                                                    SELECT 
                                                        roi.*,
                                                        t.serial_number as existing_serial,
                                                        t.size,
                                                        t.brand as tire_brand,
                                                        t.model,
                                                        t.type,
                                                        t.id as tire_id
                                                    FROM retread_order_items roi
                                                    JOIN tires t ON roi.tire_id = t.id
                                                    WHERE roi.id = ?`;
                                            }

                                            db.get(detailsSql, [itemId], (err, itemDetails) => {
                                                if (err) {
                                                    console.error('Error fetching item details:', err);
                                                    db.run('ROLLBACK');
                                                    reject(err);
                                                    return;
                                                }

                                                if (!itemDetails) {
                                                    db.run('ROLLBACK');
                                                    reject(new Error(`Could not fetch details for ${orderType} item ${itemId}`));
                                                    return;
                                                }

                                                if (orderType === 'PURCHASE_ORDER') {
                                                    // For purchase orders, create new tires
                                                    const createNextTire = (tireIndex) => {
                                                        if (tireIndex >= quantity_received) {
                                                            processedItems.push({
                                                                grnItemId: grnItemId,
                                                                po_item_id: itemId,
                                                                quantity_received: quantity_received,
                                                                brand: brand,
                                                                serial_numbers: serial_numbers
                                                            });
                                                            processNextItem(index + 1);
                                                            return;
                                                        }

                                                        const serialNumber = serial_numbers && serial_numbers[tireIndex] 
                                                            ? serial_numbers[tireIndex]
                                                            : `${grnNumber}-${itemId.toString().padStart(3, '0')}-${(tireIndex + 1).toString().padStart(3, '0')}`;

                                                        const tireSql = `
                                                            INSERT INTO tires 
                                                            (serial_number, size, brand, model, type,
                                                            purchase_cost, supplier_id, purchase_date,
                                                            po_item_id, grn_id, grn_item_id,
                                                            status, current_location)
                                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STORE', 'WAREHOUSE')`;

                                                        db.run(tireSql, [
                                                            serialNumber,
                                                            itemDetails.size,
                                                            brand || itemDetails.brand,
                                                            itemDetails.model,
                                                            itemDetails.type,
                                                            unit_cost || itemDetails.unit_price,
                                                            itemDetails.supplier_id,
                                                            itemDetails.po_date,
                                                            itemId,
                                                            grnId,
                                                            grnItemId
                                                        ], function(err) {
                                                            if (err) {
                                                                console.error('Error creating tire:', err);
                                                                db.run('ROLLBACK');
                                                                reject(err);
                                                                return;
                                                            }

                                                            const tireId = this.lastID;
                                                            console.log(`Tire created with ID: ${tireId}, Serial: ${serialNumber}`);

                                                            processedTires.push({
                                                                id: tireId,
                                                                serial_number: serialNumber,
                                                                po_item_id: itemId,
                                                                brand: brand || itemDetails.brand
                                                            });

                                                            // Create movement record
                                                            const movementSql = `
                                                                INSERT INTO tire_movements 
                                                                (tire_id, from_location, to_location, movement_type,
                                                                reference_id, reference_type, po_item_id, grn_id, user_id)
                                                                VALUES (?, 'SUPPLIER', 'WAREHOUSE', 'PURCHASE_TO_STORE',
                                                                        ?, 'GRN', ?, ?, ?)`;

                                                            db.run(movementSql, [
                                                                tireId,
                                                                grnId,
                                                                itemId,
                                                                grnId,
                                                                received_by
                                                            ], (err) => {
                                                                if (err) {
                                                                    console.error('Error creating movement:', err);
                                                                    db.run('ROLLBACK');
                                                                    reject(err);
                                                                    return;
                                                                }

                                                                createNextTire(tireIndex + 1);
                                                            });
                                                        });
                                                    };

                                                    createNextTire(0);
                                                } else {
                                                    // For retread orders, update existing tire - CHANGED HERE
                                                    let updateTireSql;
                                                    let updateParams;

                                                    if (condition === 'REJECTED') {
                                                        // Tire rejected after retreading → dispose it
                                                        updateTireSql = `
                                                            UPDATE tires 
                                                            SET retread_count = COALESCE(retread_count, 0) + 1,
                                                                type = 'RETREADED',
                                                                status = 'DISPOSED',
                                                                supplier_id = ?,
                                                                disposal_date = CURRENT_TIMESTAMP,
                                                                disposal_reason = ?,
                                                                disposal_method = ?,
                                                                disposal_authorized_by = ?,
                                                                disposal_notes = ?
                                                            WHERE id = ?`;

                                                        updateParams = [
                                                            order.supplier_id,
                                                            'RETREAD REJECT',  // disposal_reason
                                                            'DISPOSAL',        // disposal_method
                                                            received_by,       // disposal_authorized_by
                                                            itemNotes || 'Rejected during retreading', // disposal_notes
                                                            itemDetails.tire_id
                                                        ];

                                                    } else {
                                                        // Accepted retread → return to store
                                                        updateTireSql = `
                                                            UPDATE tires 
                                                            SET retread_count = COALESCE(retread_count, 0) + 1,
                                                                type = 'RETREADED',
                                                                status = 'IN_STORE',
                                                                supplier_id = ?
                                                            WHERE id = ?`;

                                                        updateParams = [
                                                            order.supplier_id,
                                                            itemDetails.tire_id
                                                        ];
                                                    }


                                                    db.run(updateTireSql, updateParams, function(err) {
                                                        if (err) {
                                                            console.error('Error updating tire:', err);
                                                            db.run('ROLLBACK');
                                                            reject(err);
                                                            return;
                                                        }

                                                        // Create movement record for retread result
                                                        const movementSql = `
                                                            INSERT INTO tire_movements 
                                                            (tire_id, from_location, to_location, movement_type,
                                                            reference_id, reference_type, user_id, notes)
                                                            VALUES (?, 'AT_RETREAD_SUPPLIER', ?, ?, ?, ?, ?, ?)`;

                                                        const toLocation = condition === 'REJECTED' ? 'DISPOSED' : 'WAREHOUSE';

                                                        const movementType = condition === 'REJECTED'
                                                            ? 'STORE_TO_DISPOSAL'
                                                            : 'RETREAD_SUPPLIER_TO_STORE';

                                                        const movementNotes = condition === 'REJECTED'
                                                            ? (itemNotes || 'Disposed after retread rejection')
                                                            : (itemNotes || 'Received from retreading');

                                                        db.run(movementSql, [
                                                            itemDetails.tire_id,
                                                            toLocation,
                                                            movementType,
                                                            grnId,
                                                            'GRN',
                                                            received_by,
                                                            movementNotes
                                                        ], (err) => {
                                                            if (err) {
                                                                console.error('Error creating movement:', err);
                                                                db.run('ROLLBACK');
                                                                reject(err);
                                                                return;
                                                            }

                                                            processedTires.push({
                                                                id: itemDetails.tire_id,
                                                                serial_number: itemDetails.existing_serial,
                                                                retread_order_item_id: itemId,
                                                                brand: brand || itemDetails.tire_brand,
                                                                condition: condition,
                                                                type: 'RETREADED',
                                                                status: condition === 'REJECTED' ? 'DISPOSED' : 'IN_STORE',
                                                                disposal_reason: condition === 'REJECTED' ? 'RETREAD REJECT' : null,
                                                                disposal_date: condition === 'REJECTED' ? new Date().toISOString() : null,
                                                                disposal_notes: condition === 'REJECTED' ? (itemNotes || 'Disposed after retread rejection') : null,
                                                                disposal_method: condition === 'REJECTED' ? 'DISPOSAL' : null,
                                                                disposal_authorized_by: condition === 'REJECTED' ? received_by : null
                                                            });

                                                            processedItems.push({
                                                                grnItemId: grnItemId,
                                                                retread_order_item_id: itemId,
                                                                quantity_received: quantity_received,
                                                                brand: brand,
                                                                condition: condition,
                                                                serial_numbers: serial_numbers
                                                            });

                                                            processNextItem(index + 1);
                                                        });
                                                    });
                                                }
                                            });
                                        };
                                    });
                                });
                            };

                            // Start processing items
                            processNextItem(0);
                        });
                    }).catch(err => {
                        console.error('Error generating GRN number:', err);
                        db.run('ROLLBACK');
                        reject(err);
                    });
                });
            });
        });
    }

    static async findById(grnId) {
        const sql = `
            SELECT 
                grn.*,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN po.po_number
                    WHEN grn.retread_order_id IS NOT NULL THEN ro.order_number
                    ELSE NULL
                END AS order_number,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN 'PURCHASE_ORDER'
                    WHEN grn.retread_order_id IS NOT NULL THEN 'RETREAD_ORDER'
                    ELSE NULL
                END AS order_type,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN s.name
                    WHEN grn.retread_order_id IS NOT NULL THEN s_retread.name
                    ELSE NULL
                END AS supplier_name,
                CASE 
                    WHEN grn.po_id IS NOT NULL THEN s.id
                    WHEN grn.retread_order_id IS NOT NULL THEN s_retread.id
                    ELSE NULL
                END AS supplier_code,
                u.full_name AS received_by_name
            FROM goods_received_notes grn
            LEFT JOIN purchase_orders po ON grn.po_id = po.id
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN retread_orders ro ON grn.retread_order_id = ro.id
            LEFT JOIN suppliers s_retread ON ro.supplier_id = s_retread.id
            LEFT JOIN users u ON grn.received_by = u.id
            WHERE grn.id = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [grnId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findByOrderId(orderId, orderType) {
        let sql;
        if (orderType === 'PURCHASE_ORDER') {
            sql = `
                SELECT grn.*, u.full_name as received_by_name
                FROM goods_received_notes grn
                LEFT JOIN users u ON grn.received_by = u.id
                WHERE grn.po_id = ?
                ORDER BY grn.receipt_date DESC, grn.created_at DESC`;
        } else {
            sql = `
                SELECT grn.*, u.full_name as received_by_name
                FROM goods_received_notes grn
                LEFT JOIN users u ON grn.received_by = u.id
                WHERE grn.retread_order_id = ?
                ORDER BY grn.receipt_date DESC, grn.created_at DESC`;
        }

        return new Promise((resolve, reject) => {
            db.all(sql, [orderId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getItems(grnId) {
        const sql = `
            SELECT gi.*, 
                   gi.brand as received_brand,
                   CASE 
                       WHEN gi.po_item_id IS NOT NULL THEN poi.size
                       WHEN gi.retread_order_item_id IS NOT NULL THEN t.size
                       ELSE NULL
                   END as size,
                   CASE 
                       WHEN gi.po_item_id IS NOT NULL THEN poi.brand
                       WHEN gi.retread_order_item_id IS NOT NULL THEN t.brand
                       ELSE NULL
                   END as original_brand,
                   CASE 
                       WHEN gi.po_item_id IS NOT NULL THEN poi.model
                       WHEN gi.retread_order_item_id IS NOT NULL THEN t.model
                       ELSE NULL
                   END as model,
                   CASE 
                       WHEN gi.po_item_id IS NOT NULL THEN poi.type
                       WHEN gi.retread_order_item_id IS NOT NULL THEN t.type
                       ELSE NULL
                   END as type,
                   CASE 
                       WHEN gi.po_item_id IS NOT NULL THEN 'PURCHASE_ORDER'
                       ELSE 'RETREAD_ORDER'
                   END as order_type,
                   COUNT(DISTINCT t.id) as tires_created
            FROM grn_items gi
            LEFT JOIN purchase_order_items poi ON gi.po_item_id = poi.id
            LEFT JOIN retread_order_items roi ON gi.retread_order_item_id = roi.id
            LEFT JOIN tires t ON roi.tire_id = t.id OR gi.id = t.grn_item_id
            WHERE gi.grn_id = ?
            GROUP BY gi.id
            ORDER BY gi.created_at DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [grnId], (err, rows) => {
                if (err) reject(err);
                else {
                    rows.forEach(row => {
                        if (row.serial_numbers) {
                            try {
                                row.serial_numbers = JSON.parse(row.serial_numbers);
                            } catch (e) {
                                row.serial_numbers = [];
                            }
                        }
                        if (!row.brand && row.received_brand) {
                            row.brand = row.received_brand;
                        }
                    });
                    resolve(rows);
                }
            });
        });
    }

    static async getTiresByGrn(grnId) {
        const sql = `
            SELECT t.*, 
                   gi.brand as received_brand
            FROM tires t
            JOIN grn_items gi ON t.grn_item_id = gi.id
            WHERE t.grn_id = ?
            ORDER BY t.serial_number`;

        return new Promise((resolve, reject) => {
            db.all(sql, [grnId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async validateSerialNumbers(po_item_id, serial_numbers) {
        const sql = `
            SELECT COUNT(*) as existing_count
            FROM tires 
            WHERE serial_number IN (${serial_numbers.map(() => '?').join(',')})`;

        return new Promise((resolve, reject) => {
            db.get(sql, serial_numbers, (err, row) => {
                if (err) reject(err);
                else resolve(row.existing_count === 0);
            });
        });
    }

    static async updateInvoiceNumber(grnId, invoiceNumber) {
        const sql = `
            UPDATE goods_received_notes 
            SET supplier_invoice_number = ?                
            WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, [invoiceNumber, grnId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async updateInventory(grnId) {
        // This is primarily for purchase orders
        // For retread orders, inventory is handled differently
        const sql = `
        INSERT INTO inventory_catalog 
        (size, brand, model, type, current_stock, 
        last_purchase_date, last_purchase_price, supplier_id)
        SELECT 
            poi.size,
            COALESCE(gi.brand, poi.brand),
            poi.model,
            poi.type,
            COALESCE(SUM(gi.quantity_received), 0),
            MAX(grn.receipt_date),
            AVG(gi.unit_cost),
            po.supplier_id
        FROM grn_items gi
        JOIN purchase_order_items poi ON gi.po_item_id = poi.id
        JOIN goods_received_notes grn ON gi.grn_id = grn.id
        JOIN purchase_orders po ON grn.po_id = po.id
        WHERE gi.grn_id = ? AND gi.po_item_id IS NOT NULL
        GROUP BY poi.size, COALESCE(gi.brand, poi.brand), poi.model, poi.type
        ON CONFLICT(size, brand, model, type) DO UPDATE SET
            current_stock = inventory_catalog.current_stock + EXCLUDED.current_stock,
            last_purchase_date = EXCLUDED.last_purchase_date,
            last_purchase_price = EXCLUDED.last_purchase_price,
            supplier_id = EXCLUDED.supplier_id
        `;

        return new Promise((resolve, reject) => {
            db.run(sql, [grnId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }
}

module.exports = GoodsReceivedNote;