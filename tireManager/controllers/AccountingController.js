// controllers/AccountingController.js
const AccountingTransaction = require('../models/AccountingTransaction');
const Supplier = require('../models/Supplier');
const GoodsReceivedNote = require('../models/GoodsReceivedNote');

class AccountingController {
    async createTransaction(req, res) {
        try {
            console.log('Creating accounting transaction:', JSON.stringify(req.body, null, 2));
            
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
                supplier_name,
                grn_id,
                po_id,
                notes,
                journal_entries,
                metadata
            } = req.body;

            // Get user ID from authenticated user
            const created_by = req.user ? req.user.id : 1; // Default to admin if no auth

            // Validate required fields
            if (!transaction_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction type is required'
                });
            }

            // Validate journal entries balance
            const isValid = await AccountingTransaction.validateJournalEntries(journal_entries);
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Journal entries are not balanced. Total debits must equal total credits.'
                });
            }

            // Generate transaction number if not provided
            let finalTransactionNumber = transaction_number;
            if (!finalTransactionNumber) {
                let prefix = 'JRN';
                if (transaction_type === 'PURCHASE_INVOICE') prefix = 'INV';
                if (transaction_type === 'PAYMENT') prefix = 'PAY';
                if (transaction_type === 'CREDIT_NOTE') prefix = 'CN';
                
                finalTransactionNumber = await AccountingTransaction.generateTransactionNumber(prefix);
            }

            // Create transaction data
            const transactionData = {
                transaction_date: transaction_date || new Date().toISOString().split('T')[0],
                posting_date: posting_date || new Date().toISOString().split('T')[0],
                transaction_number: finalTransactionNumber,
                reference_number: reference_number || `GRN-${grn_id}`,
                description: description || `Invoice for GRN ${reference_number}`,
                transaction_type: transaction_type,
                total_amount: total_amount,
                currency: currency || 'USD',
                status: status || 'POSTED',
                supplier_id: supplier_id,
                related_grn_id: grn_id,
                related_po_id: po_id,
                created_by: created_by,
                notes: notes || '',
                journal_entries: journal_entries
            };

            console.log('Transaction data prepared:', transactionData);

            // Create the accounting transaction
            const result = await AccountingTransaction.create(transactionData);

            // If it's a supplier invoice, also create a ledger entry
            if (transaction_type === 'PURCHASE_INVOICE' && supplier_id) {
                await Supplier.addLedgerEntry({
                    supplier_id,
                    date: transactionData.posting_date,
                    description: transactionData.description,
                    transaction_type: 'PURCHASE',
                    amount: total_amount,
                    reference_number: finalTransactionNumber,
                    po_id: po_id,
                    grn_id: grn_id,
                    accounting_transaction_id: result.transactionId,
                    created_by: created_by.toString()
                });
            }

            // Update GRN with invoice number
            if (grn_id && finalTransactionNumber) {
                await GoodsReceivedNote.updateInvoiceNumber(grn_id, finalTransactionNumber);
            }

            res.status(201).json({
                success: true,
                message: 'Accounting transaction created successfully',
                data: {
                    transaction_id: result.transactionId,
                    transaction_number: finalTransactionNumber,
                    total_amount: total_amount,
                    supplier_id: supplier_id
                }
            });

        } catch (error) {
            console.error('Error creating accounting transaction:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create accounting transaction',
                error: error.message,
                details: error.stack
            });
        }
    }

    async getSupplierBalance(req, res) {
        try {
            const { supplierId } = req.params;
            
            const balance = await Supplier.getBalance(supplierId);
            
            res.json({
                success: true,
                data: {
                    supplier_id: supplierId,
                    balance: balance,
                    balance_formatted: new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD'
                    }).format(balance)
                }
            });
        } catch (error) {
            console.error('Error getting supplier balance:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get supplier balance',
                error: error.message
            });
        }
    }

    async getSupplierLedger(req, res) {
        try {
            const { supplierId } = req.params;
            const { start_date, end_date } = req.query;
            
            const ledger = await Supplier.getLedger(supplierId, start_date, end_date);
            
            // Calculate running balance
            let runningBalance = 0;
            const ledgerWithBalance = ledger.map(entry => {
                if (entry.transaction_type === 'PURCHASE' || entry.transaction_type === 'RETREAD_SERVICE') {
                    runningBalance += entry.amount;
                } else if (entry.transaction_type === 'PAYMENT') {
                    runningBalance -= entry.amount;
                }
                
                return {
                    ...entry,
                    running_balance: runningBalance
                };
            });
            
            res.json({
                success: true,
                data: ledgerWithBalance,
                current_balance: runningBalance
            });
        } catch (error) {
            console.error('Error getting supplier ledger:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get supplier ledger',
                error: error.message
            });
        }
    }

    async getTransactionByGrn(req, res) {
        try {
            const { grnId } = req.params;
            
            const transactions = await AccountingTransaction.findByGrnId(grnId);
            
            // Get journal entries for each transaction
            const transactionsWithDetails = await Promise.all(
                transactions.map(async (transaction) => {
                    const journalEntries = await AccountingTransaction.getJournalEntries(transaction.id);
                    return {
                        ...transaction,
                        journal_entries: journalEntries
                    };
                })
            );
            
            res.json({
                success: true,
                data: transactionsWithDetails
            });
        } catch (error) {
            console.error('Error getting transactions by GRN:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get transactions',
                error: error.message
            });
        }
    }
}

module.exports = new AccountingController();