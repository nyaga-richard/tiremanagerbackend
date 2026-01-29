const db = require('../config/database');

class PurchaseOrder {
    static async create(poData) {
        const {
            po_number,
            supplier_id,
            po_date,
            expected_delivery_date = null,
            status = 'DRAFT',
            total_amount = 0,
            tax_amount = 0,
            shipping_amount = 0,
            final_amount = 0,
            notes = null,
            terms = null,
            shipping_address = null,
            billing_address = null,
            created_by
        } = poData;

        const sql = `INSERT INTO purchase_orders 
                    (po_number, supplier_id, po_date, expected_delivery_date, status,
                     total_amount, tax_amount, shipping_amount, final_amount,
                     notes, terms, shipping_address, billing_address, created_by)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                po_number,
                supplier_id,
                po_date,
                expected_delivery_date,
                status,
                total_amount,
                tax_amount,
                shipping_amount,
                final_amount,
                notes,
                terms,
                shipping_address,
                billing_address,
                created_by
            ], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    static async update(poId, updateData) {
        const {
            expected_delivery_date,
            status,
            total_amount,
            tax_amount,
            shipping_amount,
            final_amount,
            notes,
            terms,
            shipping_address,
            billing_address,
            delivery_date,
            approved_by,
            approved_date
        } = updateData;

        // Build dynamic update query
        const updates = [];
        const values = [];

        if (expected_delivery_date !== undefined) {
            updates.push('expected_delivery_date = ?');
            values.push(expected_delivery_date);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            values.push(status);
        }
        if (total_amount !== undefined) {
            updates.push('total_amount = ?');
            values.push(total_amount);
        }
        if (tax_amount !== undefined) {
            updates.push('tax_amount = ?');
            values.push(tax_amount);
        }
        if (shipping_amount !== undefined) {
            updates.push('shipping_amount = ?');
            values.push(shipping_amount);
        }
        if (final_amount !== undefined) {
            updates.push('final_amount = ?');
            values.push(final_amount);
        }
        if (notes !== undefined) {
            updates.push('notes = ?');
            values.push(notes);
        }
        if (terms !== undefined) {
            updates.push('terms = ?');
            values.push(terms);
        }
        if (shipping_address !== undefined) {
            updates.push('shipping_address = ?');
            values.push(shipping_address);
        }
        if (billing_address !== undefined) {
            updates.push('billing_address = ?');
            values.push(billing_address);
        }
        if (delivery_date !== undefined) {
            updates.push('delivery_date = ?');
            values.push(delivery_date);
        }
        if (approved_by !== undefined) {
            updates.push('approved_by = ?');
            values.push(approved_by);
        }
        if (approved_date !== undefined) {
            updates.push('approved_date = ?');
            values.push(approved_date);
        }

        // Always update the updated_at timestamp
        updates.push('updated_at = CURRENT_TIMESTAMP');

        if (updates.length === 0) {
            return Promise.resolve(0);
        }

        values.push(poId);
        const sql = `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, values, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async findById(poId) {
        const sql = `
            SELECT po.*, 
                   s.name as supplier_name,
                   s.contact_person as supplier_contact,
                   s.phone as supplier_phone,
                   s.email as supplier_email,
                   s.address as supplier_address,
                   u1.full_name as created_by_name,
                   u2.full_name as approved_by_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            LEFT JOIN users u1 ON po.created_by = u1.id
            LEFT JOIN users u2 ON po.approved_by = u2.id
            WHERE po.id = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [poId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findByPoNumber(poNumber) {
        const sql = `
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.po_number = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [poNumber], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async findAll(filters = {}, page = 1, limit = 20) {
        let conditions = [];
        let values = [];
        let offset = (page - 1) * limit;

        // Build filter conditions
        if (filters.supplier_id) {
            conditions.push('po.supplier_id = ?');
            values.push(filters.supplier_id);
        }
        if (filters.status) {
            conditions.push('po.status = ?');
            values.push(filters.status);
        }
        if (filters.start_date) {
            conditions.push('po.po_date >= ?');
            values.push(filters.start_date);
        }
        if (filters.end_date) {
            conditions.push('po.po_date <= ?');
            values.push(filters.end_date);
        }
        if (filters.po_number) {
            conditions.push('po.po_number LIKE ?');
            values.push(`%${filters.po_number}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        // Count total records for pagination
        const countSql = `SELECT COUNT(*) as total FROM purchase_orders po ${whereClause}`;
        const dataSql = `
            SELECT po.*, 
                   s.name as supplier_name,
                   s.type as supplier_type,
                   (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = po.id) as item_count,
                   (SELECT SUM(received_quantity) FROM purchase_order_items WHERE po_id = po.id) as total_received
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY po.po_date DESC, po.created_at DESC
            LIMIT ? OFFSET ?`;

        return new Promise((resolve, reject) => {
            // Get total count
            db.get(countSql, values, (err, countResult) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Get data
                const queryValues = [...values, limit, offset];
                db.all(dataSql, queryValues, (err, rows) => {
                    if (err) reject(err);
                    else {
                        resolve({
                            data: rows,
                            total: countResult.total,
                            page: page,
                            limit: limit,
                            totalPages: Math.ceil(countResult.total / limit)
                        });
                    }
                });
            });
        });
    }

    static async getItems(poId) {
        const sql = `
            SELECT poi.*,
                   (SELECT COUNT(*) FROM tires WHERE po_item_id = poi.id) as tires_generated
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

    static async getStats(supplierId = null, startDate = null, endDate = null) {
        let conditions = [];
        let values = [];

        if (supplierId) {
            conditions.push('supplier_id = ?');
            values.push(supplierId);
        }
        if (startDate) {
            conditions.push('po_date >= ?');
            values.push(startDate);
        }
        if (endDate) {
            conditions.push('po_date <= ?');
            values.push(endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const sql = `
            SELECT 
                COUNT(*) as total_orders,
                SUM(final_amount) as total_amount,
                AVG(final_amount) as avg_order_value,
                COUNT(CASE WHEN status = 'FULLY_RECEIVED' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN status IN ('DRAFT', 'PENDING_APPROVAL') THEN 1 END) as pending_orders,
                COUNT(CASE WHEN status = 'CANCELLED' THEN 1 END) as cancelled_orders,
                MIN(po_date) as first_order_date,
                MAX(po_date) as last_order_date
            FROM purchase_orders
            ${whereClause}`;

        return new Promise((resolve, reject) => {
            db.get(sql, values, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    static async updateStatus(poId, status, approvedBy = null) {
        const updates = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const values = [status];

        if (status === 'APPROVED' && approvedBy) {
            updates.push('approved_by = ?', 'approved_date = CURRENT_TIMESTAMP');
            values.push(approvedBy);
        }

        values.push(poId);
        const sql = `UPDATE purchase_orders SET ${updates.join(', ')} WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, values, function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async delete(poId) {
        // Check if PO can be deleted (only DRAFT or CANCELLED orders)
        const checkSql = `SELECT status FROM purchase_orders WHERE id = ?`;
        
        return new Promise((resolve, reject) => {
            db.get(checkSql, [poId], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (!row) {
                    reject(new Error('Purchase order not found'));
                    return;
                }

                if (!['DRAFT', 'CANCELLED'].includes(row.status)) {
                    reject(new Error('Only DRAFT or CANCELLED orders can be deleted'));
                    return;
                }

                const deleteSql = `DELETE FROM purchase_orders WHERE id = ?`;
                db.run(deleteSql, [poId], function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
            });
        });
    }

    static async generatePoNumber() {
        const year = new Date().getFullYear();
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        
        // Get the last PO number for this year/month
        const sql = `SELECT po_number FROM purchase_orders 
                    WHERE po_number LIKE 'PO-${year}${month}-%' 
                    ORDER BY po_number DESC LIMIT 1`;

        return new Promise((resolve, reject) => {
            db.get(sql, [], (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                let sequence = 1;
                if (row) {
                    const lastNumber = parseInt(row.po_number.split('-')[2]);
                    sequence = lastNumber + 1;
                }

                const poNumber = `PO-${year}${month}-${sequence.toString().padStart(4, '0')}`;
                resolve(poNumber);
            });
        });
    }
}

module.exports = PurchaseOrder;