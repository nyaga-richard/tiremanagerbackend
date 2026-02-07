// routes/accounting.js
const express = require('express');
const router = express.Router();
const accountingController = require('../controllers/AccountingController');
//const authMiddleware = require('../middleware/auth');

// Protect all accounting routes
//router.use(authMiddleware);

// Accounting transaction routes
router.post('/transactions', accountingController.createTransaction);
router.get('/transactions/grn/:grnId', accountingController.getTransactionByGrn);

// Supplier financial routes
router.get('/suppliers/:supplierId/balance', accountingController.getSupplierBalance);
router.get('/suppliers/:supplierId/ledger', accountingController.getSupplierLedger);

module.exports = router;