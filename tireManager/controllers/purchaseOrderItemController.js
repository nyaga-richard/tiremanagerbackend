const PurchaseOrderItem = require('../models/PurchaseOrderItem');
const PurchaseOrder = require('../models/PurchaseOrder');

class PurchaseOrderItemController {
    constructor() {
        // Bind methods
        this.create = this.create.bind(this);
        this.getByPoId = this.getByPoId.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.delete = this.delete.bind(this);
        this.receive = this.receive.bind(this);
        this.getReceiptHistory = this.getReceiptHistory.bind(this);
        this.generateTires = this.generateTires.bind(this);
    }

    // Create PO Item
    async create(req, res) {
        try {
            const { poId } = req.params;
            const itemData = req.body;
            const db = require('../config/database');
            
            // Check if PO exists and is in a valid state for adding items
            const purchaseOrder = await PurchaseOrder.findById(db, poId);
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
            
            // Start transaction
            const result = await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', [], async (err) => {
                    if (err) return reject(err);
                    
                    try {
                        const itemId = await PurchaseOrderItem.create(db, itemData);
                        
                        // Update PO totals
                        await PurchaseOrderItem.updatePoTotal(db, poId);
                        
                        const item = await PurchaseOrderItem.findById(db, itemId);
                        
                        db.run('COMMIT', [], (err) => {
                            if (err) return reject(err);
                            resolve(item);
                        });
                    } catch (error) {
                        db.run('ROLLBACK', [], () => reject(error));
                    }
                });
            });
            
            res.status(201).json({
                success: true,
                message: 'Item added to purchase order',
                data: result
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

    // Get items by PO ID
    async getByPoId(req, res) {
        try {
            const { poId } = req.params;
            const db = require('../config/database');
            
            const items = await PurchaseOrderItem.findByPoId(db, poId);
            
            res.json({
                success: true,
                data: items
            });
        } catch (error) {
            console.error('Error fetching items:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch items',
                error: error.message
            });
        }
    }

    // Get item by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            const item = await PurchaseOrderItem.findById(db, id);
            
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

    // Update purchase order item
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const db = require('../config/database');
            
            // Get old values
            const oldItem = await PurchaseOrderItem.findById(db, id);
            if (!oldItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            // Don't allow updating certain fields
            delete updateData.po_id;
            delete updateData.received_quantity;
            
            // Start transaction
            const result = await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', [], async (err) => {
                    if (err) return reject(err);
                    
                    try {
                        const changes = await PurchaseOrderItem.update(db, id, updateData);
                        
                        if (changes === 0) {
                            throw new Error('Item not found or no changes made');
                        }
                        
                        // Update PO totals
                        await PurchaseOrderItem.updatePoTotal(db, oldItem.po_id);
                        
                        const updatedItem = await PurchaseOrderItem.findById(db, id);
                        
                        db.run('COMMIT', [], (err) => {
                            if (err) return reject(err);
                            resolve(updatedItem);
                        });
                    } catch (error) {
                        db.run('ROLLBACK', [], () => reject(error));
                    }
                });
            });
            
            res.json({
                success: true,
                message: 'Item updated successfully',
                data: result
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
    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            // Get old values
            const oldItem = await PurchaseOrderItem.findById(db, id);
            if (!oldItem) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
                });
            }
            
            // Check if PO is in editable state
            const po = await PurchaseOrder.findById(db, oldItem.po_id);
            if (!['DRAFT', 'PENDING_APPROVAL'].includes(po.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete items from a processed purchase order'
                });
            }
            
            // Start transaction
            await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', [], async (err) => {
                    if (err) return reject(err);
                    
                    try {
                        const changes = await PurchaseOrderItem.delete(db, id);
                        
                        if (changes === 0) {
                            throw new Error('Item not found or cannot be deleted');
                        }
                        
                        // Update PO totals
                        await PurchaseOrderItem.updatePoTotal(db, oldItem.po_id);
                        
                        db.run('COMMIT', [], (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    } catch (error) {
                        db.run('ROLLBACK', [], () => reject(error));
                    }
                });
            });
            
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
    async receive(req, res) {
        try {
            const { id } = req.params;
            const { quantity, batch_number } = req.body;
            const db = require('../config/database');
            
            if (!quantity || quantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid quantity is required'
                });
            }
            
            // Check if item exists
            const item = await PurchaseOrderItem.findById(db, id);
            if (!item) {
                return res.status(404).json({
                    success: false,
                    message: 'Item not found'
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
            
            // Start transaction
            const result = await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', [], async (err) => {
                    if (err) return reject(err);
                    
                    try {
                        const receipt = await PurchaseOrderItem.receiveItems(
                            db,
                            id, 
                            quantity, 
                            batch_number, 
                            req.user?.id || 1
                        );
                        
                        // Update PO status if needed
                        await PurchaseOrder.checkAndUpdateStatus(db, item.po_id);
                        
                        db.run('COMMIT', [], (err) => {
                            if (err) return reject(err);
                            resolve(receipt);
                        });
                    } catch (error) {
                        db.run('ROLLBACK', [], () => reject(error));
                    }
                });
            });
            
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

    // Get receipt history for an item
    async getReceiptHistory(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            const history = await PurchaseOrderItem.getReceiptHistory(db, id);
            
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

    // Generate tires from PO item
    async generateTires(req, res) {
        try {
            const { id } = req.params;
            const { start_serial } = req.body;
            const db = require('../config/database');
            
            const result = await PurchaseOrderItem.generateTires(
                db,
                id,
                start_serial || null
            );
            
            res.json({
                success: true,
                message: 'Tires generated successfully',
                data: result
            });
        } catch (error) {
            console.error('Error generating tires:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate tires',
                error: error.message
            });
        }
    }

    // Bulk update items for a PO
    async bulkUpdateItems(req, res) {
        try {
            const { poId } = req.params;
            const { items } = req.body;
            const db = require('../config/database');
            
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Items must be a non-empty array'
                });
            }
            
            // Check if PO exists and is in a valid state
            const purchaseOrder = await PurchaseOrder.findById(db, poId);
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
            
            // Start transaction
            const result = await new Promise((resolve, reject) => {
                db.run('BEGIN TRANSACTION', [], async (err) => {
                    if (err) return reject(err);
                    
                    try {
                        const results = [];
                        const errors = [];
                        
                        for (const item of items) {
                            try {
                                if (item.id) {
                                    // Update existing item
                                    const { id, ...updateData } = item;
                                    await PurchaseOrderItem.update(db, id, updateData);
                                    const updatedItem = await PurchaseOrderItem.findById(db, id);
                                    results.push({ action: 'update', id, data: updatedItem });
                                } else {
                                    // Create new item
                                    item.po_id = parseInt(poId);
                                    const newId = await PurchaseOrderItem.create(db, item);
                                    const newItem = await PurchaseOrderItem.findById(db, newId);
                                    results.push({ action: 'create', id: newId, data: newItem });
                                }
                            } catch (error) {
                                errors.push({
                                    item: item,
                                    error: error.message
                                });
                            }
                        }
                        
                        // Update PO totals
                        await PurchaseOrderItem.updatePoTotal(db, poId);
                        
                        // Refresh PO to get updated totals
                        const updatedPO = await PurchaseOrder.findById(db, poId);
                        
                        db.run('COMMIT', [], (err) => {
                            if (err) return reject(err);
                            resolve({
                                results,
                                errors,
                                purchaseOrder: updatedPO
                            });
                        });
                    } catch (error) {
                        db.run('ROLLBACK', [], () => reject(error));
                    }
                });
            });
            
            res.json({
                success: true,
                message: 'Bulk update completed',
                data: result
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