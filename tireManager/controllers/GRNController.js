const GoodsReceivedNote = require('../models/GoodsReceivedNote');
const PurchaseOrder = require('../models/PurchaseOrder');
const db = require('../config/database');

class GRNController {
    constructor() {
        // Bind methods to maintain context
        this.create = this.create.bind(this);
        this.getById = this.getById.bind(this);
        this.getAll = this.getAll.bind(this);
        this.getByPoId = this.getByPoId.bind(this);
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
                po_number,
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
                     po.po_number LIKE ? OR 
                     s.name LIKE ? OR 
                     s.id LIKE ? OR 
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
                whereConditions.push('po.supplier_id = ?');
                params.push(supplier_id);
            }

            if (po_number) {
                whereConditions.push('po.po_number = ?');
                params.push(po_number);
            }

            const whereClause = whereConditions.length > 0 
                ? `WHERE ${whereConditions.join(' AND ')}` 
                : '';

            // Validate sort order
            const validSortColumns = ['receipt_date', 'created_at', 'grn_number', 'po_number', 'supplier_name'];
            const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'receipt_date';
            const orderDirection = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

            // Count total records
            const countSql = `
                SELECT COUNT(*) as total
                FROM goods_received_notes grn
                JOIN purchase_orders po ON grn.po_id = po.id
                JOIN suppliers s ON po.supplier_id = s.id
                ${whereClause}`;

            // Get paginated data
            const dataSql = `
                SELECT 
                    grn.*,
                    po.po_number,
                    s.name as supplier_name,
                    s.id as supplier_code,
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
                JOIN purchase_orders po ON grn.po_id = po.id
                JOIN suppliers s ON po.supplier_id = s.id
                LEFT JOIN users u ON grn.received_by = u.id
                ${whereClause}
                ORDER BY ${sortColumn} ${orderDirection}
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
                            po_number
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
                receipt_date,
                supplier_invoice_number,
                delivery_note_number,
                vehicle_number,
                driver_name,
                notes,
                items
            } = req.body;

            // Get user ID - handle both authenticated and non-authenticated scenarios
            let received_by;
            if (req.user && req.user.id) {
                received_by = req.user.id;
            } else {
                // Fallback for testing or development
                console.warn('No authenticated user found, using default user ID');
                received_by = 1; // Default admin user ID
            }

            // Validate required fields
            if (!po_id || !receipt_date || !items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'PO ID, receipt date, and items are required'
                });
            }

            console.log('Validating items...');
            
            // Validate each item
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                console.log(`Item ${i + 1}:`, item);
                
                if (!item.po_item_id || !item.quantity_received || item.quantity_received <= 0) {
                    return res.status(400).json({
                        success: false,
                        message: `Item ${i + 1}: po_item_id and positive quantity_received are required`
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

                    // Validate serial numbers don't already exist
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

            console.log('Creating GRN with data:', {
                po_id,
                receipt_date,
                received_by,
                itemCount: items.length
            });

            // Create GRN
            const grnData = {
                po_id,
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

            // Update inventory
            await GoodsReceivedNote.updateInventory(result.grnId);

            // Update PO status - fix: use a regular function instead of this.updatePoStatus
            await this.updatePoStatusInternal(po_id);

            res.status(201).json({
                success: true,
                message: 'Goods Received Note created successfully',
                data: result
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

    // Rename the method to avoid confusion
    async updatePoStatusInternal(poId) {
        const db = require('../config/database');
        
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
            db.get(sql, [poId], (err, po) => {
                if (err) {
                    console.error('Error fetching PO status:', err);
                    reject(err);
                    return;
                }

                console.log('PO Status Update:', {
                    poId,
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

                console.log(`Updating PO ${poId} status from ${po.status} to ${newStatus}`);

                const updateSql = `UPDATE purchase_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
                db.run(updateSql, [newStatus, poId], function(err) {
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

    async getByPoId(req, res) {
        try {
            const { poId } = req.params;

            const grns = await GoodsReceivedNote.findByPoId(poId);

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
            const { poId } = req.params;

            // Get PO with items
            const po = await PurchaseOrder.findById(poId, true);
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
                    po: {
                        id: po.id,
                        po_number: po.po_number,
                        supplier_name: po.supplier_name,
                        po_date: po.po_date
                    },
                    items: receivableItems
                }
            });

        } catch (error) {
            console.error('Error getting receipt preview:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get receipt preview',
                error: error.message
            });
        }
    }

    async updateInvoice(req, res) {
        try {
            const { id } = req.params;
            const {
            supplier_invoice_number,
            accounting_transaction_id
            } = req.body;

            if (!supplier_invoice_number || !accounting_transaction_id) {
            return res.status(400).json({ message: "Missing required fields" });
            }

            await this.grnModel.updateInvoice(id, {
            supplier_invoice_number,
            accounting_transaction_id,
            invoice_status: "POSTED"
            });

            res.json({ success: true });
        } catch (err) {
            console.error("GRN invoice update failed:", err);
            res.status(500).json({ message: "Failed to update GRN" });
        }
        }


    async generateGrnNumber(req, res) {
        try {
            const grnNumber = await GoodsReceivedNote.generateGrnNumber();
            
            res.json({
                success: true,
                data: { grn_number: grnNumber }
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