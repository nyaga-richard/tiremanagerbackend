const PurchaseOrder = require('../models/PurchaseOrder');
const PurchaseOrderItem = require('../models/PurchaseOrderItem');

// Try to import InventoryCatalog, but don't fail if it doesn't exist
let InventoryCatalog;
try {
    InventoryCatalog = require('../models/InventoryCatalog');
} catch (error) {
    console.warn('InventoryCatalog model not found, some features may be disabled');
    InventoryCatalog = {
        findAll: async () => [],
        getReorderSuggestions: async () => [],
        getStockSummary: async () => ({})
    };
}

class PurchaseOrderController {
    constructor(authMiddleware) {
        this.authMiddleware = authMiddleware;
    }

    // Create a new purchase order
    async createPO(req, res) {
        try {
            const poData = req.body;
            
            // Generate PO number if not provided
            if (!poData.po_number) {
                poData.po_number = await PurchaseOrder.generatePoNumber();
            }
            
            // Set created_by from authenticated user
            poData.created_by = req.user.id;
            
            // Validate required fields
            if (!poData.supplier_id || !poData.po_date) {
                return res.status(400).json({
                    success: false,
                    message: 'Supplier ID and PO date are required'
                });
            }
            
            const poId = await PurchaseOrder.create(poData);
            
            // If items are provided in the request, create them
            if (poData.items && Array.isArray(poData.items)) {
                for (const item of poData.items) {
                    item.po_id = poId;
                    await PurchaseOrderItem.create(item);
                }
                
                // Update PO totals after adding items
                await PurchaseOrderItem.updatePoTotal(poId);
            }
            
            const purchaseOrder = await PurchaseOrder.findById(poId);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'CREATE',
                'PURCHASE_ORDER',
                poId,
                null,
                purchaseOrder,
                req
            );
            
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

    // Get all purchase orders with pagination and filtering
    async getAllPOs(req, res) {
        try {
            const { 
                page = 1, 
                limit = 20,
                supplier_id,
                status,
                start_date,
                end_date,
                po_number,
                sort_by = 'po_date',
                sort_order = 'DESC'
            } = req.query;

            // Validate sort_by field
            const validSortFields = ['po_date', 'created_at', 'final_amount', 'po_number'];
            if (!validSortFields.includes(sort_by)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid sort field'
                });
            }

            const filters = {
                supplier_id,
                status,
                start_date,
                end_date,
                po_number
            };

            // Remove undefined filters
            Object.keys(filters).forEach(key => {
                if (filters[key] === undefined) {
                    delete filters[key];
                }
            });

            const result = await PurchaseOrder.findAll(filters, parseInt(page), parseInt(limit));
            
            // Log audit trail (optional for view actions)
            await this.authMiddleware.logAudit(
                req.user.id,
                'VIEW_LIST',
                'PURCHASE_ORDER',
                null,
                null,
                { filters, page, limit },
                req
            );
            
            res.json({
                success: true,
                data: result.data,
                pagination: {
                    page: result.page,
                    limit: result.limit,
                    total: result.total,
                    totalPages: result.totalPages
                }
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

    // Get a single purchase order by ID
    async getPOById(req, res) {
        try {
            const { id } = req.params;
            
            const purchaseOrder = await PurchaseOrder.findById(id);
            
            if (!purchaseOrder) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            // Get items for this PO
            const items = await PurchaseOrderItem.findByPoId(id);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'VIEW',
                'PURCHASE_ORDER',
                id,
                null,
                null,
                req
            );
            
            res.json({
                success: true,
                data: {
                    ...purchaseOrder,
                    items: items
                }
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

    // Update a purchase order
    async updatePO(req, res) {
        try {
            const { id } = req.params;
            const updateData = req.body;
            
            // Get old values for audit trail
            const oldPO = await PurchaseOrder.findById(id);
            if (!oldPO) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            // Don't allow updating certain fields
            delete updateData.po_number;
            delete updateData.supplier_id;
            delete updateData.created_by;
            
            const changes = await PurchaseOrder.update(id, updateData);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found or no changes made'
                });
            }
            
            const updatedPO = await PurchaseOrder.findById(id);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'UPDATE',
                'PURCHASE_ORDER',
                id,
                oldPO,
                updatedPO,
                req
            );
            
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

    // Update PO status (for approval workflow)
    async updatePOStatus(req, res) {
        try {
            const { id } = req.params;
            const { status } = req.body;
            
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: 'Status is required'
                });
            }
            
            const validStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 
                                 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'CLOSED'];
            
            if (!validStatuses.includes(status)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid status'
                });
            }
            
