const db = require('../config/database');

class PurchaseOrderItem {
    static async create(itemData) {
        const {
            po_id,
            size,
            brand = null,
            model = null,
            type = 'NEW',
            quantity,
            unit_price,
            notes = null
        } = itemData;

        const sql = `INSERT INTO purchase_order_items 
                    (po_id, size, brand, model, type, quantity, unit_price, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                po_id,
                size,
                brand,
                model,
                type,
                quantity,
                unit_price,
                notes
            ], async function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                const itemId = this.lastID;
                
                // Update the PO total amount
                try {
                    await this.updatePoTotal(po_id);
                    resolve(itemId);
                } catch (updateErr) {
                    reject(updateErr);
                }
            }.bind(this));
        });
    }

    static async update(itemId, updateData) {
        const {
            size,
            brand,
            model,
            type,
            quantity,
            unit_price,
            notes,
            received_quantity
        } = updateData;

        const updates = [];
        const values = [];

        if (size !== undefined) {
            updates.push('size = ?');
            values.push(size);
        }
        if (brand !== undefined) {
            updates.push('brand = ?');
            values.push(brand);
        }
        if (model !== undefined) {
            updates.push('model = ?');
            values.push(model);
        }
        if (type !== undefined) {
            updates.push('type = ?');
            values.push(type);
        }
        if (quantity !== undefined) {
            updates.push('quantity = ?');
            values.push(quantity);
        }
        if (unit_price !== undefined) {
            updates.push('unit_price = ?');
            values.push(unit_price);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        if (received_quantity !== undefined) {
            updates.push('received_quantity = ?');
            values.push(received_quantity);
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');

        if (updates.length === 0) {
            return Promise.resolve(0);
        }

        values.push(itemId);
        const sql = `UPDATE purchase_order_items SET ${updates.join(', ')} WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, values, async function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                if (this.changes > 0) {
                    // Get PO ID for updating total
                    try {
                        const poId = await this.getPoIdByItemId(itemId);
                        await this.updatePoTotal(poId);
                        resolve(this.changes);
                    } catch (updateErr) {
                        reject(updateErr);
                    }
                } else {
                    resolve(0);
                }
            }.bind(this));
        });
    }

    static async updatePoTotal(poId) {
        const sql = `
            UPDATE purchase_orders 
            SET total_amount = (
                SELECT COALESCE(SUM(quantity * unit_price), 0) 
                FROM purchase_order_items 
                WHERE po_id = ?
            ),
            final_amount = (
                SELECT COALESCE(SUM(quantity * unit_price), 0) + COALESCE(tax_amount, 0) + COALESCE(shipping_amount, 0)
                FROM purchase_order_items 
                WHERE po_id = ?
            ),
            updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, [poId, poId, poId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async getPoIdByItemId(itemId) {
        const sql = `SELECT po_id FROM purchase_order_items WHERE id = ?`;
        
        return new Promise((resolve, reject) => {
            db.get(sql, [itemId], (err, row) => {
                if (err) reject(err);
                else if (row) resolve(row.po_id);
                else reject(new Error('Item not found'));
            });
        });
    }

    static async findById(itemId) {
        const sql = `
            SELECT poi.*,
                   po.po_number,
                   po.status as po_status,
                   s.name as supplier_name
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE poi.id = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [itemId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findByPoId(poId) {
        const sql = `
            SELECT poi.*,
                   (SELECT COUNT(*) FROM tires WHERE po_item_id = poi.id) as tires_created
            FROM purchase_order_items poi
            WHERE poi.po_id = ?
            ORDER BY poi.id`;

        return new Promise((resolve, reject) => {
            db.all(sql, [poId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async receiveItems(itemId, quantity, batchNumber = null, receivedBy) {
        // Start a transaction to handle receipt
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Update received quantity
                const updateSql = `
                    UPDATE purchase_order_items 
                    SET received_quantity = COALESCE(received_quantity, 0) + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`;

                db.run(updateSql, [quantity, itemId], function(err) {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    // 2. Create receipt record
                    const receiptSql = `
                        INSERT INTO po_receipts 
                        (po_id, po_item_id, receipt_date, quantity_received, batch_number, received_by)
                        SELECT po_id, ?, CURRENT_DATE, ?, ?, ?
                        FROM purchase_order_items 
                        WHERE id = ?`;

                    db.run(receiptSql, [itemId, quantity, batchNumber, receivedBy, itemId], async function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }

                        // 3. Get item details for updating PO status
                        const itemSql = `SELECT po_id, quantity, received_quantity FROM purchase_order_items WHERE id = ?`;
                        db.get(itemSql, [itemId], async (err, item) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            // 4. Update PO status based on received quantities
                            const poSql = `
                                SELECT 
                                    po.id,
                                    SUM(poi.quantity) as total_quantity,
                                    SUM(poi.received_quantity) as total_received
                                FROM purchase_orders po
                                JOIN purchase_order_items poi ON po.id = poi.po_id
                                WHERE po.id = ?
                                GROUP BY po.id`;

                            db.get(poSql, [item.po_id], (err, po) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                let newStatus = po.po_status;
                                if (po.total_received >= po.total_quantity) {
                                    newStatus = 'FULLY_RECEIVED';
                                } else if (po.total_received > 0) {
                                    newStatus = 'PARTIALLY_RECEIVED';
                                }

                                const updatePoSql = `UPDATE purchase_orders SET status = ? WHERE id = ?`;
                                db.run(updatePoSql, [newStatus, item.po_id], function(err) {
                                    if (err) {
                                        db.run('ROLLBACK');
                                        reject(err);
                                    } else {
                                        db.run('COMMIT');
                                        resolve({
                                            itemId: itemId,
                                            receivedQuantity: quantity,
                                            newTotalReceived: item.received_quantity + quantity,
                                            poStatus: newStatus
                                        });
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });
    }

    static async getReceiptHistory(itemId) {
        const sql = `
            SELECT pr.*, u.full_name as received_by_name
            FROM po_receipts pr
            LEFT JOIN users u ON pr.received_by = u.id
            WHERE pr.po_item_id = ?
            ORDER BY pr.receipt_date DESC, pr.created_at DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [itemId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async generateTires(itemId, startSerial = null) {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Get item details
                const itemSql = `
                    SELECT poi.*, po.supplier_id, po.po_date
                    FROM purchase_order_items poi
                    JOIN purchase_orders po ON poi.po_id = po.id
                    WHERE poi.id = ?`;

                db.get(itemSql, [itemId], (err, item) => {
                    if (err) {
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    if (!item) {
                        db.run('ROLLBACK');
                        reject(new Error('Item not found'));
                        return;
                    }

                    const tiresToGenerate = item.quantity;
                    const generatedTires = [];

                    // 2. Generate tires
                    for (let i = 0; i < tiresToGenerate; i++) {
                        const serialNumber = startSerial 
                            ? `${startSerial}-${(i + 1).toString().padStart(3, '0')}`
                            : `T${itemId.toString().padStart(6, '0')}-${(i + 1).toString().padStart(3, '0')}`;

                        const tireSql = `
                            INSERT INTO tires 
                            (serial_number, size, brand, model, type, 
                             purchase_cost, supplier_id, purchase_date, po_item_id,
                             status, current_location)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_STORE', 'WAREHOUSE')`;

                        db.run(tireSql, [
                            serialNumber,
                            item.size,
                            item.brand,
                            item.model,
                            item.type,
                            item.unit_price,
                            item.supplier_id,
                            item.po_date,
                            itemId
                        ], function(err) {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            generatedTires.push({
                                id: this.lastID,
                                serialNumber: serialNumber
                            });

                            // 3. Create movement record
                            const movementSql = `
                                INSERT INTO tire_movements 
                                (tire_id, from_location, to_location, movement_type, 
                                 reference_id, reference_type, po_item_id, user_id)
                                VALUES (?, 'SUPPLIER', 'WAREHOUSE', 'PURCHASE_TO_STORE', 
                                        ?, 'PO_ITEM', ?, 'SYSTEM')`;

                            db.run(movementSql, [this.lastID, itemId, itemId], (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    reject(err);
                                    return;
                                }

                                // Last tire generated
                                if (generatedTires.length === tiresToGenerate) {
                                    // 4. Update inventory catalog
                                    const catalogSql = `
                                        INSERT OR REPLACE INTO inventory_catalog 
                                        (size, brand, model, type, current_stock, 
                                         last_purchase_date, last_purchase_price, supplier_id)
                                        VALUES (?, ?, ?, ?, 
                                                COALESCE((SELECT current_stock FROM inventory_catalog 
                                                         WHERE size = ? AND brand = ? AND model = ? AND type = ?), 0) + ?,
                                                ?, ?, ?)
                                        ON CONFLICT(size, brand, model, type) DO UPDATE SET
                                            current_stock = current_stock + ?,
                                            last_purchase_date = ?,
                                            last_purchase_price = ?,
                                            updated_at = CURRENT_TIMESTAMP`;

                                    db.run(catalogSql, [
                                        item.size, item.brand, item.model, item.type,
                                        item.size, item.brand, item.model, item.type, tiresToGenerate,
                                        item.po_date, item.unit_price, item.supplier_id,
                                        tiresToGenerate, item.po_date, item.unit_price
                                    ], (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            reject(err);
                                        } else {
                                            db.run('COMMIT');
                                            resolve({
                                                itemId: itemId,
                                                generatedCount: generatedTires.length,
                                                tires: generatedTires
                                            });
                                        }
                                    });
                                }
                            });
                        });
                    }
                });
            });
        });
    }

    static async delete(itemId) {
        // Check if item can be deleted
        const checkSql = `
            SELECT poi.*, po.status as po_status
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.id = ?`;

        return new Promise((resolve, reject) => {
            db.get(checkSql, [itemId], (err, item) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!item) {
                    reject(new Error('Item not found'));
                    return;
                }

                // Check if any tires have been generated from this item
                const tireCheckSql = `SELECT COUNT(*) as tire_count FROM tires WHERE po_item_id = ?`;
                db.get(tireCheckSql, [itemId], (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    if (result.tire_count > 0) {
                        reject(new Error('Cannot delete item because tires have been generated from it'));
                        return;
                    }

                    // Check if any quantity has been received
                    if (item.received_quantity > 0) {
                        reject(new Error('Cannot delete item because some quantity has been received'));
                        return;
                    }

                    const poId = item.po_id;
                    const deleteSql = `DELETE FROM purchase_order_items WHERE id = ?`;

                    db.run(deleteSql, [itemId], async function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }

                        try {
                            await this.updatePoTotal(poId);
                            resolve(this.changes);
                        } catch (updateErr) {
                            reject(updateErr);
                        }
                    }.bind(this));
                });
            });
        });
    }
}

module.exports = PurchaseOrderItem;