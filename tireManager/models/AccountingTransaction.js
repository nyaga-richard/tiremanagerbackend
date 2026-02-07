// models/AccountingTransaction.js
const db = require('../config/database');

class AccountingTransaction {
    static async create(transactionData) {
        const {
            transaction_date,
            posting_date,
            transaction_number,
            reference_number,
            description,
            transaction_type,
            total_amount,
            currency,
            status,
            supplier_id,
            related_grn_id,
            related_po_id,
            created_by,
            notes,
            journal_entries
        } = transactionData;

        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                // 1. Create the accounting transaction
                const transactionSql = `
                    INSERT INTO accounting_transactions (
                        transaction_date, posting_date, transaction_number,
                        reference_number, description, transaction_type,
                        total_amount, currency, status, supplier_id,
                        related_grn_id, related_po_id, created_by, notes,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;

                console.log('Executing SQL with values:', {
                    transaction_date,
                    posting_date,
                    transaction_number,
                    reference_number,
                    description,
                    transaction_type,
                    total_amount,
                    currency,
                    status,
                    supplier_id,
                    related_grn_id,
                    related_po_id,
                    created_by,
                    notes
                });

                db.run(transactionSql, [
                    transaction_date,
                    posting_date,
                    transaction_number,
                    reference_number,
                    description,
                    transaction_type,
                    total_amount,
                    currency || 'USD',
                    status || 'DRAFT',
                    supplier_id,
                    related_grn_id,
                    related_po_id,
                    created_by,
                    notes || ''
                ], function(err) {
                    if (err) {
                        console.error('Error creating accounting transaction:', err);
                        db.run('ROLLBACK');
                        reject(err);
                        return;
                    }

                    const transactionId = this.lastID;
                    console.log(`Transaction created with ID: ${transactionId}`);

                    // 2. Create journal entries
                    const processNextEntry = (index) => {
                        if (index >= journal_entries.length) {
                            // All entries processed
                            db.run('COMMIT', (err) => {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    db.run('ROLLBACK');
                                    reject(err);
                                } else {
                                    console.log('Transaction committed successfully');
                                    resolve({
                                        transactionId: transactionId,
                                        transactionNumber: transaction_number
                                    });
                                }
                            });
                            return;
                        }

                        const entry = journal_entries[index];
                        const entrySql = `
                            INSERT INTO journal_entries (
                                transaction_id, account_code, account_name,
                                debit, credit, description, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`;

                        db.run(entrySql, [
                            transactionId,
                            entry.account_code,
                            entry.account_name,
                            entry.debit || 0,
                            entry.credit || 0,
                            entry.description || ''
                        ], function(err) {
                            if (err) {
                                console.error(`Error creating journal entry ${index}:`, err);
                                db.run('ROLLBACK');
                                reject(err);
                                return;
                            }

                            console.log(`Journal entry ${index + 1} created`);
                            processNextEntry(index + 1);
                        });
                    };

                    // Start processing journal entries
                    processNextEntry(0);
                });
            });
        });
    }

    static async generateTransactionNumber(prefix = 'INV') {
        const year = new Date().getFullYear().toString().slice(-2);
        const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
        
        const sql = `
            SELECT COUNT(*) as count 
            FROM accounting_transactions 
            WHERE transaction_number LIKE '${prefix}-${year}${month}%'`;
        
        return new Promise((resolve, reject) => {
            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const sequence = (row.count + 1).toString().padStart(4, '0');
                    resolve(`${prefix}-${year}${month}-${sequence}`);
                }
            });
        });
    }

    static async validateJournalEntries(journal_entries) {
        const totalDebits = journal_entries.reduce((sum, entry) => sum + (entry.debit || 0), 0);
        const totalCredits = journal_entries.reduce((sum, entry) => sum + (entry.credit || 0), 0);
        
        return Math.abs(totalDebits - totalCredits) < 0.01; // Allow small rounding differences
    }

    static async findByGrnId(grnId) {
        const sql = `
            SELECT * FROM accounting_transactions 
            WHERE related_grn_id = ? 
            ORDER BY transaction_date DESC`;

        return new Promise((resolve, reject) => {
            db.all(sql, [grnId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = AccountingTransaction;