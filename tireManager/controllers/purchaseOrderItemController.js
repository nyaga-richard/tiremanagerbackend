const PurchaseOrderItem = require('../models/PurchaseOrderItem');
const PurchaseOrder = require('../models/PurchaseOrder');

class PurchaseOrderItemController {
    constructor(authMiddleware) {
        this.authMiddleware = authMiddleware;
    }

    // Add item to purchase order
    async addItem(req, res) {
        try {
            const { poId } = req.params;
            const itemData = req.body;
            
            // Check if PO exists and is in a valid state for adding items
            const purchaseOrder = await PurchaseOrder.findById(poId);
            if (!purchaseOrder) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            // Only allow adding items to DRAFT or PENDING_APPROVAL POs
            if (!['DRAFT', 'PENDING_APPROVAL'].includes(purchaseOrder.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot add items to a purchase order that is already approved or processed'
                });
            }
            
            itemData.po_id = parseInt(poId);
            
            const itemId = await PurchaseOrderItem.create(itemData);
            
            // Update PO totals
            await PurchaseOrderItem.updatePoTotal(poId);
            
            const item = await PurchaseOrderItem.findById(itemId);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'CREATE',
                'PO_ITEM',
                itemId,
                null,
                item,
                req
            );
            
            res.status(201).json({
                success: true,
                message: 'Item added to purchase order',
                data: item
            });
        } catch (error) {
            console.error('Error adding item to PO:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add item to purchase order',
                error: error.message
            });
        }
    }

    // Update purchase order item
    async updateItem(req, res) {
        try {
            const { itemId } = req.params;
            const updateData = req.body;
            
            // Get old values for audit trail
            const oldItem = await PurchaseOrderItem.findById(itemId);
            if (!oldItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            // Don't allow updating certain fields
            delete updateData.po_id;
            delete updateData.received_quantity; // Use receive endpoint for this
            
            const changes = await PurchaseOrderItem.update(itemId, updateData);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found or no changes made'
                });
            }
            
            // Update PO totals
            await PurchaseOrderItem.updatePoTotal(oldItem.po_id);
            
            const updatedItem = await PurchaseOrderItem.findById(itemId);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'UPDATE',
                'PO_ITEM',
                itemId,
                oldItem,
                updatedItem,
                req
            );
            
            res.json({
                success: true,
                message: 'Item updated successfully',
                data: updatedItem
            });
        } catch (error) {
            console.error('Error updating PO item:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update item',
                error: error.message
            });
        }
    }

    // Delete purchase order item
    async deleteItem(req, res) {
        try {
            const { itemId } = req.params;
            
            // Get old values for audit trail
            const oldItem = await PurchaseOrderItem.findById(itemId);
            if (!oldItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            const changes = await PurchaseOrderItem.delete(itemId);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found or cannot be deleted'
                });
            }
            
            // Update PO totals
            await PurchaseOrderItem.updatePoTotal(oldItem.po_id);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'DELETE',
                'PO_ITEM',
                itemId,
                oldItem,
                null,
                req
            );
            
            res.json({
                success: true,
                message: 'Item deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting PO item:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to delete item'
            });
        }
    }

    // Receive items (partial or full)
    async receiveItems(req, res) {
        try {
            const { itemId } = req.params;
            const { quantity, batch_number } = req.body;
            
            if (!quantity || quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid quantity is required'
                });
            }
            
            // Check if item exists
            const item = await PurchaseOrderItem.findById(itemId);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            // Check if PO is in a valid state for receiving
            if (!['APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(item.po_status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot receive items for a purchase order that is not approved or ordered'
                });
            }
            
            // Check if quantity exceeds remaining
            const remaining = item.quantity - item.received_quantity;
            if (quantity > remaining) {
                return res.status(400).json({
                    success: false,
                    message: `Cannot receive more than ${remaining} items (${quantity} requested)`
                });
            }
            
            const result = await PurchaseOrderItem.receiveItems(
                itemId, 
                quantity, 
                batch_number, 
                req.user.id
            );
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'RECEIVE',
                'PO_ITEM',
                itemId,
                { received_quantity: item.received_quantity },
                { received_quantity: item.received_quantity + quantity },
                req
            );
            
            res.json({
                success: true,
                message: 'Items received successfully',
                data: result
            });
        } catch (error) {
            console.error('Error receiving items:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to receive items',
                error: error.message
            });
        }
    }

    // Get item details
    async getItem(req, res) {
        try {
            const { itemId } = req.params;
            
            const item = await PurchaseOrderItem.findById(itemId);
            
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            res.json({
                success: true,
                data: item
            });
        } catch (error) {
            console.error('Error fetching item:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch item',
                error: error.message
            });
        }
    }

    // Get receipt history for an item
    async getReceiptHistory(req, res) {
        try {
            const { itemId } = req.params;
            
            const history = await PurchaseOrderItem.getReceiptHistory(itemId);
            
            res.json({
                success: true,
                data: history
            });
        } catch (error) {
            console.error('Error fetching receipt history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch receipt history',
                error: error.message
            });
        }
    }

    // Bulk update items for a PO
    async bulkUpdateItems(req, res) {
        try {
            const { poId } = req.params;
            const { items } = req.body;
            
            if (!Array.isArray(items)) {
                return res.status(400).json({
                    success: false,
                    message: 'Items must be an array'
                });
            }
            
            // Check if PO exists and is in a valid state
            const purchaseOrder = await PurchaseOrder.findById(poId);
            if (!purchaseOrder) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            if (!['DRAFT', 'PENDING_APPROVAL'].includes(purchaseOrder.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot update items on a processed purchase order'
                });
            }
            
            const results = [];
            const errors = [];
            
            for (const item of items) {
                try {
                    if (item.id) {
                        // Update existing item
                        const { id, ...updateData } = item;
                        await PurchaseOrderItem.update(id, updateData);
                        const updatedItem = await PurchaseOrderItem.findById(id);
                        results.push({ action: 'update', id, data: updatedItem });
                        
                        // Log audit trail for each update
                        await this.authMiddleware.logAudit(
                            req.user.id,
                            'BULK_UPDATE',
                            'PO_ITEM',
                            id,
                            null,
                            updateData,
                            req
                        );
                    } else {
                        // Create new item
                        item.po_id = parseInt(poId);
                        const newId = await PurchaseOrderItem.create(item);
                        const newItem = await PurchaseOrderItem.findById(newId);
                        results.push({ action: 'create', id: newId, data: newItem });
                        
                        // Log audit trail for each create
                        await this.authMiddleware.logAudit(
                            req.user.id,
                            'BULK_CREATE',
                            'PO_ITEM',
                            newId,
                            null,
                            item,
                            req
                        );
                    }
                } catch (error) {
                    errors.push({
                        item: item,
                        error: error.message
                    });
                }
            }
            
            // Update PO totals
            await PurchaseOrderItem.updatePoTotal(poId);
            
            // Refresh PO to get updated totals
            const updatedPO = await PurchaseOrder.findById(poId);
            
            res.json({
                success: true,
                message: 'Bulk update completed',
                data: {
                    results: results,
                    errors: errors,
                    purchaseOrder: updatedPO
                }
            });
        } catch (error) {
            console.error('Error in bulk update:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to perform bulk update',
                error: error.message
            });
        }
    }
}

module.exports = PurchaseOrderItemController;