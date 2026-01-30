const express = require('express');
const router = express.Router();

const PurchaseOrderController = require('../controllers/purchaseOrderController');
const PurchaseOrderItemController = require('../controllers/purchaseOrderItemController');

const poController = new PurchaseOrderController();
const poItemController = new PurchaseOrderItemController();

/* ================= PURCHASE ORDERS ================= */

router.post('/', poController.create);
router.get('/', poController.getAll);
router.get('/stats', poController.getStats);
router.get('/generate-number', poController.generatePoNumber);
router.get('/:id', poController.getById);
router.put('/:id', poController.update);
router.patch('/:id/status', poController.updateStatus);
router.delete('/:id', poController.delete);

/* ================= PO ITEMS ================= */

// Note: Removed the middleware that adds po_id - let the controller handle it
router.post('/:poId/items', poItemController.create);
router.get('/:poId/items', poItemController.getByPoId);

router.get('/items/:id', poItemController.getById);
router.put('/items/:id', poItemController.update);
router.post('/items/:id/receive', poItemController.receive);
router.get('/items/:id/receipts', poItemController.getReceiptHistory);
router.post('/items/:id/generate-tires', poItemController.generateTires);
router.delete('/items/:id', poItemController.delete);

// Bulk update route (optional)
router.post('/:poId/items/bulk', poItemController.bulkUpdateItems);

module.exports = router;