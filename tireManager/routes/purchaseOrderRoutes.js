const express = require('express');
const router = express.Router();

module.exports = function () {
    // Import controllers (no instantiation needed)
    const PurchaseOrderController = require('../controllers/purchaseOrderController');
    const PurchaseOrderItemController = require('../controllers/purchaseOrderItemController');
    const InventoryCatalogController = require('../controllers/inventoryCatalogController');

    // -------------------------
    // Purchase Order Routes
    // -------------------------
    router.post('/purchase-orders', PurchaseOrderController.createPO);
    router.get('/purchase-orders', PurchaseOrderController.getAllPOs);
    router.get('/purchase-orders/stats', PurchaseOrderController.getPOStats);
    router.get('/purchase-orders/:id', PurchaseOrderController.getPOById);
    router.put('/purchase-orders/:id', PurchaseOrderController.updatePO);
    router.patch('/purchase-orders/:id/status', PurchaseOrderController.updatePOStatus);
    router.delete('/purchase-orders/:id', PurchaseOrderController.deletePO);
    router.get('/purchase-orders/transactions', PurchaseOrderController.getPOTransactions);

    // -------------------------
    // Purchase Order Item Routes
    // -------------------------
    router.post('/purchase-orders/:poId/items', PurchaseOrderItemController.addItem);
    router.get('/purchase-orders/:poId/items', PurchaseOrderItemController.getItemsByPO);
    router.get('/purchase-order-items/:itemId', PurchaseOrderItemController.getItem);
    router.put('/purchase-order-items/:itemId', PurchaseOrderItemController.updateItem);
    router.delete('/purchase-order-items/:itemId', PurchaseOrderItemController.deleteItem);
    router.post('/purchase-order-items/:itemId/receive', PurchaseOrderItemController.receiveItems);
    router.get('/purchase-order-items/:itemId/receipts', PurchaseOrderItemController.getReceiptHistory);
    router.put('/purchase-orders/:poId/items/bulk', PurchaseOrderItemController.bulkUpdateItems);

    // -------------------------
    // Inventory Catalog Routes
    // -------------------------
    router.get('/inventory', InventoryCatalogController.getAllInventory);
    router.get('/inventory/summary', InventoryCatalogController.getInventorySummary);
    router.get('/inventory/stats', InventoryCatalogController.getInventoryStats);
    router.post('/inventory', InventoryCatalogController.upsertInventoryItem);
    router.patch('/inventory/stock', InventoryCatalogController.updateStock);
    router.get('/inventory/low-stock', InventoryCatalogController.getLowStock);
    router.get('/inventory/search', InventoryCatalogController.searchInventory);

    // -------------------------
    // Reorder Suggestions Routes
    // -------------------------
    router.get('/reorder-suggestions', PurchaseOrderController.getReorderSuggestions);
    router.post('/reorder-purchase-order', PurchaseOrderController.createPOFromSuggestions);

    return router;
};