// const express = require('express');
// const router = express.Router();

// module.exports = function(db, authMiddleware) {
//     // Initialize controllers with authMiddleware
//     const PurchaseOrderController = require('../controllers/purchaseOrderController');
//     const PurchaseOrderItemController = require('../controllers/purchaseOrderItemController');
//     const InventoryCatalogController = require('../controllers/inventoryCatalogController');
    
//     const poController = new PurchaseOrderController(authMiddleware);
//     const poItemController = new PurchaseOrderItemController(authMiddleware);
//     const inventoryController = new InventoryCatalogController(authMiddleware);

//     // Apply authentication middleware to all routes
//     router.use(authMiddleware.authenticate);

//     // Purchase Order Routes
//     router.post('/purchase-orders', authMiddleware.checkPermission('purchase_order', 'create'), poController.createPO.bind(poController));
//     router.get('/purchase-orders', authMiddleware.checkPermission('purchase_order', 'view'), poController.getAllPOs.bind(poController));
//     router.get('/purchase-orders/stats', authMiddleware.checkPermission('purchase_order', 'view'), poController.getPOStats.bind(poController));
//     router.get('/purchase-orders/:id', authMiddleware.checkPermission('purchase_order', 'view'), poController.getPOById.bind(poController));
//     router.put('/purchase-orders/:id', authMiddleware.checkPermission('purchase_order', 'edit'), poController.updatePO.bind(poController));
//     router.patch('/purchase-orders/:id/status', authMiddleware.checkPermission('purchase_order', 'approve'), poController.updatePOStatus.bind(poController));
//     router.delete('/purchase-orders/:id', authMiddleware.checkPermission('purchase_order', 'delete'), poController.deletePO.bind(poController));

//     // Purchase Order Item Routes
//     router.post('/purchase-orders/:poId/items', authMiddleware.checkPermission('purchase_order', 'edit'), poItemController.addItem.bind(poItemController));
//     router.get('/purchase-order-items/:itemId', authMiddleware.checkPermission('purchase_order', 'view'), poItemController.getItem.bind(poItemController));
//     router.put('/purchase-order-items/:itemId', authMiddleware.checkPermission('purchase_order', 'edit'), poItemController.updateItem.bind(poItemController));
//     router.delete('/purchase-order-items/:itemId', authMiddleware.checkPermission('purchase_order', 'delete'), poItemController.deleteItem.bind(poItemController));
//     router.post('/purchase-order-items/:itemId/receive', authMiddleware.checkPermission('purchase_order', 'edit'), poItemController.receiveItems.bind(poItemController));
//     router.get('/purchase-order-items/:itemId/receipts', authMiddleware.checkPermission('purchase_order', 'view'), poItemController.getReceiptHistory.bind(poItemController));
//     router.put('/purchase-orders/:poId/items/bulk', authMiddleware.checkPermission('purchase_order', 'edit'), poItemController.bulkUpdateItems.bind(poItemController));

//     // Inventory Catalog Routes
//     router.get('/inventory', authMiddleware.checkPermission('inventory', 'view'), inventoryController.getAllInventory.bind(inventoryController));
//     router.get('/inventory/summary', authMiddleware.checkPermission('inventory', 'view'), inventoryController.getInventorySummary.bind(inventoryController));
//     router.post('/inventory', authMiddleware.checkPermission('inventory', 'create'), inventoryController.upsertInventoryItem.bind(inventoryController));
//     router.patch('/inventory/stock', authMiddleware.checkPermission('inventory', 'edit'), inventoryController.updateStock.bind(inventoryController));
//     router.get('/inventory/low-stock', authMiddleware.checkPermission('inventory', 'view'), inventoryController.getLowStock.bind(inventoryController));
//     router.get('/inventory/search', authMiddleware.checkPermission('inventory', 'view'), inventoryController.searchInventory.bind(inventoryController));

//     // Reorder Suggestions Routes
//     router.get('/reorder-suggestions', authMiddleware.checkPermission('purchase_order', 'view'), poController.getReorderSuggestions.bind(poController));
//     router.post('/reorder-purchase-order', authMiddleware.checkPermission('purchase_order', 'create'), poController.createPOFromSuggestions.bind(poController));

//     return router;
// };

const express = require('express');
const router = express.Router();

module.exports = function (db) {
    // Initialize controllers (no auth middleware)
    const PurchaseOrderController = require('../controllers/purchaseOrderController');
    const PurchaseOrderItemController = require('../controllers/purchaseOrderItemController');
    const InventoryCatalogController = require('../controllers/inventoryCatalogController');

    const poController = new PurchaseOrderController();
    const poItemController = new PurchaseOrderItemController();
    const inventoryController = new InventoryCatalogController();

    // -------------------------
    // Purchase Order Routes
    // -------------------------
    router.post('/purchase-orders', poController.createPO.bind(poController));
    router.get('/purchase-orders', poController.getAllPOs.bind(poController));
    router.get('/purchase-orders/stats', poController.getPOStats.bind(poController));
    router.get('/purchase-orders/:id', poController.getPOById.bind(poController));
    router.put('/purchase-orders/:id', poController.updatePO.bind(poController));
    router.patch('/purchase-orders/:id/status', poController.updatePOStatus.bind(poController));
    router.delete('/purchase-orders/:id', poController.deletePO.bind(poController));

    // -------------------------
    // Purchase Order Item Routes
    // -------------------------
    router.post('/purchase-orders/:poId/items', poItemController.addItem.bind(poItemController));
    router.get('/purchase-order-items/:itemId', poItemController.getItem.bind(poItemController));
    router.put('/purchase-order-items/:itemId', poItemController.updateItem.bind(poItemController));
    router.delete('/purchase-order-items/:itemId', poItemController.deleteItem.bind(poItemController));
    router.post('/purchase-order-items/:itemId/receive', poItemController.receiveItems.bind(poItemController));
    router.get('/purchase-order-items/:itemId/receipts', poItemController.getReceiptHistory.bind(poItemController));
    router.put('/purchase-orders/:poId/items/bulk', poItemController.bulkUpdateItems.bind(poItemController));

    // -------------------------
    // Inventory Catalog Routes
    // -------------------------
    router.get('/inventory', inventoryController.getAllInventory.bind(inventoryController));
    router.get('/inventory/summary', inventoryController.getInventorySummary.bind(inventoryController));
    router.post('/inventory', inventoryController.upsertInventoryItem.bind(inventoryController));
    router.patch('/inventory/stock', inventoryController.updateStock.bind(inventoryController));
    router.get('/inventory/low-stock', inventoryController.getLowStock.bind(inventoryController));
    router.get('/inventory/search', inventoryController.searchInventory.bind(inventoryController));

    // -------------------------
    // Reorder Suggestions Routes
    // -------------------------
    router.get('/reorder-suggestions', poController.getReorderSuggestions.bind(poController));
    router.post('/reorder-purchase-order', poController.createPOFromSuggestions.bind(poController));

    return router;
};
