const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');
const AuthMiddleware = require('../middleware/auth-middleware');
const db = require('../config/database');

// Initialize auth middleware
const auth = new AuthMiddleware(db);

// Apply authentication to all routes
router.use(auth.authenticate);

// Permission middleware
const checkPermission = (permissionCode, action = 'view') => {
    return auth.checkPermission(permissionCode, action);
};

// Create supplier
router.post('/',
    checkPermission('supplier.create', 'create'),
    async (req, res) => {
        try {
            const supplierId = await Supplier.create(req.body);
            const supplier = await Supplier.getSupplierWithLedger(supplierId);
            res.status(201).json(supplier);
        } catch (error) {
            console.error('Error creating supplier:', error);
            res.status(500).json({ error: 'Failed to create supplier' });
        }
    }
);

// Get all suppliers
router.get('/',
    checkPermission('supplier.view', 'view'),
    async (req, res) => {
        try {
            const { type } = req.query;
            const suppliers = await Supplier.getAllSuppliers(type);
            res.json(suppliers);
        } catch (error) {
            console.error('Error getting suppliers:', error);
            res.status(500).json({ error: 'Failed to get suppliers' });
        }
    }
);

// Get supplier details
router.get('/:id',
    checkPermission('supplier.view', 'view'),
    async (req, res) => {
        try {
            const supplier = await Supplier.getSupplierWithLedger(req.params.id);
            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }
            res.json(supplier);
        } catch (error) {
            console.error('Error getting supplier:', error);
            res.status(500).json({ error: 'Failed to get supplier' });
        }
    }
);

// Add payment to supplier
router.post('/:id/payment',
    checkPermission('supplier.ledger', 'create'),
    async (req, res) => {
        try {
            const { date, amount, description, reference_number, created_by } = req.body;
            
            await Supplier.addLedgerEntry({
                supplier_id: req.params.id,
                date,
                description: description || `Payment to supplier`,
                transaction_type: 'PAYMENT',
                amount,
                reference_number,
                created_by
            });

            const supplier = await Supplier.getSupplierWithLedger(req.params.id);
            res.json(supplier);
        } catch (error) {
            console.error('Error adding payment:', error);
            res.status(500).json({ error: 'Failed to add payment' });
        }
    }
);

// Get supplier balance
router.get('/:id/balance',
    checkPermission('supplier.view', 'view'),
    async (req, res) => {
        try {
            const balance = await Supplier.getSupplierBalance(req.params.id);
            res.json(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
            res.status(500).json({ error: 'Failed to get balance' });
        }
    }
);

// Update supplier details
router.put('/:id',
    checkPermission('supplier.edit', 'edit'),
    async (req, res) => {
        try {
            const supplierId = req.params.id;
            const updateData = req.body;
            
            // Check if supplier exists
            const existingSupplier = await Supplier.getSupplierWithLedger(supplierId);
            if (!existingSupplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }
            
            // Update supplier
            await Supplier.update(supplierId, updateData);
            
            // Return updated supplier
            const updatedSupplier = await Supplier.getSupplierWithLedger(supplierId);
            res.json(updatedSupplier);
        } catch (error) {
            console.error('Error updating supplier:', error);
            res.status(500).json({ error: 'Failed to update supplier' });
        }
    }
);

// Delete supplier (soft delete or archive)
router.delete('/:id',
    checkPermission('supplier.delete', 'delete'),
    async (req, res) => {
        try {
            const supplierId = req.params.id;
            
            // Check if supplier exists
            const existingSupplier = await Supplier.getSupplierWithLedger(supplierId);
            if (!existingSupplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }
            
            // Check if supplier has any outstanding balance
            const balance = await Supplier.getSupplierBalance(supplierId);
            if (balance && balance.balance !== 0) {
                return res.status(400).json({ 
                    error: 'Cannot delete supplier with outstanding balance',
                    balance: balance.balance 
                });
            }
            
            // Delete supplier (or soft delete by updating status)
            await Supplier.delete(supplierId);
            
            res.json({ message: 'Supplier deleted successfully' });
        } catch (error) {
            console.error('Error deleting supplier:', error);
            res.status(500).json({ error: 'Failed to delete supplier' });
        }
    }
);

// Get supplier ledger entries
router.get('/:id/ledger',
    checkPermission('supplier.ledger', 'view'),
    async (req, res) => {
        try {
            const supplierId = req.params.id;
            const { startDate, endDate, limit = 100 } = req.query;
            
            // Check if supplier exists
            const supplier = await Supplier.getSupplierWithLedger(supplierId);
            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found' });
            }
            
            // Get ledger entries with optional date filtering
            const ledgerEntries = await Supplier.getLedgerEntries(supplierId, {
                startDate,
                endDate,
                limit: parseInt(limit)
            });
            
            res.json({
                supplier: {
                    id: supplier.id,
                    name: supplier.name,
                    code: supplier.supplier_code,
                    type: supplier.supplier_type
                },
                ledger_entries: ledgerEntries
            });
        } catch (error) {
            console.error('Error getting supplier ledger:', error);
            res.status(500).json({ error: 'Failed to get supplier ledger' });
        }
    }
);

