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
        let { items, ...poData } = req.body;
        const db = require('../config/database');
        
        // Generate PO number if not provided
        if (!poData.po_number) {
            poData.po_number = await PurchaseOrder.generatePoNumber();
        }
        
        // Validate required fields
        const requiredFields = ['supplier_id', 'po_date', 'created_by'];
        const missingFields = requiredFields.filter(field => !poData[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }
        
        // Calculate totals from items if provided
        if (items && Array.isArray(items) && items.length > 0) {
            let subtotalIncludingVAT = 0;
            
            // Map field names for backward compatibility
            items = items.map(item => ({
                // Support both tire_size and size
                size: item.tire_size || item.size,
                // Support both tire_type and type
                type: item.tire_type || item.type || 'NEW',
                brand: item.brand,
                model: item.model,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: item.total_price,
                load_index: item.load_index,
                speed_rating: item.speed_rating,
                season: item.season,
                pattern: item.pattern,
                warehouse_location: item.warehouse_location,
                expected_delivery_date: item.expected_delivery_date,
                notes: item.notes
            }));
            
            console.log('Mapped items:', items);
            
            // Validate each item - now using 'size' instead of 'tire_size'
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.size || !item.quantity || !item.unit_price) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1} is missing required fields: size, quantity, or unit_price`
                    });
                }
                
                // Calculate item total if not provided
                if (!item.total_price) {
                    item.total_price = item.quantity * item.unit_price;
                }
                
                subtotalIncludingVAT += item.total_price;
                
                // Additional validations
                if (item.quantity <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: quantity must be greater than 0`
                    });
                }
                
                if (item.unit_price <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: unit price must be greater than 0`
                    });
                }
            }
            
            // IMPORTANT: Calculate totals correctly
            // VAT is 16% (0.16)
            const VAT_RATE = 0.16;
            
            // If total_amount (excluding VAT) is provided, use it
            // Otherwise calculate from subtotalIncludingVAT
            let total_amount = poData.total_amount;
            let tax_amount = poData.tax_amount;
            
            if (!total_amount && subtotalIncludingVAT > 0) {
                // Calculate: total_amount = subtotalIncludingVAT / (1 + VAT_RATE)
                total_amount = subtotalIncludingVAT / (1 + VAT_RATE);
            }
            
            if (!tax_amount && subtotalIncludingVAT > 0) {
                // Calculate: tax_amount = subtotalIncludingVAT - total_amount
                tax_amount = subtotalIncludingVAT - total_amount;
            }
            
            // If we still don't have total_amount or tax_amount, use default calculation
            if (!total_amount && !tax_amount) {
                total_amount = subtotalIncludingVAT / (1 + VAT_RATE);
                tax_amount = subtotalIncludingVAT - total_amount;
            }
            
            // Update PO totals
            poData.total_amount = total_amount || 0;
            poData.tax_amount = tax_amount || 0;
            poData.shipping_amount = poData.shipping_amount || 0;
            
            // CORRECT: final_amount = subtotalIncludingVAT + shipping_amount
            // NOT: final_amount = (total_amount * 1.16) + shipping_amount
            poData.final_amount = subtotalIncludingVAT + poData.shipping_amount;
            
            console.log('Calculated totals:');
            console.log('- Subtotal including VAT:', subtotalIncludingVAT);
            console.log('- Total amount (excluding VAT):', poData.total_amount);
            console.log('- Tax amount (VAT):', poData.tax_amount);
            console.log('- Shipping amount:', poData.shipping_amount);
            console.log('- Final amount:', poData.final_amount);
        } else {
            // Set defaults if no items
            poData.total_amount = poData.total_amount || 0;
            poData.tax_amount = poData.tax_amount || 0;
            poData.shipping_amount = poData.shipping_amount || 0;
            
            // CORRECT: final_amount = (total_amount + tax_amount) + shipping_amount
            poData.final_amount = poData.final_amount || 
                ((poData.total_amount + poData.tax_amount) + poData.shipping_amount);
        }
        
        // Set default status
        poData.status = poData.status || 'DRAFT';
        
        console.log('Creating purchase order with data:', poData);
        
        // Create purchase order with items in transaction
        const result = await PurchaseOrder.createWithItems(db, poData, items || []);
        
        res.status(201).json({
            success: true,
            message: items && items.length > 0 
                ? `Purchase order created successfully with ${items.length} items`
                : 'Purchase order created successfully',
            data: result
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
            
            // Only add filters if they exist
            if (status && status.trim() !== '') {
                filters.status = status;
            }
            if (supplier_id && supplier_id.trim() !== '') {
                const parsedId = parseInt(supplier_id);
                if (!isNaN(parsedId)) {
                    filters.supplier_id = parsedId;
                }
            }
            if (date_from && date_from.trim() !== '') {
                filters.start_date = date_from;  // Note: model expects start_date, not date_from
            }
            if (date_to && date_to.trim() !== '') {
                filters.end_date = date_to;      // Note: model expects end_date, not date_to
            }
            
            // Parse page and limit as integers
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            
            // Ensure they're valid numbers
            const validPage = !isNaN(pageNum) && pageNum > 0 ? pageNum : 1;
            const validLimit = !isNaN(limitNum) && limitNum > 0 ? limitNum : 20;
            
            console.log('Calling PurchaseOrder.findAll with:', { 
                filters, 
                page: validPage, 
                limit: validLimit 
            });
            
            const result = await PurchaseOrder.findAll(filters, validPage, validLimit);
            
            res.json({
                success: true,
                data: result.data,
                pagination: {
                    page: validPage,
                    limit: validLimit,
                    total: result.total,
                    pages: result.totalPages
                }
            });
        } catch (error) {
            console.error('Error fetching purchase orders:', error);
            console.error('Error stack:', error.stack);
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
            
            // Always include items when getting a single PO
            const purchaseOrder = await PurchaseOrder.findById(id, true);
            
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