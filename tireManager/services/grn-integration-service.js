const { runQuery, getQuery, allQuery } = require('../config/database');

class GRNIntegrationService {
    // Create GRN from Retread Receiving Note
    async createGRNFromRRN(rrnId, userId) {
        try {
            await runQuery('BEGIN TRANSACTION');
            
            // Get RRN details
            const rrn = await getQuery(
                `SELECT rrn.*, ro.supplier_id, ro.order_number
                 FROM retread_receiving_notes rrn
                 JOIN retread_orders ro ON rrn.retread_order_id = ro.id
                 WHERE rrn.id = ?`,
                [rrnId]
            );
            
            if (!rrn) {
                throw new Error('RRN not found');
            }
            
            // Check if GRN already exists
            const existingLink = await getQuery(
                `SELECT grn_id FROM retread_grn_links WHERE rrn_id = ?`,
                [rrnId]
            );
            
            if (existingLink) {
                throw new Error('GRN already exists for this RRN');
            }
            
            // Generate GRN number
            const grnNumber = await this.generateGRNNumber();
            
            // Create GRN
            const grnResult = await runQuery(
                `INSERT INTO goods_received_notes 
                (grn_number, po_id, receipt_date, received_by, supplier_invoice_number, 
                 delivery_note_number, vehicle_number, driver_name, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
                [
                    grnNumber,
                    0, // No PO for retreads, we'll use a special PO or make po_id nullable
                    rrn.receipt_date,
                    userId,
                    rrn.supplier_invoice_number,
                    rrn.delivery_note_number,
                    rrn.vehicle_number,
                    rrn.driver_name,
                    `Retread Order: ${rrn.order_number}`
                ]
            );
            
            const grnId = grnResult.lastID;
            
            // Get RRN items
            const rrnItems = await allQuery(
                `SELECT rri.*, roi.size, roi.brand, roi.model
                 FROM retread_receiving_items rri
                 JOIN retread_order_items roi ON rri.retread_order_item_id = roi.id
                 WHERE rri.rrn_id = ?`,
                [rrnId]
            );
            
            // Create GRN items
            for (const item of rrnItems) {
                await runQuery(
                    `INSERT INTO grn_items 
                    (grn_id, po_item_id, quantity_received, unit_cost, batch_number, serial_numbers, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        grnId,
                        0, // No PO item
                        1, // Quantity
                        item.retread_cost,
                        null, // batch number
                        JSON.stringify([item.new_serial_number]),
                        item.notes
                    ]
                );
            }
            
            // Create accounting transaction
            const transactionId = await this.createAccountingTransaction(rrn, rrnItems, userId, grnId);
            
            // Link RRN to GRN
            await runQuery(
                `INSERT INTO retread_grn_links (rrn_id, grn_id) VALUES (?, ?)`,
                [rrnId, grnId]
            );
            
            // Update RRN status
            await runQuery(
                `UPDATE retread_receiving_notes SET status = 'COMPLETED' WHERE id = ?`,
                [rrnId]
            );
            
            await runQuery('COMMIT');
            
            return {
                success: true,
                grnId,
                grnNumber,
                transactionId
            };
            
        } catch (error) {
            await runQuery('ROLLBACK');
            throw error;
        }
    }

    // Generate GRN number
    async generateGRNNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM goods_received_notes 
             WHERE grn_number LIKE ?`,
            [`GRN${year}${month}%`]
        );
        
        const sequence = String(result.count + 1).padStart(4, '0');
        return `GRN${year}${month}${sequence}`;
    }

    // Create accounting transaction for retread receipt
    async createAccountingTransaction(rrn, items, userId, grnId) {
        // Calculate total cost
        const totalCost = items.reduce((sum, item) => sum + item.retread_cost, 0);
        
        // Generate transaction number
        const transactionNumber = await this.generateTransactionNumber();
        
        // Create accounting transaction
        const transactionResult = await runQuery(
            `INSERT INTO accounting_transactions 
            (transaction_date, posting_date, transaction_number, description, transaction_type, 
             total_amount, status, supplier_id, related_grn_id, created_by)
            VALUES (?, ?, ?, ?, 'PURCHASE_INVOICE', ?, 'POSTED', ?, ?, ?)`,
            [
                rrn.receipt_date,
                rrn.receipt_date,
                transactionNumber,
                `Retread services - Order ${rrn.order_number}`,
                totalCost,
                rrn.supplier_id,
                grnId,
                userId
            ]
        );
        
        const transactionId = transactionResult.lastID;
        
        // Create journal entries (double-entry accounting)
        // Debit: Inventory (Asset)
        await runQuery(
            `INSERT INTO journal_entries 
            (transaction_id, account_code, account_name, debit, credit, description)
            VALUES (?, '1200', 'Inventory', ?, 0, 'Retreaded tires received')`,
            [transactionId, totalCost]
        );
        
        // Credit: Accounts Payable (Liability)
        await runQuery(
            `INSERT INTO journal_entries 
            (transaction_id, account_code, account_name, debit, credit, description)
            VALUES (?, '2000', 'Accounts Payable', 0, ?, 'Retread services payable')`,
            [transactionId, totalCost]
        );
        
        // Update supplier ledger
        await runQuery(
            `INSERT INTO supplier_ledger 
            (supplier_id, date, description, transaction_type, amount, reference_number, 
             accounting_transaction_id, grn_id)
            VALUES (?, ?, ?, 'RETREAD_SERVICE', ?, ?, ?, ?)`,
            [
                rrn.supplier_id,
                rrn.receipt_date,
                `Retread services - Order ${rrn.order_number}`,
                totalCost,
                transactionNumber,
                transactionId,
                grnId
            ]
        );
        
        // Update supplier balance
        await runQuery(
            `UPDATE suppliers SET balance = balance + ? WHERE id = ?`,
            [totalCost, rrn.supplier_id]
        );
        
        return transactionId;
    }

    // Generate transaction number
    async generateTransactionNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM accounting_transactions 
             WHERE transaction_number LIKE ?`,
            [`ACC${year}${month}%`]
        );
        
        const sequence = String(result.count + 1).padStart(4, '0');
        return `ACC${year}${month}${sequence}`;
    }

    // Get GRNs created from retread receipts
    async getRetreadGRNs() {
        return await allQuery(
            `SELECT g.*, rgl.rrn_id, rrn.rrn_number, ro.order_number, s.name as supplier_name
             FROM goods_received_notes g
             JOIN retread_grn_links rgl ON g.id = rgl.grn_id
             JOIN retread_receiving_notes rrn ON rgl.rrn_id = rrn.id
             JOIN retread_orders ro ON rrn.retread_order_id = ro.id
             LEFT JOIN suppliers s ON ro.supplier_id = s.id
             ORDER BY g.created_at DESC`
        );
    }
}

module.exports = new GRNIntegrationService();