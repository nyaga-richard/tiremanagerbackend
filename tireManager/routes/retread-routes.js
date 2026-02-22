const express = require('express');
const router = express.Router();
const retreadService = require('../services/retread-service');
const grnIntegrationService = require('../services/grn-integration-service');
const { PERMISSIONS } = require('../config/permissions-config');

// Store auth middleware instance
let authMiddleware;

// Function to set auth middleware instance
function setAuthMiddleware(authInstance) {
    authMiddleware = authInstance;
}

// Get available tires for retreading
router.get('/available-tires', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.RETREAD_ORDER.VIEW.code, 
        'view'
    )(req, res, next),
    async (req, res) => {
        try {
            const tires = await retreadService.getTiresForRetreading();
            
            // Log the action
            if (authMiddleware) {
                await authMiddleware.logAudit(
                    req.user.id,
                    'VIEW_AVAILABLE_TIRES',
                    'RETREAD',
                    null,
                    null,
                    { count: tires.length },
                    req
                );
            }
            
            res.json({
                success: true,
                data: tires
            });
        } catch (error) {
            console.error('Error getting available tires:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error getting available tires' 
            });
        }
    }
);

// Create retread order
router.post('/orders', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.RETREAD_ORDER.CREATE.code, 
        'create'
    )(req, res, next),
    async (req, res) => {
        try {
            const { supplier_id, order_date, expected_return_date, notes, terms, items } = req.body;
            
            // Validate required fields
            if (!supplier_id) {
                return res.status(400).json({
                    success: false,
                    error: 'Supplier ID is required'
                });
            }
            
            if (!order_date) {
                return res.status(400).json({
                    success: false,
                    error: 'Order date is required'
                });
            }
            
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one tire item is required'
                });
            }
            
            const result = await retreadService.createRetreadOrder(
                { 
                    supplier_id, 
                    order_date, 
                    expected_return_date, 
                    notes, 
                    terms, 
                    created_by: req.user.id 
                },
                items
            );
            
            // Log the action
            if (authMiddleware) {
                await authMiddleware.logAudit(
                    req.user.id,
                    'CREATE_RETREAD_ORDER',
                    'RETREAD_ORDER',
                    result.orderId,
                    null,
                    { order_number: result.orderNumber, items_count: items.length },
                    req
                );
            }
            
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error creating retread order:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error creating retread order' 
            });
        }
    }
);

// Get retread orders
router.get('/orders', 
    (req, res, next) => {
        console.log('GET /orders - Headers:', req.headers);
        console.log('GET /orders - User:', req.user);
        return authMiddleware?.authenticate(req, res, next);
    },
    (req, res, next) => {
        console.log('Permission check for orders');
        return authMiddleware?.checkPermission(
            PERMISSIONS.RETREAD_ORDER.VIEW.code, 
            'view'
        )(req, res, next);
    },
    async (req, res) => {
        console.log('Fetching retread orders...');
        try {
            const orders = await retreadService.getRetreadOrders(req.query);
            console.log(`Found ${orders.length} orders`);
            
            res.json({
                success: true,
                data: orders
            });
        } catch (error) {
            console.error('Error getting retread orders:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error getting retread orders' 
            });
        }
    }
);

// Get retread order details
router.get('/orders/:id', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.RETREAD_ORDER.VIEW.code, 
        'view'
    )(req, res, next),
    async (req, res) => {
        try {
            const order = await retreadService.getRetreadOrderDetails(req.params.id);
            
            if (!order) {
                return res.status(404).json({ 
                    success: false,
                    error: 'Retread order not found' 
                });
            }
            
            res.json({
                success: true,
                data: order
            });
        } catch (error) {
            console.error('Error getting order details:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error getting order details' 
            });
        }
    }
);

// Send retread order to retreader
router.post('/orders/:id/send', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.RETREAD_ORDER.EDIT.code, 
        'edit'
    )(req, res, next),
    async (req, res) => {
        try {
            // Check if user has approve permission for status change
            if (authMiddleware) {
                const permissionCheck = await authMiddleware.checkUserPermission(
                    req.user.id,
                    PERMISSIONS.RETREAD_ORDER.APPROVE.code,
                    'approve'
                );
                
                if (!permissionCheck.hasPermission) {
                    return res.status(403).json({
                        success: false,
                        error: 'Insufficient permissions to change order status',
                        code: 'PERMISSION_DENIED'
                    });
                }
            }
            
            const result = await retreadService.sendToRetreader(req.params.id, req.user.id);
            
            // Log the action
            if (authMiddleware) {
                await authMiddleware.logAudit(
                    req.user.id,
                    'SEND_RETREAD_ORDER',
                    'RETREAD_ORDER',
                    req.params.id,
                    null,
                    { action: 'sent_to_retreader' },
                    req
                );
            }
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error sending order to retreader:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error sending order to retreader' 
            });
        }
    }
);

