const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const PurchaseOrder = require('../models/PurchaseOrder');
const db = require('../config/database');

class GRNController {
    constructor() {
        // Bind methods to maintain context
        this.create = this.create.bind(this);
        this.getById = this.getById.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getByOrderId = this.getByOrderId.bind(this);
        this.getReceiptPreview = this.getReceiptPreview.bind(this);
        this.generateGrnNumber = this.generateGrnNumber.bind(this);
    }

    async getAll(req, res) {
        try {
            const {
                page = 1,
                limit = 20,
                search,
                status,
                start_date,
                end_date,
                supplier_id,
                order_number,
                order_type, // 'PURCHASE_ORDER' or 'RETREAD_ORDER'
                sort_by = 'receipt_date',
                sort_order = 'DESC'
            } = req.query;

            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const offset = (pageNum - 1) * limitNum;

            // Build WHERE clause
            const whereConditions = [];
            const params = [];

            if (search) {
                whereConditions.push(`
                    (grn.grn_number LIKE ? OR 
                     COALESCE(po.po_number, ro.order_number) LIKE ? OR 
                     COALESCE(s.name, s_retread.name) LIKE ? OR 
                     COALESCE(s.id, s_retread.id) LIKE ? OR 
                     grn.supplier_invoice_number LIKE ? OR 
                     grn.delivery_note_number LIKE ?)
                `);
                const searchTerm = `%${search}%`;
                params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            }

            if (status) {
                whereConditions.push('grn.status = ?');
                params.push(status);
            }

            if (start_date) {
                whereConditions.push('grn.receipt_date >= ?');
                params.push(start_date);
            }

            if (end_date) {
                whereConditions.push('grn.receipt_date <= ?');
                params.push(end_date);
            }

            if (supplier_id) {
                whereConditions.push('(s.id = ? OR s_retread.id = ?)');
                params.push(supplier_id, supplier_id);
            }

            if (order_number) {
                whereConditions.push('(po.po_number = ? OR ro.order_number = ?)');
                params.push(order_number, order_number);
            }

            if (order_type) {
                if (order_type === 'PURCHASE_ORDER') {
                    whereConditions.push('grn.po_id IS NOT NULL');
                } else if (order_type === 'RETREAD_ORDER') {
                    whereConditions.push('grn.retread_order_id IS NOT NULL');
                }
            }

            const whereClause = whereConditions.length > 0 
                ? `WHERE ${whereConditions.join(' AND ')}` 
                : '';

            // Validate sort order
            const validSortColumns = ['receipt_date', 'created_at', 'grn_number', 'order_number', 'supplier_name'];
            const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'receipt_date';
            const orderDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Count total records
            const countSql = `
                SELECT COUNT(*) as total
                FROM goods_received_notes grn
                LEFT JOIN purchase_orders po ON grn.po_id = po.id
                LEFT JOIN suppliers s ON po.supplier_id = s.id
                LEFT JOIN retread_orders ro ON grn.retread_order_id = ro.id
                LEFT JOIN suppliers s_retread ON ro.supplier_id = s_retread.id
                ${whereClause}`;

            // Get paginated data
            const dataSql = `
                SELECT 
                    grn.*,
                    CASE 
                        WHEN grn.po_id IS NOT NULL THEN po.po_number 
                        ELSE ro.order_number 
                    END as order_number,
                    CASE 
                        WHEN grn.po_id IS NOT NULL THEN 'PURCHASE_ORDER'
                        ELSE 'RETREAD_ORDER'
                    END as order_type,
                    CASE 
                        WHEN grn.po_id IS NOT NULL THEN s.name
                        ELSE s_retread.name
                    END as supplier_name,
                    CASE 
                        WHEN grn.po_id IS NOT NULL THEN s.id
                        ELSE s_retread.id
                    END as supplier_code,
                    u.full_name as received_by_name,
                    (
                        SELECT COUNT(*) 
                        FROM grn_items gi 
                        WHERE gi.grn_id = grn.id
                    ) as item_count,
                    (
                        SELECT SUM(gi.quantity_received) 
                        FROM grn_items gi 
                        WHERE gi.grn_id = grn.id
                    ) as total_quantity,
                    (
                        SELECT SUM(gi.quantity_received * gi.unit_cost) 
                        FROM grn_items gi 
                        WHERE gi.grn_id = grn.id
                    ) as total_value
                FROM goods_received_notes grn
                LEFT JOIN purchase_orders po ON grn.po_id = po.id
                LEFT JOIN suppliers s ON po.supplier_id = s.id
                LEFT JOIN retread_orders ro ON grn.retread_order_id = ro.id
                LEFT JOIN suppliers s_retread ON ro.supplier_id = s_retread.id
                LEFT JOIN users u ON grn.received_by = u.id
                ${whereClause}
                ORDER BY grn.${sortColumn} ${orderDirection}
                LIMIT ? OFFSET ?`;

            // Execute both queries
            db.get(countSql, params, (err, countResult) => {
                if (err) {
                    console.error('Error counting GRNs:', err);
                    return res.status(500).json({
                        success: false,
                        message: 'Failed to count GRNs',
                        error: err.message
                    });
                }

                const queryParams = [...params, limitNum, offset];
                db.all(dataSql, queryParams, (err, rows) => {
                    if (err) {
                        console.error('Error fetching GRNs:', err);
                        return res.status(500).json({
                            success: false,
                            message: 'Failed to fetch GRNs',
                            error: err.message
                        });
                    }

                    const totalPages = Math.ceil(countResult.total / limitNum);

                    res.json({
                        success: true,
                        data: rows,
                        pagination: {
                            total: countResult.total,
                            page: pageNum,
                            limit: limitNum,
                            total_pages: totalPages,
                            has_next: pageNum < totalPages,
                            has_prev: pageNum > 1
                        },
                        filters: {
                            search,
                            status,
                            start_date,
                            end_date,
                            supplier_id,
                            order_number,
                            order_type
                        }
                    });
                });
            });

        } catch (error) {
            console.error('Error in getAll GRNs:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch GRNs',
                error: error.message
            });
        }
    }

    async create(req, res) {
        try {
            console.log('GRN Request Body:', JSON.stringify(req.body, null, 2));
            console.log('User Object:', req.user);
            
            const {
                po_id,
                retread_order_id,
                receipt_date,
                supplier_invoice_number,
                delivery_note_number,
                vehicle_number,
                driver_name,
                notes,
                items
            } = req.body;

            // Get user ID
            let received_by;
            if (req.user && req.user.id) {
                received_by = req.user.id;
            } else {
                console.warn('No authenticated user found, using default user ID');
                received_by = 1;
            }

            // Validate required fields
            if (!receipt_date || !items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Receipt date and items are required'
                });
            }

            // Check if either po_id or retread_order_id is provided
            if (!po_id && !retread_order_id) {
                return res.status(400).json({
                    success: false,
                    message: 'Either PO ID or Retread Order ID is required'
                });
            }

            // If it's a retread order, verify the order exists using direct DB query
            if (retread_order_id) {
                const orderExists = await this.retreadOrderExists(retread_order_id);
                if (!orderExists) {
                    return res.status(404).json({
                        success: false,
                        message: `Retread order with ID ${retread_order_id} not found`
                    });
                }
            }

            // If it's a purchase order, verify it exists
            if (po_id) {
                const orderExists = await PurchaseOrder.findById(po_id);
                if (!orderExists) {
                    return res.status(404).json({
                        success: false,
                        message: `Purchase order with ID ${po_id} not found`
                    });
                }
            }

            console.log('Validating items...');
            
            // Validate each item
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                console.log(`Item ${i + 1}:`, item);
                
                // Check for the appropriate item ID based on order type
                if (po_id && !item.po_item_id) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: po_item_id is required for purchase order GRN`
                    });
                }
                
                if (retread_order_id && !item.retread_order_item_id) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: retread_order_item_id is required for retread order GRN`
                    });
                }

                if (!item.quantity_received || item.quantity_received <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: positive quantity_received is required`
                    });
                }

                // Validate brand
                if (!item.brand || item.brand.trim() === '') {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: brand is required for received items`
                    });
                }

                // Validate serial numbers if provided
                if (item.serial_numbers && Array.isArray(item.serial_numbers)) {
                    console.log(`Item ${i + 1} has ${item.serial_numbers.length} serial numbers`);
                    
                    if (item.serial_numbers.length !== item.quantity_received) {
                        return res.status(400).json({
                            success: false,
                            message: `Item ${i + 1}: number of serial numbers (${item.serial_numbers.length}) must match quantity received (${item.quantity_received})`
                        });
                    }

                    // Check for duplicate serial numbers
                    const uniqueSerials = [...new Set(item.serial_numbers)];
                    if (uniqueSerials.length !== item.serial_numbers.length) {
                        return res.status(400).json({
                            success: false,
                            message: `Item ${i + 1}: duplicate serial numbers found`
                        });
                    }

                    // Validate serial numbers don't already exist (for purchase orders only)
                    if (po_id && item.po_item_id) {
                        try {
                            const isValid = await GoodsReceivedNote.validateSerialNumbers(
                                item.po_item_id, 
                                item.serial_numbers
                            );
                            if (!isValid) {
                                return res.status(400).json({
                                    success: false,
                                    message: `Item ${i + 1}: some serial numbers already exist in system`
                                });
                            }
                        } catch (error) {
                            console.error('Error validating serial numbers:', error);
                            return res.status(500).json({
                                success: false,
                                message: 'Failed to validate serial numbers'
                            });
                        }
                    }
                }
            }

            console.log('Creating GRN with data:', {
                po_id,
                retread_order_id,
                receipt_date,
                received_by,
                itemCount: items.length,
                items: items.map(item => ({ 
                    order_item_id: item.po_item_id || item.retread_order_item_id,
                    brand: item.brand,
                    quantity: item.quantity_received 
                }))
            });

            // Create GRN
            const grnData = {
                ...(po_id && { po_id }),
                ...(retread_order_id && { retread_order_id }),
                receipt_date,
                received_by,
                supplier_invoice_number,
                delivery_note_number,
                vehicle_number,
                driver_name,
                notes,
                items
            };

            const result = await GoodsReceivedNote.create(grnData);
            console.log('GRN created successfully:', result);

            // Update inventory for purchase orders only
            if (po_id) {
                await GoodsReceivedNote.updateInventory(result.grnId);
                await this.updateOrderStatusInternal(po_id, 'PURCHASE_ORDER');
            } else if (retread_order_id) {
                await this.updateRetreadOrderStatus(retread_order_id);
            }

            // Ensure brand is included in response
            const enhancedResult = {
                ...result,
                items: result.items.map((resultItem, index) => ({
                    ...resultItem,
                    brand: resultItem.brand || items[index]?.brand || '' // Get brand from request if missing
                }))
            };

            console.log('Enhanced GRN result with brand:', enhancedResult);

            res.status(201).json({
                success: true,
                message: 'Goods Received Note created successfully',
                data: enhancedResult
            });

        } catch (error) {
            console.error('Error creating GRN:', error);
            console.error('Error stack:', error.stack);
            res.status(500).json({
                success: false,
                message: 'Failed to create Goods Received Note',
                error: error.message
            });
        }
    }

    // Helper method to check if retread order exists
    async retreadOrderExists(orderId) {
        return new Promise((resolve, reject) => {
            db.get('SELECT id FROM retread_orders WHERE id = ?', [orderId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(!!row);
                }
            });
        });
    }

    // Helper method to update retread order status
    async updateRetreadOrderStatus(orderId) {
        const sql = `
            SELECT 
                ro.id,
                ro.status,
                COUNT(roi.id) as total_items,
                SUM(CASE WHEN roi.status = 'RECEIVED' THEN 1 ELSE 0 END) as received_items
            FROM retread_orders ro
            JOIN retread_order_items roi ON ro.id = roi.retread_order_id
            WHERE ro.id = ?
            GROUP BY ro.id`;

        return new Promise((resolve, reject) => {
            db.get(sql, [orderId], (err, ro) => {
                if (err) {
                    console.error('Error fetching retread order status:', err);
                    reject(err);
                    return;
                }

                console.log('Retread Order Status Update:', {
                    orderId,
                    currentStatus: ro?.status,
                    total_items: ro?.total_items,
                    received_items: ro?.received_items
                });

                if (!ro) {
                    reject(new Error('Retread order not found'));
                    return;
                }

                let newStatus = ro.status;
                if (ro.received_items >= ro.total_items) {
                    newStatus = 'COMPLETED';
                } else if (ro.received_items > 0) {
                    newStatus = 'IN_PROGRESS';
                }

                console.log(`Updating Retread Order ${orderId} status from ${ro.status} to ${newStatus}`);

                const updateSql = `UPDATE retread_orders SET status = ? WHERE id = ?`;
                db.run(updateSql, [newStatus, orderId], function(err) {
                    if (err) {
                        console.error('Error updating retread order status:', err);
                        reject(err);
                    } else {
                        console.log(`Retread order status updated. Changes: ${this.changes}`);
                        resolve(this.changes);
                    }
                });
            });
        });
    }

    async updateOrderStatusInternal(orderId, orderType) {
        if (orderType === 'PURCHASE_ORDER') {
            const sql = `
                SELECT 
                    po.id,
                    po.status,
                    SUM(poi.quantity) as total_quantity,
                    SUM(poi.received_quantity) as total_received
                FROM purchase_orders po
                JOIN purchase_order_items poi ON po.id = poi.po_id
                WHERE po.id = ?
                GROUP BY po.id`;

            return new Promise((resolve, reject) => {
                db.get(sql, [orderId], (err, po) => {
                    if (err) {
                        console.error('Error fetching PO status:', err);
                        reject(err);
                        return;
                    }

                    console.log('PO Status Update:', {
                        orderId,
                        currentStatus: po?.status,
                        total_quantity: po?.total_quantity,
                        total_received: po?.total_received
                    });

                    if (!po) {
                        reject(new Error('Purchase order not found'));
                        return;
                    }

                    let newStatus = po.status;
                    if (po.total_received >= po.total_quantity) {
                        newStatus = 'FULLY_RECEIVED';
                    } else if (po.total_received > 0) {
                        newStatus = 'PARTIALLY_RECEIVED';
                    }

                    console.log(`Updating PO ${orderId} status from ${po.status} to ${newStatus}`);

                    const updateSql = `UPDATE purchase_orders SET status = ? WHERE id = ?`;
                    db.run(updateSql, [newStatus, orderId], function(err) {
                        if (err) {
                            console.error('Error updating PO status:', err);
                            reject(err);
                        } else {
                            console.log(`PO status updated. Changes: ${this.changes}`);
                            resolve(this.changes);
                        }
                    });
                });
            });
        }
    }

    async getById(req, res) {
        try {
            const { id } = req.params;

            const grn = await GoodsReceivedNote.findById(id);
            if (!grn) {
                return res.status(404).json({
                    success: false,
                    message: 'GRN not found'
                });
            }

            const items = await GoodsReceivedNote.getItems(id);
            const tires = await GoodsReceivedNote.getTiresByGrn(id);

            res.json({
                success: true,
                data: {
                    ...grn,
                    items: items,
                    tires: tires
                }
            });

        } catch (error) {
            console.error('Error fetching GRN:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch GRN',
                error: error.message
            });
        }
    }

    async getByOrderId(req, res) {
        try {
            const { orderId } = req.params;
            const { order_type } = req.query; // 'PURCHASE_ORDER' or 'RETREAD_ORDER'

            if (!order_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Order type is required (PURCHASE_ORDER or RETREAD_ORDER)'
                });
            }

            const grns = await GoodsReceivedNote.findByOrderId(orderId, order_type);

            res.json({
                success: true,
                data: grns
            });

        } catch (error) {
            console.error('Error fetching GRNs:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch GRNs',
                error: error.message
            });
        }
    }

    async getReceiptPreview(req, res) {
        try {
            const { orderId } = req.params;
            const { order_type } = req.query; // 'PURCHASE_ORDER' or 'RETREAD_ORDER'

            if (!order_type) {
                return res.status(400).json({
                    success: false,
                    message: 'Order type is required (PURCHASE_ORDER or RETREAD_ORDER)'
                });
            }

            if (order_type === 'PURCHASE_ORDER') {
                // Get PO with items using the PurchaseOrder model
                const po = await PurchaseOrder.findById(orderId, true);
                if (!po) {
                    return res.status(404).json({
                        success: false,
                        message: 'Purchase order not found'
                    });
                }

                // Calculate remaining quantities for each item
                const items = po.items.map(item => ({
                    po_item_id: item.id,
                    size: item.size,
                    brand: item.brand,
                    model: item.model,
                    type: item.type,
                    ordered_quantity: item.quantity,
                    received_quantity: item.received_quantity || 0,
                    remaining_quantity: item.quantity - (item.received_quantity || 0),
                    unit_price: item.unit_price,
                    line_total: item.line_total
                }));

                // Filter out fully received items
                const receivableItems = items.filter(item => item.remaining_quantity > 0);

                res.json({
                    success: true,
                    data: {
                        order: {
                            id: po.id,
                            order_number: po.po_number,
                            order_type: 'PURCHASE_ORDER',
                            supplier_name: po.supplier_name,
                            order_date: po.po_date
                        },
                        items: receivableItems
                    }
                });
            } else if (order_type === 'RETREAD_ORDER') {
                // Get retread order with items directly from database
                const order = await this.getRetreadOrderWithItems(orderId);
                
                if (!order) {
                    return res.status(404).json({
                        success: false,
                        message: 'Retread order not found'
                    });
                }

                // For retread orders, all items are receivable (they haven't been received yet)
                const items = order.items.map(item => ({
                    retread_order_item_id: item.id,
                    tire_id: item.tire_id,
                    serial_number: item.serial_number,
                    size: item.size,
                    brand: item.brand,
                    model: item.model,
                    type: item.type,
                    ordered_quantity: 1, // Each retread order item is for one tire
                    received_quantity: item.status === 'RECEIVED' ? 1 : 0,
                    remaining_quantity: item.status === 'RECEIVED' ? 0 : 1,
                    estimated_cost: item.estimated_cost || 0
                }));

                // Filter out already received items
                const receivableItems = items.filter(item => item.remaining_quantity > 0);

                res.json({
                    success: true,
                    data: {
                        order: {
                            id: order.id,
                            order_number: order.order_number,
                            order_type: 'RETREAD_ORDER',
                            supplier_name: order.supplier_name,
                            order_date: order.order_date
                        },
                        items: receivableItems
                    }
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid order type'
                });
            }

        } catch (error) {
            console.error('Error getting receipt preview:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get receipt preview',
                error: error.message
            });
        }
    }

    // Helper method to get retread order with items
    async getRetreadOrderWithItems(orderId) {
        return new Promise((resolve, reject) => {
            // Get the order
            db.get(`
                SELECT 
                    ro.*,
                    s.name as supplier_name
                FROM retread_orders ro
                JOIN suppliers s ON ro.supplier_id = s.id
                WHERE ro.id = ?
            `, [orderId], (err, order) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                if (!order) {
                    resolve(null);
                    return;
                }

                // Get the items
                db.all(`
                    SELECT 
                        roi.*,
                        t.serial_number,
                        t.size,
                        t.brand,
                        t.model,
                        t.type,
                        t.status as tire_status
                    FROM retread_order_items roi
                    JOIN tires t ON roi.tire_id = t.id
                    WHERE roi.retread_order_id = ?
                `, [orderId], (err, items) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    order.items = items;
                    resolve(order);
                });
            });
        });
    }

    async updateInvoice(req, res) {
        try {
            const { id } = req.params;
            const {
                supplier_invoice_number,
                accounting_transaction_id
            } = req.body;

            if (!supplier_invoice_number || !accounting_transaction_id) {
                return res.status(400).json({ 
                    success: false,
                    message: "Missing required fields" 
                });
            }

            await GoodsReceivedNote.updateInvoiceNumber(id, supplier_invoice_number);

            res.json({ 
                success: true,
                message: "GRN invoice updated successfully"
            });
        } catch (err) {
            console.error("GRN invoice update failed:", err);
            res.status(500).json({ 
                success: false,
                message: "Failed to update GRN",
                error: err.message
            });
        }
    }

    async generateGrnNumber(req, res) {
        try {
            const { order_type } = req.query; // Optional: 'PURCHASE_ORDER' or 'RETREAD_ORDER'
            
            const grnNumber = await GoodsReceivedNote.generateGrnNumber();
            
            res.json({
                success: true,
                data: { 
                    grn_number: grnNumber,
                    order_type: order_type || null
                }
            });
        } catch (error) {
            console.error('Error generating GRN number:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to generate GRN number',
                error: error.message
            });
        }
    }
}

module.exports = GRNController;