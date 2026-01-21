const express = require('express');
const router = express.Router();
const Supplier = require('../models/Supplier');

// Create supplier
router.post('/', async (req, res) => {
    try {
        const supplierId = await Supplier.create(req.body);
        const supplier = await Supplier.getSupplierWithLedger(supplierId);
        res.status(201).json(supplier);
    } catch (error) {
        console.error('Error creating supplier:', error);
        res.status(500).json({ error: 'Failed to create supplier' });
    }
});

// Get all suppliers
router.get('/', async (req, res) => {
    try {
        const { type } = req.query;
        const suppliers = await Supplier.getAllSuppliers(type);
        res.json(suppliers);
    } catch (error) {
        console.error('Error getting suppliers:', error);
        res.status(500).json({ error: 'Failed to get suppliers' });
    }
});

// Get supplier details
router.get('/:id', async (req, res) => {
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
});

// Add payment to supplier
router.post('/:id/payment', async (req, res) => {
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
});

// Get supplier balance
router.get('/:id/balance', async (req, res) => {
    try {
        const balance = await Supplier.getSupplierBalance(req.params.id);
        res.json(balance);
    } catch (error) {
        console.error('Error getting balance:', error);
        res.status(500).json({ error: 'Failed to get balance' });
    }
});

module.exports = router;