// Receive retread order (Create RRN)
router.post('/orders/:id/receive', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.RETREAD_RECEIVING.CREATE.code, 
        'create'
    )(req, res, next),
    async (req, res) => {
        try {
            const { receipt_date, supplier_invoice_number, delivery_note_number, notes, items } = req.body;
            
            // Validate required fields
            if (!receipt_date) {
                return res.status(400).json({
                    success: false,
                    error: 'Receipt date is required'
                });
            }
            
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'At least one received item is required'
                });
            }
            
            // Check if user has reject permission for any rejected items
            if (authMiddleware) {
                const hasRejectedItems = items.some(item => item.received_type === 'REJECTED');
                if (hasRejectedItems) {
                    const rejectPermission = await authMiddleware.checkUserPermission(
                        req.user.id,
                        PERMISSIONS.RETREAD_RECEIVING.REJECT.code,
                        'create'
                    );
                    
                    if (!rejectPermission.hasPermission) {
                        return res.status(403).json({
                            success: false,
                            error: 'Insufficient permissions to reject tires',
                            code: 'PERMISSION_DENIED'
                        });
                    }
                }
            }
            
            const result = await retreadService.receiveRetreadOrder(
                req.params.id,
                { 
                    receipt_date, 
                    received_by: req.user.id, 
                    supplier_invoice_number, 
                    delivery_note_number, 
                    notes 
                },
                items
            );
            
            // Log the action
            if (authMiddleware) {
                await authMiddleware.logAudit(
                    req.user.id,
                    'RECEIVE_RETREAD_ORDER',
                    'RETREAD_RECEIVING',
                    result.rrnId,
                    null,
                    { 
                        order_id: req.params.id,
                        rrn_number: result.rrnNumber,
                        received: result.summary.received,
                        rejected: result.summary.rejected
                    },
                    req
                );
            }
            
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error receiving retread order:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error receiving retread order' 
            });
        }
    }
);

// Create GRN from RRN (Accounting Integration)
router.post('/rrn/:rrnId/create-grn', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.GRN_MANAGEMENT.CREATE.code, 
        'create'
    )(req, res, next),
    async (req, res) => {
        try {
            // Check if user has accounting permissions
            if (authMiddleware) {
                const accountingPermission = await authMiddleware.checkUserPermission(
                    req.user.id,
                    PERMISSIONS.ACCOUNTING.CREATE.code,
                    'create'
                );
                
                if (!accountingPermission.hasPermission) {
                    return res.status(403).json({
                        success: false,
                        error: 'Insufficient permissions to create accounting entries',
                        code: 'PERMISSION_DENIED'
                    });
                }
            }
            
            const result = await grnIntegrationService.createGRNFromRRN(req.params.rrnId, req.user.id);
            
            // Log the action
            if (authMiddleware) {
                await authMiddleware.logAudit(
                    req.user.id,
                    'CREATE_GRN_FROM_RRN',
                    'GRN',
                    result.grnId,
                    null,
                    { 
                        rrn_id: req.params.rrnId,
                        grn_number: result.grnNumber,
                        transaction_id: result.transactionId
                    },
                    req
                );
            }
            
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('Error creating GRN from RRN:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error creating GRN from RRN' 
            });
        }
    }
);

// Get GRNs from retread receipts
router.get('/grns', 
    (req, res, next) => authMiddleware?.authenticate(req, res, next),
    (req, res, next) => authMiddleware?.checkPermission(
        PERMISSIONS.GRN_MANAGEMENT.VIEW.code, 
        'view'
    )(req, res, next),
    async (req, res) => {
        try {
            const grns = await grnIntegrationService.getRetreadGRNs();
            
            res.json({
                success: true,
                data: grns
            });
        } catch (error) {
            console.error('Error getting retread GRNs:', error);
            res.status(500).json({ 
                success: false,
                error: error.message || 'Error getting retread GRNs' 
            });
        }
    }
);

// Export the router and the setter function
module.exports = router;
module.exports.setAuthMiddleware = setAuthMiddleware;