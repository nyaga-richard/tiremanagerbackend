const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { promisify } = require('util');

/* =========================
   PROMISE WRAPPERS
========================= */

const runAsync = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });

const getAsync = promisify(db.get.bind(db));
const allAsync = promisify(db.all.bind(db));

/* =========================
   HELPER FUNCTIONS
========================= */

const generateOrderNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RTD-${year}${month}-${random}`;
};

/* =========================
   GET /api/tires/retread/eligible
========================= */

router.get('/tires/retread/eligible', async (req, res) => {
    try {
        const tires = await allAsync(`
            SELECT 
                t.*,
                s.name as supplier_name,
                COUNT(DISTINCT ta.id) as installation_count,
                COALESCE(SUM(ta.removal_odometer - ta.install_odometer), 0) as total_distance,
                COALESCE(t.retread_count, 0) as previous_retread_count
            FROM tires t
            LEFT JOIN tire_assignments ta ON t.id = ta.tire_id
            LEFT JOIN suppliers s ON t.supplier_id = s.id
            WHERE t.status IN ('USED_STORE', 'AWAITING_RETREAD')
            GROUP BY t.id
            ORDER BY t.created_at DESC
        `);
        
        res.json({ success: true, data: tires });
    } catch (error) {
        console.error('Error fetching eligible tires:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/retread-orders
========================= */

router.get('/retread-orders', async (req, res) => {
    try {
        const { search, status, supplier_id, from_date, to_date, sort_by, sort_order, page, limit } = req.query;
        
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const offset = (pageNum - 1) * limitNum;
        
        let countQuery = `
            SELECT COUNT(DISTINCT ro.id) as total
            FROM retread_orders ro
            JOIN suppliers s ON ro.supplier_id = s.id
        `;
        
        let dataQuery = `
            SELECT 
                ro.*,
                s.name as supplier_name,
                u.username as created_by_name,
                COUNT(DISTINCT roi.id) as total_tires,
                SUM(CASE WHEN roi.status = 'RECEIVED' THEN 1 ELSE 0 END) as received_tires
            FROM retread_orders ro
            JOIN suppliers s ON ro.supplier_id = s.id
            LEFT JOIN users u ON ro.created_by = u.id
            LEFT JOIN retread_order_items roi ON ro.id = roi.retread_order_id
        `;
        
        const whereClauses = [];
        const params = [];
        
        if (search) {
            whereClauses.push(`(ro.order_number LIKE ? OR s.name LIKE ? OR ro.notes LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }
        
        if (status && status !== 'all') {
            whereClauses.push(`ro.status = ?`);
            params.push(status);
        }
        
        if (supplier_id && supplier_id !== 'all') {
            whereClauses.push(`ro.supplier_id = ?`);
            params.push(supplier_id);
        }
        
        if (from_date) {
            whereClauses.push(`DATE(ro.created_at) >= DATE(?)`);
            params.push(from_date);
        }
        
        if (to_date) {
            whereClauses.push(`DATE(ro.created_at) <= DATE(?)`);
            params.push(to_date);
        }
        
        if (whereClauses.length > 0) {
            const whereString = ' WHERE ' + whereClauses.join(' AND ');
            countQuery += whereString;
            dataQuery += whereString;
        }
        
        const countResult = await getAsync(countQuery, params);
        const total = countResult?.total || 0;
        const pages = Math.ceil(total / limitNum);
        
        const validSortColumns = ['created_at', 'expected_completion_date', 'total_cost', 'order_number'];
        const sortColumn = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
        const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';
        
        dataQuery += ` GROUP BY ro.id ORDER BY ro.${sortColumn} ${sortDirection} LIMIT ? OFFSET ?`;
        params.push(limitNum, offset);
        
        const orders = await allAsync(dataQuery, params);
        
        res.json({ 
            success: true, 
            data: orders,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total: total,
                pages: pages
            }
        });
    } catch (error) {
        console.error('Error fetching retread orders:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   POST /api/retread-orders
========================= */

router.post('/retread-orders', async (req, res) => {
    const { supplier_id, tire_ids, expected_completion_date, notes } = req.body;
    const user_id = req.body.user_id || 1;

    if (!supplier_id || !tire_ids || tire_ids.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Supplier ID and at least one tire are required'
        });
    }

    await runAsync('BEGIN TRANSACTION');

    try {
        const order_number = generateOrderNumber();

        // Verify supplier exists
        const supplier = await getAsync('SELECT id FROM suppliers WHERE id = ?', [supplier_id]);
        if (!supplier) {
            throw new Error(`Supplier with ID ${supplier_id} not found`);
        }

        // Insert Order
        const result = await runAsync(
            `INSERT INTO retread_orders
            (order_number, supplier_id, status, expected_completion_date, notes, created_by, total_tires, created_at, updated_at)
            VALUES (?, ?, 'DRAFT', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
                order_number,
                supplier_id,
                expected_completion_date || null,
                notes || null,
                user_id,
                tire_ids.length
            ]
        );

        const order_id = result.lastID;

        if (!order_id) {
            throw new Error('Failed to create order - no ID returned');
        }

        // Add Tires
        for (const tire_id of tire_ids) {
            const tire = await getAsync('SELECT id FROM tires WHERE id = ?', [tire_id]);

            if (!tire) {
                throw new Error(`Tire with ID ${tire_id} not found`);
            }

            // Check if tire is already in another order
            const existingItem = await getAsync(
                'SELECT id FROM retread_order_items WHERE tire_id = ? AND retread_order_id != ?',
                [tire_id, order_id]
            );

            if (existingItem) {
                throw new Error(`Tire ${tire_id} is already in another retread order`);
            }

            await runAsync(
                `INSERT INTO retread_order_items
                (retread_order_id, tire_id, status, created_at)
                VALUES (?, ?, 'PENDING', CURRENT_TIMESTAMP)`,
                [order_id, tire_id]
            );

            await runAsync(
                `UPDATE tires
                 SET status = 'AWAITING_RETREAD',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?`,
                [tire_id]
            );
        }

        // Timeline Entry
        await runAsync(
            `INSERT INTO retread_timeline
             (retread_order_id, status, note, user_id, created_at)
             VALUES (?, 'DRAFT', 'Order created', ?, CURRENT_TIMESTAMP)`,
            [order_id, user_id]
        );

        await runAsync('COMMIT');

        // Fetch Full Order
        const newOrder = await getAsync(
            `SELECT ro.*, s.name as supplier_name, u.username as created_by_name
             FROM retread_orders ro
             JOIN suppliers s ON ro.supplier_id = s.id
             JOIN users u ON ro.created_by = u.id
             WHERE ro.id = ?`,
            [order_id]
        );

        const orderTires = await allAsync(
            `SELECT t.*, roi.status as item_status, roi.cost, roi.notes as item_notes
             FROM retread_order_items roi
             JOIN tires t ON roi.tire_id = t.id
             WHERE roi.retread_order_id = ?`,
            [order_id]
        );

        res.status(201).json({
            success: true,
            data: {
                ...newOrder,
                tires: orderTires
            },
            message: 'Retread order created successfully'
        });

    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error creating retread order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* =========================
   GET /api/retread/retread-orders/:id
========================= */

router.get('/retread-orders/:id', async (req, res) => {
    try {
        const order = await getAsync(`
            SELECT 
                ro.*,
                s.id as supplier_id,
                s.name as supplier_name,
                s.contact_person,
                s.phone,
                s.email,
                s.address,
                u.username as created_by_name
            FROM retread_orders ro
            JOIN suppliers s ON ro.supplier_id = s.id
            JOIN users u ON ro.created_by = u.id
            WHERE ro.id = ?
        `, [req.params.id]);
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        const tires = await allAsync(`
            SELECT 
                roi.id AS order_item_id,
                t.*,
                roi.cost,
                roi.notes as item_notes,
                roi.status as item_status
            FROM retread_order_items roi
            JOIN tires t ON roi.tire_id = t.id
            WHERE roi.retread_order_id = ?
        `, [req.params.id]);
        
        const timeline = await allAsync(`
            SELECT 
                rt.*,
                u.username as user
            FROM retread_timeline rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.retread_order_id = ?
            ORDER BY rt.created_at ASC
        `, [req.params.id]);
        
        // Format the tires array to include order_item_id at the top level
        const formattedTires = tires.map(t => ({
            ...t,
            order_item_id: t.order_item_id  // Ensure this is at the top level
        }));
        
        const response = {
            ...order,
            supplier: {
                id: order.supplier_id,
                name: order.supplier_name,
                contact_person: order.contact_person,
                phone: order.phone,
                email: order.email,
                address: order.address
            },
            tires: formattedTires,
            timeline,
            created_by: order.created_by_name
        };
        
        delete response.supplier_id;
        delete response.supplier_name;
        delete response.contact_person;
        delete response.phone;
        delete response.email;
        delete response.address;
        delete response.created_by_name;
        
        res.json({ success: true, data: response });
    } catch (error) {
        console.error('Error fetching order details:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/retread-orders/number/:orderNumber
========================= */

router.get('/retread-orders/number/:orderNumber', async (req, res) => {
    try {
        const order = await getAsync(`
            SELECT 
                ro.*,
                s.id as supplier_id,
                s.name as supplier_name,
                s.contact_person,
                s.phone,
                s.email,
                u.username as created_by_name
            FROM retread_orders ro
            JOIN suppliers s ON ro.supplier_id = s.id
            JOIN users u ON ro.created_by = u.id
            WHERE ro.order_number = ?
        `, [req.params.orderNumber]);
        
        if (!order) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        const tires = await allAsync(`
            SELECT 
                t.*,
                roi.cost,
                roi.notes as item_notes,
                roi.status as item_status
            FROM retread_order_items roi
            JOIN tires t ON roi.tire_id = t.id
            WHERE roi.retread_order_id = ?
        `, [order.id]);
        
        const timeline = await allAsync(`
            SELECT 
                rt.*,
                u.username as user
            FROM retread_timeline rt
            JOIN users u ON rt.user_id = u.id
            WHERE rt.retread_order_id = ?
            ORDER BY rt.created_at ASC
        `, [order.id]);
        
        const response = {
            ...order,
            supplier: {
                id: order.supplier_id,
                name: order.supplier_name,
                contact_person: order.contact_person,
                phone: order.phone,
                email: order.email,
                address: order.address
            },
            tires,
            timeline,
            created_by: order.created_by_name
        };
        
        delete response.supplier_id;
        delete response.supplier_name;
        delete response.contact_person;
        delete response.phone;
        delete response.email;
        delete response.address;
        delete response.created_by_name;
        
        res.json({ success: true, data: response });
    } catch (error) {
        console.error('Error fetching order by number:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/retread/retread-orders/:id/receive
========================= */

router.get('/retread-orders/:id/receive', async (req, res) => {
    try {
        const order = await getAsync(`
            SELECT id, order_number, supplier_id
            FROM retread_orders
            WHERE id = ? 
            AND status IN ('SENT', 'IN_PROGRESS', 'COMPLETED')
        `, [req.params.id]);

        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found or not ready for receiving'
            });
        }

        const tires = await allAsync(`
            SELECT 
                roi.id AS order_item_id,
                t.id AS tire_id,
                t.serial_number,
                t.size,
                t.brand,
                t.model,
                t.retread_count AS previous_retread_count,
                roi.notes AS order_notes
            FROM retread_order_items roi
            JOIN tires t ON roi.tire_id = t.id
            WHERE roi.retread_order_id = ?
            AND roi.status IN ('PENDING', 'SENT')
        `, [req.params.id]);

        // Format the response
        const formattedTires = tires.map(t => ({
            order_item_id: t.order_item_id,
            tire_id: t.tire_id,              
            serial_number: t.serial_number,
            size: t.size,
            brand: t.brand,
            model: t.model || '',
            previous_retread_count: t.previous_retread_count || 0,
            estimated_cost: t.estimated_cost || 0,
            tread_depth_new: 16,  // Default value for new retread depth
            status: 'PENDING'
        }));

        res.json({
            success: true,
            data: {
                order_id: order.id,
                order_number: order.order_number,
                supplier_id: order.supplier_id,
                supplier_name: '', // You might want to fetch this separately if needed
                tires: formattedTires
            }
        });

    } catch (error) {
        console.error('Error fetching receiving data:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


/* =========================
   POST /api/retread-orders/:id/receive
========================= */

router.post('/retread-orders/:id/receive', async (req, res) => {
    const { received_date, notes, tires } = req.body;
    const user_id = req.body.user_id || 1;

    if (!tires || tires.length === 0) {
        return res.status(400).json({ success: false, error: 'Tires data is required' });
    }

    await runAsync('BEGIN TRANSACTION');

    try {
        // Create retread receiving record
        const receivingResult = await runAsync(
            `INSERT INTO retread_receiving 
             (retread_order_id, received_date, received_by, notes, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                req.params.id,
                received_date || new Date().toISOString().split('T')[0],
                user_id,
                notes || null
            ]
        );
        const receiving_id = receivingResult.lastID;

        let receivedCount = 0;
        let rejectedCount = 0;
        let totalCost = 0;

        for (const tire of tires) {
            const tireId = tire.tire_id || tire.id;
            if (!tireId) throw new Error("Invalid tire data: tire_id missing");

            // Insert into retread_received_items
            await runAsync(
                `INSERT INTO retread_received_items 
                (receiving_id, tire_id, received_depth, quality, status, notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [
                    receiving_id,
                    tireId,
                    tire.received_depth || null,
                    tire.quality || 'GOOD',
                    tire.status || 'RECEIVED',
                    tire.notes || null
                ]
            );

            // Update retread_order_items
            await runAsync(
                `UPDATE retread_order_items SET 
                 status = ?, 
                 cost = ?, 
                 notes = ?
                 WHERE retread_order_id = ? AND tire_id = ?`,
                [
                    tire.status || 'RECEIVED',
                    tire.cost || 0,
                    tire.notes || null,
                    req.params.id,
                    tireId
                ]
            );

            if (tire.status === 'RECEIVED') {
                receivedCount++;
                totalCost += parseFloat(tire.cost || 0);

                await runAsync(
                    `UPDATE tires SET 
                     status = 'USED_STORE', 
                     retread_count = COALESCE(retread_count, 0) + 1,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [tireId]
                );

                await runAsync(
                    `INSERT INTO tire_movements 
                     (tire_id, from_location, to_location, movement_type, user_id, notes, created_at)
                     VALUES (?, 'AT_RETREAD_SUPPLIER', 'USED_STORE', 'RETREAD_SUPPLIER_TO_STORE', ?, ?, CURRENT_TIMESTAMP)`,
                    [tireId, user_id, notes || 'Returned from retreading']
                );

            } else if (tire.status === 'REJECTED') {
                rejectedCount++;

                console.log("BEFORE DISPOSAL UPDATE:", await runAsync(`SELECT * FROM tires WHERE id = ?`, [tireId]));

                await runAsync(
                    `UPDATE tires SET
                     status = 'DISPOSED',
                     type = 'RETREADED',
                     retread_count = COALESCE(retread_count, 0) + 1,
                     disposal_date = date('now'),
                     disposal_reason = 'RETREAD REJECT',
                     disposal_method = 'DISPOSAL',
                     disposal_authorized_by = ?,
                     disposal_notes = ?,
                     updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        user_id,
                        tire.notes || 'Rejected during retread receiving',
                        tireId
                    ]
                );

                console.log("AFTER DISPOSAL UPDATE:", await runAsync(`SELECT * FROM tires WHERE id = ?`, [tireId]));

                await runAsync(
                    `INSERT INTO tire_movements 
                     (tire_id, from_location, to_location, movement_type, user_id, notes, created_at)
                     VALUES (?, 'AT_RETREAD_SUPPLIER', 'DISPOSED', 'STORE_TO_DISPOSAL', ?, ?, CURRENT_TIMESTAMP)`,
                    [tireId, user_id, tire.notes || 'Rejected during retread receiving']
                );
            }
        }

        // Determine new status
        let newStatus;
        if (rejectedCount === 0 && receivedCount > 0) newStatus = 'RECEIVED';
        else if (rejectedCount > 0 && receivedCount > 0) newStatus = 'PARTIALLY_RECEIVED';
        else newStatus = 'COMPLETED';

        // Check if any tires remain pending
        const pendingResult = await runAsync(
            `SELECT COUNT(*) as count 
             FROM retread_order_items 
             WHERE retread_order_id = ? AND status NOT IN ('RECEIVED','REJECTED')`,
            [req.params.id]
        );

        const pendingCount = pendingResult && pendingResult.count != null ? pendingResult.count : 0;
        if (pendingCount === 0) newStatus = 'COMPLETED';

        // Update retread_orders
        await runAsync(
            `UPDATE retread_orders 
             SET status = ?, 
                 received_date = ?, 
                 total_cost = ?
             WHERE id = ?`,
            [newStatus, received_date || new Date().toISOString().split('T')[0], totalCost, req.params.id]
        );

        // Add timeline entry
        await runAsync(
            `INSERT INTO retread_timeline (retread_order_id, status, note, user_id, created_at)
             VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
                req.params.id,
                newStatus,
                `Order received: ${receivedCount} tires received, ${rejectedCount} rejected`,
                user_id
            ]
        );

        // Debug logs for all rejected tires
        for (const tire of tires.filter(t => t.status === 'REJECTED')) {
            console.log("FINAL TIRE STATE BEFORE COMMIT:", await runAsync(`SELECT * FROM tires WHERE id = ?`, [tire.tire_id || tire.id]));
        }

        await runAsync('COMMIT');

        res.json({ 
            success: true, 
            message: `Successfully received ${receivedCount} tires${rejectedCount > 0 ? `, ${rejectedCount} rejected` : ''}`,
            data: { receivedCount, rejectedCount, newStatus, totalCost }
        });

    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error receiving order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   PUT /api/retread-orders/:id/send
========================= */

router.put('/retread-orders/:id/send', async (req, res) => {
    const user_id = req.body.user_id || 1;
    
    await runAsync('BEGIN TRANSACTION');
    
    try {
        const order = await getAsync(
            'SELECT id FROM retread_orders WHERE id = ? AND status = ?',
            [req.params.id, 'DRAFT']
        );
        
        if (!order) {
            await runAsync('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'Order not found or cannot be sent' 
            });
        }
        
        await runAsync(
            `UPDATE retread_orders SET 
             status = 'SENT', 
             sent_date = CURRENT_DATE
             WHERE id = ?`,
            [req.params.id]
        );
        
        const tires = await allAsync(
            `SELECT tire_id FROM retread_order_items WHERE retread_order_id = ?`,
            [req.params.id]
        );
        
        for (const { tire_id } of tires) {
            await runAsync(
                `UPDATE tires SET status = 'AT_RETREAD_SUPPLIER' WHERE id = ?`,
                [tire_id]
            );
            
            await runAsync(
                `INSERT INTO tire_movements 
                 (tire_id, from_location, to_location, movement_type, user_id, notes, created_at)
                 VALUES (?, 'USED_STORE', 'AT_RETREAD_SUPPLIER', 'STORE_TO_RETREAD_SUPPLIER', ?, 'Sent for retreading', CURRENT_TIMESTAMP)`,
                [tire_id, user_id]
            );
            
            await runAsync(
                `UPDATE retread_order_items SET status = 'SENT'
                 WHERE retread_order_id = ? AND tire_id = ?`,
                [req.params.id, tire_id]
            );
        }
        
        await runAsync(
            `INSERT INTO retread_timeline (retread_order_id, status, note, user_id, created_at)
             VALUES (?, 'SENT', 'Order sent to supplier', ?, CURRENT_TIMESTAMP)`,
            [req.params.id, user_id]
        );
        
        await runAsync('COMMIT');
        
        res.json({ success: true, message: 'Order marked as sent' });
    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error sending order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   PUT /api/retread-orders/:id/cancel
========================= */

router.put('/retread-orders/:id/cancel', async (req, res) => {
    const user_id = req.body.user_id || 1;
    
    await runAsync('BEGIN TRANSACTION');
    
    try {
        const order = await getAsync(
            'SELECT status FROM retread_orders WHERE id = ?',
            [req.params.id]
        );
        
        if (!order) {
            await runAsync('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        if (!['DRAFT', 'SENT'].includes(order.status)) {
            await runAsync('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'Only draft or sent orders can be cancelled' 
            });
        }
        
        await runAsync(
            `UPDATE retread_orders SET 
             status = 'CANCELLED', 
             updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [req.params.id]
        );
        
        const tires = await allAsync(
            `SELECT tire_id FROM retread_order_items WHERE retread_order_id = ?`,
            [req.params.id]
        );
        
        for (const { tire_id } of tires) {
            await runAsync(
                `UPDATE tires SET status = 'USED_STORE', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [tire_id]
            );
        }
        
        await runAsync(
            `INSERT INTO retread_timeline (retread_order_id, status, note, user_id, created_at)
             VALUES (?, 'CANCELLED', 'Order cancelled', ?, CURRENT_TIMESTAMP)`,
            [req.params.id, user_id]
        );
        
        await runAsync('COMMIT');
        
        res.json({ success: true, message: 'Order cancelled successfully' });
    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error cancelling order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   DELETE /api/retread-orders/:id
========================= */

router.delete('/retread-orders/:id', async (req, res) => {
    await runAsync('BEGIN TRANSACTION');
    
    try {
        const order = await getAsync(
            'SELECT status FROM retread_orders WHERE id = ?',
            [req.params.id]
        );
        
        if (!order) {
            await runAsync('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        if (order.status !== 'DRAFT') {
            await runAsync('ROLLBACK');
            return res.status(400).json({ 
                success: false, 
                error: 'Only draft orders can be deleted' 
            });
        }
        
        const tires = await allAsync(
            `SELECT tire_id FROM retread_order_items WHERE retread_order_id = ?`,
            [req.params.id]
        );
        
        for (const { tire_id } of tires) {
            await runAsync(
                `UPDATE tires SET status = 'USED_STORE', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [tire_id]
            );
        }
        
        await runAsync(`DELETE FROM retread_order_items WHERE retread_order_id = ?`, [req.params.id]);
        await runAsync(`DELETE FROM retread_timeline WHERE retread_order_id = ?`, [req.params.id]);
        await runAsync(`DELETE FROM retread_orders WHERE id = ?`, [req.params.id]);
        
        await runAsync('COMMIT');
        
        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error deleting order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   POST /api/retread-orders/:id/duplicate
========================= */

router.post('/retread-orders/:id/duplicate', async (req, res) => {
    const user_id = req.body.user_id || 1;
    
    await runAsync('BEGIN TRANSACTION');
    
    try {
        const originalOrder = await getAsync(`
            SELECT supplier_id, notes
            FROM retread_orders
            WHERE id = ?
        `, [req.params.id]);
        
        if (!originalOrder) {
            await runAsync('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Order not found' });
        }
        
        const tires = await allAsync(
            `SELECT tire_id FROM retread_order_items WHERE retread_order_id = ?`,
            [req.params.id]
        );
        
        if (tires.length === 0) {
            await runAsync('ROLLBACK');
            return res.status(400).json({ success: false, error: 'No tires found in original order' });
        }
        
        const order_number = generateOrderNumber();
        
        const result = await runAsync(
            `INSERT INTO retread_orders 
             (order_number, supplier_id, status, notes, created_by, total_tires, created_at, updated_at)
             VALUES (?, ?, 'DRAFT', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [order_number, originalOrder.supplier_id, `Duplicated from order #${req.params.id}\n${originalOrder.notes || ''}`, user_id, tires.length]
        );
        
        const newOrderId = result.lastID;
        
        for (const { tire_id } of tires) {
            await runAsync(
                `INSERT INTO retread_order_items (retread_order_id, tire_id, status, created_at) 
                 VALUES (?, ?, 'PENDING', CURRENT_TIMESTAMP)`,
                [newOrderId, tire_id]
            );
        }
        
        await runAsync(
            `INSERT INTO retread_timeline (retread_order_id, status, note, user_id, created_at)
             VALUES (?, 'DRAFT', 'Order duplicated from order #' || ?, ?, CURRENT_TIMESTAMP)`,
            [newOrderId, req.params.id, user_id]
        );
        
        await runAsync('COMMIT');
        
        res.json({ 
            success: true, 
            message: 'Order duplicated successfully',
            data: { new_order_id: newOrderId }
        });
    } catch (error) {
        await runAsync('ROLLBACK');
        console.error('Error duplicating order:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/tires/retread/status
========================= */

router.get('/tires/retread/status', async (req, res) => {
    try {
        const movements = await allAsync(`
            SELECT 
                tm.*,
                t.serial_number,
                t.size,
                t.brand,
                t.type,
                t.status,
                s.name as supplier_name,
                v.vehicle_number,
                u.username as processed_by
            FROM tire_movements tm
            JOIN tires t ON tm.tire_id = t.id
            LEFT JOIN suppliers s ON tm.supplier_id = s.id
            LEFT JOIN vehicles v ON tm.vehicle_id = v.id
            LEFT JOIN users u ON tm.user_id = u.id
            WHERE tm.movement_type IN ('STORE_TO_RETREAD_SUPPLIER', 'RETREAD_SUPPLIER_TO_STORE')
            ORDER BY tm.created_at DESC
            LIMIT 50
        `);
        
        res.json({ success: true, data: movements });
    } catch (error) {
        console.error('Error fetching retread movements:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/tires/retread/cost-analysis
========================= */

router.get('/tires/retread/cost-analysis', async (req, res) => {
    try {
        const suppliers = await allAsync(`
            SELECT 
                s.*,
                COUNT(DISTINCT ro.id) as total_orders,
                SUM(ro.total_tires) as total_tires_processed,
                AVG(ro.total_cost / NULLIF(ro.total_tires, 0)) as average_cost_per_tire,
                AVG(JULIANDAY(ro.received_date) - JULIANDAY(ro.sent_date)) as avg_turnaround_days
            FROM suppliers s
            LEFT JOIN retread_orders ro ON s.id = ro.supplier_id
            WHERE s.type = 'RETREAD'
            GROUP BY s.id
            ORDER BY total_orders DESC
        `);
        
        res.json({ success: true, suppliers });
    } catch (error) {
        console.error('Error fetching cost analysis:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/* =========================
   GET /api/retread/test-setup
========================= */

router.get('/test-retread-setup', async (req, res) => {
    try {
        const results = {};
        
        const tables = ['retread_orders', 'retread_order_items', 'retread_timeline', 'suppliers', 'tires'];
        
        for (const table of tables) {
            const tableCheck = await getAsync(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `, [table]);
            
            results[table] = tableCheck ? '✅ Exists' : '❌ Missing';
            
            if (tableCheck) {
                const count = await getAsync(`SELECT COUNT(*) as count FROM ${table}`);
                results[`${table}_count`] = count.count;
            }
        }
        
        const supplier = await getAsync('SELECT id, name FROM suppliers WHERE type = ? LIMIT 1', ['RETREAD']);
        results.sample_supplier = supplier ? `✅ Found: ${supplier.name} (ID: ${supplier.id})` : '❌ No retread suppliers found';
        
        const tire = await getAsync('SELECT id, serial_number FROM tires WHERE status = ? LIMIT 1', ['USED_STORE']);
        results.sample_tire = tire ? `✅ Found: ${tire.serial_number} (ID: ${tire.id})` : '❌ No tires in USED_STORE status';
        
        res.json({
            success: true,
            message: 'Retread setup test results',
            data: results
        });
    } catch (error) {
        console.error('Test failed:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;