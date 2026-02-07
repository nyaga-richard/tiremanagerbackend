const db = require('../config/database');

class Supplier {
    static async create(supplierData) {
        let {
            name,
            type,
            contact_person,
            phone,
            email,
            address
        } = supplierData;

        // Normalize frontend → DB values
        const typeMap = {
            TIRE_SUPPLIER: 'TIRE',
            RETREAD_SUPPLIER: 'RETREAD',
            SERVICE_PROVIDER: 'SERVICE_PROVIDER',
            OTHER: 'OTHER'
        };

        type = typeMap[type];

        if (!type) {
            throw new Error(`Invalid supplier type: ${supplierData.type}`);
        }

        const sql = `
            INSERT INTO suppliers
            (name, type, contact_person, phone, email, address)
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            db.run(
                sql,
                [name, type, contact_person, phone, email, address],
                function (err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    static async addLedgerEntry(entryData) {
        const {
            supplier_id,
            date,
            description,
            transaction_type,
            amount,
            reference_number = null,
            created_by
        } = entryData;

        const sql = `INSERT INTO supplier_ledger 
                    (supplier_id, date, description, transaction_type, 
                     amount, reference_number, created_by) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                supplier_id,
                date,
                description,
                transaction_type,
                amount,
                reference_number,
                created_by
            ], async function(err) {
                if (err) {
                    reject(err);
                    return;
                }

                // Update supplier balance
                await Supplier.updateSupplierBalance(supplier_id);
                resolve(this.lastID);
            });
        });
    }

    static async updateSupplierBalance(supplierId) {
        const sql = `
            UPDATE suppliers 
            SET balance = (
                SELECT SUM(
                    CASE 
                        WHEN transaction_type = 'PURCHASE' THEN amount
                        WHEN transaction_type = 'RETREAD_SERVICE' THEN amount
                        WHEN transaction_type = 'PAYMENT' THEN -amount
                        ELSE 0
                    END
                ) 
                FROM supplier_ledger 
                WHERE supplier_id = ?
            )
            WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.run(sql, [supplierId, supplierId], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    static async getSupplierWithLedger(supplierId) {
        const supplierSql = `SELECT * FROM suppliers WHERE id = ?`;
        const ledgerSql = `SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY date DESC, id DESC`;

        return new Promise((resolve, reject) => {
            db.get(supplierSql, [supplierId], (err, supplier) => {
                if (err) {
                    reject(err);
                    return;
                }

                db.all(ledgerSql, [supplierId], (err, ledger) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    supplier.ledger = ledger;
                    resolve(supplier);
                });
            });
        });
    }

    static async getAllSuppliers(type = null) {
        const sql = type 
            ? `SELECT * FROM suppliers WHERE type = ? ORDER BY name`
            : `SELECT * FROM suppliers ORDER BY name`;

        return new Promise((resolve, reject) => {
            db.all(sql, type ? [type] : [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async addLedgerEntry(ledgerData) {
        const {
            supplier_id,
            date,
            description,
            transaction_type,
            amount,
            reference_number,
            po_id,
            grn_id,
            accounting_transaction_id,
            created_by
        } = ledgerData;

        const sql = `
            INSERT INTO supplier_ledger (
                supplier_id, date, description,
                transaction_type, amount, reference_number,
                po_id, grn_id, accounting_transaction_id, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

        return new Promise((resolve, reject) => {
            db.run(sql, [
                supplier_id,
                date,
                description,
                transaction_type,
                amount,
                reference_number,
                po_id,
                grn_id,
                accounting_transaction_id,
                created_by
            ], function(err) {
                if (err) reject(err);
                else {
                    // Update supplier balance
                    const updateSql = `
                        UPDATE suppliers 
                        SET balance = CASE 
                            WHEN ? IN ('PURCHASE', 'RETREAD_SERVICE') THEN balance + ?
                            WHEN ? = 'PAYMENT' THEN balance - ?
                            ELSE balance
                        END
                        WHERE id = ?`;

                    db.run(updateSql, [
                        transaction_type,
                        amount,
                        transaction_type,
                        amount,
                        supplier_id
                    ], function(err) {
                        if (err) reject(err);
                        else resolve(this.lastID);
                    });
                }
            });
        });
    }

    static async getBalance(supplierId) {
        const sql = `
            SELECT balance FROM suppliers WHERE id = ?`;

        return new Promise((resolve, reject) => {
            db.get(sql, [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.balance : 0);
            });
        });
    }

    static async getLedger(supplierId, startDate, endDate) {
        let sql = `
            SELECT sl.*, 
                   at.transaction_number,
                   grn.grn_number,
                   po.po_number
            FROM supplier_ledger sl
            LEFT JOIN accounting_transactions at ON sl.accounting_transaction_id = at.id
            LEFT JOIN goods_received_notes grn ON sl.grn_id = grn.id
            LEFT JOIN purchase_orders po ON sl.po_id = po.id
            WHERE sl.supplier_id = ?`;
        
        const params = [supplierId];
        
        if (startDate) {
            sql += ' AND sl.date >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            sql += ' AND sl.date <= ?';
            params.push(endDate);
        }
        
        sql += ' ORDER BY sl.date DESC, sl.id DESC';
        
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    static async getSupplierBalance(supplierId) {
        const sql = `
            SELECT 
                s.name,
                s.type,
                COALESCE(SUM(
                    CASE 
                        WHEN sl.transaction_type IN ('PURCHASE', 'RETREAD_SERVICE') THEN sl.amount
                        WHEN sl.transaction_type = 'PAYMENT' THEN -sl.amount
                        ELSE 0
                    END
                ), 0) as balance
            FROM suppliers s
            LEFT JOIN supplier_ledger sl ON s.id = sl.supplier_id
            WHERE s.id = ?
            GROUP BY s.id`;

        return new Promise((resolve, reject) => {
            db.get(sql, [supplierId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = Supplier;