// Add credit note to supplier
router.post('/:id/credit',
    checkPermission('supplier.ledger', 'create'),
    async (req, res) => {
        try {
            const { date, amount, description, reference_number, created_by } = req.body;
            
            await Supplier.addLedgerEntry({
                supplier_id: req.params.id,
                date,
                description: description || `Credit note`,
                transaction_type: 'CREDIT',
                amount,
                reference_number,
                created_by
            });

            const supplier = await Supplier.getSupplierWithLedger(req.params.id);
            res.json(supplier);
        } catch (error) {
            console.error('Error adding credit note:', error);
            res.status(500).json({ error: 'Failed to add credit note' });
        }
    }
);

// Add debit note to supplier
router.post('/:id/debit',
    checkPermission('supplier.ledger', 'create'),
    async (req, res) => {
        try {
            const { date, amount, description, reference_number, created_by } = req.body;
            
            await Supplier.addLedgerEntry({
                supplier_id: req.params.id,
                date,
                description: description || `Debit note`,
                transaction_type: 'DEBIT',
                amount,
                reference_number,
                created_by
            });

            const supplier = await Supplier.getSupplierWithLedger(req.params.id);
            res.json(supplier);
        } catch (error) {
            console.error('Error adding debit note:', error);
            res.status(500).json({ error: 'Failed to add debit note' });
        }
    }
);

// Bulk import suppliers
router.post('/bulk-import',
    checkPermission('supplier.create', 'create'),
    async (req, res) => {
        try {
            const { suppliers } = req.body;
            
            if (!Array.isArray(suppliers) || suppliers.length === 0) {
                return res.status(400).json({ error: 'Invalid suppliers data' });
            }
            
            const results = {
                successful: [],
                failed: []
            };
            
            for (const supplierData of suppliers) {
                try {
                    const supplierId = await Supplier.create(supplierData);
                    results.successful.push({
                        id: supplierId,
                        name: supplierData.name,
                        code: supplierData.supplier_code
                    });
                } catch (err) {
                    results.failed.push({
                        data: supplierData,
                        error: err.message
                    });
                }
            }
            
            res.status(201).json({
                message: `Successfully imported ${results.successful.length} suppliers`,
                results
            });
        } catch (error) {
            console.error('Error bulk importing suppliers:', error);
            res.status(500).json({ error: 'Failed to bulk import suppliers' });
        }
    }
);

// Export suppliers
router.get('/export/all',
    checkPermission('reports.generate', 'view'),
    async (req, res) => {
        try {
            const { type, format = 'json' } = req.query;
            const suppliers = await Supplier.getAllSuppliers(type);
            
            if (format === 'csv') {
                // Convert to CSV format
                const csvData = convertToCSV(suppliers);
                res.header('Content-Type', 'text/csv');
                res.attachment('suppliers.csv');
                return res.send(csvData);
            }
            
            res.json(suppliers);
        } catch (error) {
            console.error('Error exporting suppliers:', error);
            res.status(500).json({ error: 'Failed to export suppliers' });
        }
    }
);

// Helper function to convert suppliers to CSV
function convertToCSV(suppliers) {
    if (!suppliers || suppliers.length === 0) return '';
    
    const headers = ['id', 'supplier_code', 'name', 'supplier_type', 'contact_person', 
                    'email', 'phone', 'address', 'payment_terms', 'credit_limit', 
                    'current_balance', 'status', 'created_at'];
    
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const supplier of suppliers) {
        const values = headers.map(header => {
            const value = supplier[header] || '';
            // Escape commas and quotes
            return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
}

module.exports = router;