            // Get old values for audit trail
            const oldPO = await PurchaseOrder.findById(id);
            if (!oldPO) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            const approvedBy = status === 'APPROVED' ? req.user.id : null;
            const changes = await PurchaseOrder.updateStatus(id, status, approvedBy);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            const updatedPO = await PurchaseOrder.findById(id);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'UPDATE_STATUS',
                'PURCHASE_ORDER',
                id,
                { status: oldPO.status },
                { status: updatedPO.status, approved_by: updatedPO.approved_by },
                req
            );
            
            res.json({
                success: true,
                message: 'Purchase order status updated successfully',
                data: updatedPO
            });
        } catch (error) {
            console.error('Error updating PO status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update purchase order status',
                error: error.message
            });
        }
    }

    // Delete a purchase order
    async deletePO(req, res) {
        try {
            const { id } = req.params;
            
            // Get old values for audit trail
            const oldPO = await PurchaseOrder.findById(id);
            if (!oldPO) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found'
                });
            }
            
            const changes = await PurchaseOrder.delete(id);
            
            if (changes === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Purchase order not found or cannot be deleted'
                });
            }
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'DELETE',
                'PURCHASE_ORDER',
                id,
                oldPO,
                null,
                req
            );
            
            res.json({
                success: true,
                message: 'Purchase order deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting purchase order:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to delete purchase order'
            });
        }
    }

    // Get PO statistics
    async getPOStats(req, res) {
        try {
            const { supplier_id, start_date, end_date } = req.query;
            
            const stats = await PurchaseOrder.getStats(supplier_id, start_date, end_date);
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching PO stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch purchase order statistics',
                error: error.message
            });
        }
    }

    // Get items from inventory catalog for PO creation
    async getInventoryForPO(req, res) {
        try {
            const filters = req.query;
            const inventory = await InventoryCatalog.findAll(filters);
            
            res.json({
                success: true,
                data: inventory
            });
        } catch (error) {
            console.error('Error fetching inventory:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch inventory',
                error: error.message
            });
        }
    }

    // Get reorder suggestions
    async getReorderSuggestions(req, res) {
        try {
            const suggestions = await InventoryCatalog.getReorderSuggestions();
            
            res.json({
                success: true,
                data: suggestions
            });
        } catch (error) {
            console.error('Error fetching reorder suggestions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch reorder suggestions',
                error: error.message
            });
        }
    }

    // Create PO from reorder suggestions
    async createPOFromSuggestions(req, res) {
        try {
            const { supplier_id } = req.body;
            
            if (!supplier_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Supplier ID is required'
                });
            }
            
            // Get reorder suggestions
            const suggestions = await InventoryCatalog.getReorderSuggestions();
            
            if (suggestions.length === 0) {
                return res.status(200).json({
                    success: true,
                    message: 'No items need reordering',
                    data: null
                });
            }
            
            // Create PO
            const poData = {
                supplier_id,
                po_date: new Date().toISOString().split('T')[0],
                status: 'DRAFT',
                created_by: req.user.id,
                notes: 'Auto-generated from reorder suggestions'
            };
            
            poData.po_number = await PurchaseOrder.generatePoNumber();
            const poId = await PurchaseOrder.create(poData);
            
            // Create PO items from suggestions
            const createdItems = [];
            for (const item of suggestions) {
                const quantity = (item.max_stock || item.reorder_point * 2) - item.current_stock;
                
                if (quantity > 0) {
                    const itemData = {
                        po_id: poId,
                        size: item.size,
                        brand: item.brand,
                        model: item.model,
                        type: item.type,
                        quantity: quantity,
                        unit_price: item.last_purchase_price || item.average_cost || 0,
                        notes: `Reorder: Current stock: ${item.current_stock}, Reorder point: ${item.reorder_point}`
                    };
                    
                    const itemId = await PurchaseOrderItem.create(itemData);
                    createdItems.push({ ...itemData, id: itemId });
                }
            }
            
            // Update PO totals
            if (createdItems.length > 0) {
                await PurchaseOrderItem.updatePoTotal(poId);
            }
            
            const purchaseOrder = await PurchaseOrder.findById(poId);
            
            // Log audit trail
            await this.authMiddleware.logAudit(
                req.user.id,
                'CREATE_AUTO',
                'PURCHASE_ORDER',
                poId,
                null,
                { purchaseOrder, items: createdItems },
                req
            );
            
            res.status(201).json({
                success: true,
                message: 'Purchase order created from reorder suggestions',
                data: {
                    purchaseOrder,
                    items: createdItems
                }
            });
        } catch (error) {
            console.error('Error creating PO from suggestions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create purchase order from suggestions',
                error: error.message
            });
        }
    }
}

module.exports = PurchaseOrderController;