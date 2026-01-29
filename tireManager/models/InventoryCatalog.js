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
            ], function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(this.lastID);
            });
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
            db.run(sql, values, function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                resolve(this.changes);
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
                   po.supplier_id,
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
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

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

                    const receiptSql = `
                        INSERT INTO po_receipts 
                        (po_id, po_item_id, receipt_date, quantity_received, batch_number, received_by)
                        SELECT po_id, ?, CURRENT_DATE, ?, ?, ?
                        FROM purchase_order_items 
                        WHERE id = ?`;

                    db.run(receiptSql, [itemId, quantity, batchNumber, receivedBy, itemId], function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            reject(err);
                            return;
                        }

                        const itemSql = `SELECT po_id, quantity, received_quantity FROM purchase_order_items WHERE id = ?`;
                        db.get(itemSql, [itemId], (err, item) => {
                            if (err) {
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            const poSql = `
                                SELECT 
                                    po.id,
                                    po.status as po_status,
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

    static async delete(itemId) {
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

                    if (item.received_quantity > 0) {
                        reject(new Error('Cannot delete item because some quantity has been received'));
                        return;
                    }

                    const poId = item.po_id;
                    const deleteSql = `DELETE FROM purchase_order_items WHERE id = ?`;

                    db.run(deleteSql, [itemId], function(err) {
                        if (err) {
                            reject(err);
                            return;
                        }

                        resolve(this.changes);
                    });
                });
            });
        });
    }
}

module.exports = PurchaseOrderItem;