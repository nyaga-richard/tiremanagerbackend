const PurchaseOrder = require('../models/PurchaseOrder');

class PurchaseOrderController {
    constructor() {
        // Bind methods
        this.create = this.create.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getStats = this.getStats.bind(this);
        this.generatePoNumber = this.generatePoNumber.bind(this);
        this.getById = this.getById.bind(this);
        this.update = this.update.bind(this);
        this.updateStatus = this.updateStatus.bind(this);
        this.delete = this.delete.bind(this);
        this.getItems = this.getItems.bind(this);
    }

    // Create purchase order
    async create(req, res) {
        try {
            const poData = req.body;
            const db = require('../config/database');
            
            const poId = await PurchaseOrder.create(db, poData);
            const purchaseOrder = await PurchaseOrder.findById(db, poId);
            
            res.status(201).json({
                success: true,
                message: 'Purchase order created successfully',
                data: purchaseOrder
            });
        } catch (error) {
            console.error('Error creating purchase order:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create purchase order',
                error: error.message
            });
        }
    }

    // Get all purchase orders
    async getAll(req, res) {
        try {
            const db = require('../config/database');
            const { status, supplier_id, date_from, date_to, page = 1, limit = 20 } = req.query;
            
            const filters = {};
            if (status) filters.status = status;
            if (supplier_id) filters.supplier_id = parseInt(supplier_id);
            if (date_from) filters.date_from = date_from;
            if (date_to) filters.date_to = date_to;
            
            const result = await PurchaseOrder.findAll(db, filters, parseInt(page), parseInt(limit));
            
            res.json({
                success: true,
                data: result.data,
                pagination: result.pagination
            });
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch purchase orders',
                error: error.message
            });
        }
    }

    // Get purchase order statistics
    async getStats(req, res) {
        try {
            const db = require('../config/database');
            const stats = await PurchaseOrder.getStats(db);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching PO stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch statistics',
                error: error.message
            });
        }
    }

    // Generate PO number
    async generatePoNumber(req, res) {
        try {
            const db = require('../config/database');
            const poNumber = await PurchaseOrder.generatePoNumber(db);
            
            res.json({
                success: true,
                data: { po_number: poNumber }
            });
        } catch (error) {
            console.error('Error generating PO number:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate PO number',
                error: error.message
            });
        }
    }

    // Get purchase order by ID
    async getById(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            const purchaseOrder = await PurchaseOrder.findById(db, id);
            
            if (!purchaseOrder) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            res.json({
                success: true,
                data: purchaseOrder
            });
        } catch (error) {
            console.error('Error fetching purchase order:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch purchase order',
                error: error.message
            });
        }
    }

    // Update purchase order
    async update(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            const db = require('../config/database');
            
            // Don't allow updating certain fields directly
            delete updateData.status;
            delete updateData.po_number;
            delete updateData.total_amount;
            
            const changes = await PurchaseOrder.update(db, id, updateData);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found or no changes made'
                });
            }
            
            const updatedPO = await PurchaseOrder.findById(db, id);
            
            res.json({
                success: true,
                message: 'Purchase order updated successfully',
                data: updatedPO
            });
        } catch (error) {
            console.error('Error updating purchase order:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update purchase order',
                error: error.message
            });
        }
    }

    // Update purchase order status
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            const db = require('../config/database');
            
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }
            
            const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
                });
            }
            
            const result = await PurchaseOrder.updateStatus(db, id, status);
            
            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found or status update failed'
                });
            }
            
            res.json({
                success: true,
                message: `Purchase order status updated to ${status}`,
                data: result
            });
        } catch (error) {
            console.error('Error updating PO status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update status',
                error: error.message
            });
        }
    }

    // Delete purchase order
    async delete(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            const purchaseOrder = await PurchaseOrder.findById(db, id);
            if (!purchaseOrder) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            // Only allow deletion of DRAFT or CANCELLED POs
            if (!['DRAFT', 'CANCELLED'].includes(purchaseOrder.status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete a purchase order that is not in DRAFT or CANCELLED status'
                });
            }
            
            await PurchaseOrder.delete(db, id);
            
            res.json({
                success: true,
                message: 'Purchase order deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting purchase order:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete purchase order',
                error: error.message
            });
        }
    }

    // Get PO items
    async getItems(req, res) {
        try {
            const { id } = req.params;
            const db = require('../config/database');
            
            const items = await PurchaseOrder.getItems(db, id);
            
            res.json({
                success: true,
                data: items
            });
        } catch (error) {
            console.error('Error fetching PO items:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch PO items',
                error: error.message
            });
        }
    }
}

module.exports = PurchaseOrderController;