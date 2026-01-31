const db = require('../config/database');
const PurchaseOrder = require('./PurchaseOrder');

class GoodsReceivedNote {
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
            po_id,
            receipt_date,
            received_by,
            supplier_invoice_number,
            delivery_note_number,
            vehicle_number,
            driver_name,
            notes,
            items // Array of items with serial numbers
        } = grnData;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // Generate GRN number
                this.generateGrnNumber().then(grnNumber => {
                    // 1. Create GRN
                    const grnSql = `
                        INSERT INTO goods_received_notes 
                        (grn_number, po_id, receipt_date, received_by, 
                         supplier_invoice_number, delivery_note_number,
                         vehicle_number, driver_name, notes, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`;

                    db.run(grnSql, [
                        grnNumber,
                        po_id,
                        receipt_date,
                        received_by,
                        supplier_invoice_number,
                        delivery_note_number,
                        vehicle_number,
                        driver_name,
                        notes
                    ], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }

                        const grnId = this.lastID;
                        const processedItems = [];
                        const generatedTires = [];

                        // 2. Process each item
                        const processNextItem = (index) => {
                            if (index >= items.length) {
                                // All items processed
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                    } else {
                                        resolve({
                                            grnId: grnId,
                                            grnNumber: grnNumber,
                                            items: processedItems,
                                            tires: generatedTires
                                        });
                                    }
                                });
                                return;
                            }

                            const item = items[index];
                            const {
                                po_item_id,
                                quantity_received,
                                unit_cost,
                                batch_number,
                                serial_numbers, // Array of serial numbers
                                notes
                            } = item;

                            // 2a. Create GRN item
                            const grnItemSql = `
                                INSERT INTO grn_items 
                                (grn_id, po_item_id, quantity_received, unit_cost, 
                                 batch_number, serial_numbers, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?)`;

                            const serialNumbersJson = JSON.stringify(serial_numbers || []);

                            db.run(grnItemSql, [
                                grnId,
                                po_item_id,
                                quantity_received,
                                unit_cost,
                                batch_number,
                                serialNumbersJson,
                                notes
                            ], function(err) {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                const grnItemId = this.lastID;

                                // 2b. Update PO item received quantity
                                const updatePoItemSql = `
                                    UPDATE purchase_order_items 
                                    SET received_quantity = COALESCE(received_quantity, 0) + ?,
                                        updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ?`;

                                db.run(updatePoItemSql, [quantity_received, po_item_id], async function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                        return;
                                    }

                                    // 2c. Get PO item details for tire creation
                                    const poItemSql = `
                                        SELECT poi.*, po.supplier_id, po.po_date
                                        FROM purchase_order_items poi
                                        JOIN purchase_orders po ON poi.po_id = po.id
                                        WHERE poi.id = ?`;

                                    db.get(poItemSql, [po_item_id], async (err, poItem) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                            return;
                                        }

                                        // 2d. Create tire records for each unit
                                        const createNextTire = (tireIndex) => {
                                            if (tireIndex >= quantity_received) {
                                                // All tires created for this item
                                                processedItems.push({
                                                    grnItemId: grnItemId,
                                                    po_item_id: po_item_id,
                                                    quantity_received: quantity_received,
                                                    serial_numbers: serial_numbers
                                                });
                                                processNextItem(index + 1);
                                                return;
                                            }

                                            const serialNumber = serial_numbers && serial_numbers[tireIndex] 
                                                ? serial_numbers[tireIndex]
                                                : `${grnNumber}-${po_item_id.toString().padStart(3, '0')}-${(tireIndex + 1).toString().padStart(3, '0')}`;

                                            // Create tire
                                            const tireSql = `
                                                INSERT INTO tires 
                                                (serial_number, size, brand, model, type,
                                                 purchase_cost, supplier_id, purchase_date,
                                                 po_item_id, grn_id, grn_item_id,
                                                 status, current_location)
                                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STORE', 'WAREHOUSE')`;

                                            db.run(tireSql, [
                                                serialNumber,
                                                poItem.size,
                                                poItem.brand,
                                                poItem.model,
                                                poItem.type,
                                                unit_cost || poItem.unit_price,
                                                poItem.supplier_id,
                                                poItem.po_date,
                                                po_item_id,
                                                grnId,
                                                grnItemId
                                            ], function(err) {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    reject(err);
                                                    return;
                                                }

                                                const tireId = this.lastID;
                                                generatedTires.push({
                                                    id: tireId,
                                                    serial_number: serialNumber,
                                                    po_item_id: po_item_id
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
                                                    po_item_id,
                                                    grnId,
                                                    received_by
                                                ], (err) => {
                                                    if (err) {
                                                        db.run('ROLLBACK');
                                                        reject(err);
                                                        return;
                                                    }

                                                    createNextTire(tireIndex + 1);
                                                });
                                            });
                                        };

                                        // Start creating tires for this item
                                        createNextTire(0);
                                    });
                                });
                            });
                        };

                        // Start processing items
                        processNextItem(0);
                    });
                }).catch(err => {
                    db.run('ROLLBACK');
                    reject(err);
                });
            });
        });
    }

    static async findById(grnId) {
        const sql = `
            SELECT grn.*, 
                   po.po_number,
                   s.name as supplier_name,
                   s.id as supplier_id,
                   u.full_name as received_by_name
            FROM goods_received_notes grn
            JOIN purchase_orders po ON grn.po_id = po.id
            JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u ON grn.received_by = u.id
            WHERE grn.id = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [grnId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findByPoId(poId) {
        const sql = `
            SELECT grn.*, u.full_name as received_by_name
            FROM goods_received_notes grn
            LEFT JOIN users u ON grn.received_by = u.id
            WHERE grn.po_id = ?
            ORDER BY grn.receipt_date DESC, grn.created_at DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [poId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getItems(grnId) {
        const sql = `
            SELECT gi.*, 
                   poi.size,
                   poi.brand,
                   poi.model,
                   poi.type,
                   poi.quantity as po_quantity,
                   poi.received_quantity as total_received,
                   COUNT(t.id) as tires_created
            FROM grn_items gi
            JOIN purchase_order_items poi ON gi.po_item_id = poi.id
            LEFT JOIN tires t ON gi.id = t.grn_item_id
            WHERE gi.grn_id = ?
            GROUP BY gi.id
            ORDER BY poi.size, poi.brand`;

        return new Promise((resolve, reject) => {
            db.all(sql, [grnId], (err, rows) => {
                if (err) reject(err);
                else {
                    // Parse serial numbers JSON
                    rows.forEach(row => {
                        if (row.serial_numbers) {
                            row.serial_numbers = JSON.parse(row.serial_numbers);
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
                   poi.size,
                   poi.brand,
                   poi.model,
                   poi.type
            FROM tires t
            JOIN purchase_order_items poi ON t.po_item_id = poi.id
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

    static async updateInventory(grnId) {
        const sql = `
            INSERT OR REPLACE INTO inventory_catalog 
            (size, brand, model, type, current_stock, 
             last_purchase_date, last_purchase_price, supplier_id)
            SELECT 
                poi.size,
                poi.brand,
                poi.model,
                poi.type,
                COALESCE(SUM(gi.quantity_received), 0) as received_qty,
                MAX(grn.receipt_date) as last_receipt_date,
                AVG(gi.unit_cost) as avg_cost,
                po.supplier_id
            FROM grn_items gi
            JOIN purchase_order_items poi ON gi.po_item_id = poi.id
            JOIN goods_received_notes grn ON gi.grn_id = grn.id
            JOIN purchase_orders po ON grn.po_id = po.id
            WHERE gi.grn_id = ?
            GROUP BY poi.size, poi.brand, poi.model, poi.type
            ON CONFLICT(size, brand, model, type) DO UPDATE SET
                current_stock = current_stock + EXCLUDED.current_stock,
                last_purchase_date = EXCLUDED.last_purchase_date,
                last_purchase_price = EXCLUDED.last_purchase_price,
                updated_at = CURRENT_TIMESTAMP`;

        return new Promise((resolve, reject) => {
            db.run(sql, [grnId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }
}

module.exports = GoodsReceivedNote;