const { runQuery, getQuery, allQuery } = require('../config/database');

class RetreadService {
    // Create a new retread order
    async createRetreadOrder(orderData, items) {
        const { supplier_id, order_date, expected_return_date, notes, terms, created_by } = orderData;
        
        try {
            await runQuery('BEGIN TRANSACTION');
            
            // Generate order number
            const orderNumber = await this.generateOrderNumber();
            
            // Insert retread order
            const orderResult = await runQuery(
                `INSERT INTO retread_orders 
                (order_number, supplier_id, order_date, expected_return_date, notes, terms, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [orderNumber, supplier_id, order_date, expected_return_date, notes, terms, created_by]
            );
            
            const orderId = orderResult.lastID;
            
            // Insert order items
            let totalCost = 0;
            for (const item of items) {
                await runQuery(
                    `INSERT INTO retread_order_items 
                    (retread_order_id, tire_id, size, brand, model, removal_reason, removal_odometer, retread_cost)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, item.tire_id, item.size, item.brand, item.model, 
                     item.removal_reason, item.removal_odometer, item.retread_cost]
                );
                
                // Update tire status
                await runQuery(
                    `UPDATE tires SET status = 'AWAITING_RETREAD' WHERE id = ?`,
                    [item.tire_id]
                );
                
                // Record tire movement
                await this.recordTireMovement(item.tire_id, orderId, created_by);
                
                totalCost += item.retread_cost;
            }
            
            // Update order total
            await runQuery(
                `UPDATE retread_orders SET total_tires = ?, total_cost = ? WHERE id = ?`,
                [items.length, totalCost, orderId]
            );
            
            await runQuery('COMMIT');
            
            return { success: true, orderId, orderNumber };
        } catch (error) {
            await runQuery('ROLLBACK');
            throw error;
        }
    }

    // Generate unique order number
    async generateOrderNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM retread_orders 
             WHERE order_number LIKE ?`,
            [`RT${year}${month}%`]
        );
        
        const sequence = String(result.count + 1).padStart(4, '0');
        return `RT${year}${month}${sequence}`;
    }

    // Send retread order to retreader
    async sendToRetreader(orderId, userId) {
        try {
            await runQuery('BEGIN TRANSACTION');
            
            // Update order status
            await runQuery(
                `UPDATE retread_orders SET status = 'SENT_TO_RETREADER', updated_at = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [orderId]
            );
            
            // Update items status
            await runQuery(
                `UPDATE retread_order_items SET status = 'AT_RETREADER', updated_at = CURRENT_TIMESTAMP 
                 WHERE retread_order_id = ?`,
                [orderId]
            );
            
            // Get all tires in this order
            const items = await allQuery(
                `SELECT tire_id FROM retread_order_items WHERE retread_order_id = ?`,
                [orderId]
            );
            
            // Update tire status and record movement
            for (const item of items) {
                await runQuery(
                    `UPDATE tires SET status = 'AT_RETREAD_SUPPLIER' WHERE id = ?`,
                    [item.tire_id]
                );
                
                await runQuery(
                    `INSERT INTO tire_movements 
                    (tire_id, from_location, to_location, movement_type, retread_order_id, user_id)
                    VALUES (?, 'USED_STORE', 'AT_RETREAD_SUPPLIER', 'STORE_TO_RETREAD_SUPPLIER', ?, ?)`,
                    [item.tire_id, orderId, userId]
                );
            }
            
            await runQuery('COMMIT');
            return { success: true };
        } catch (error) {
            await runQuery('ROLLBACK');
            throw error;
        }
    }

    // Receive retread order (create RRN)
    async receiveRetreadOrder(orderId, receiptData, items) {
        const { receipt_date, received_by, supplier_invoice_number, delivery_note_number, notes } = receiptData;
        
        try {
            await runQuery('BEGIN TRANSACTION');
            
            // Generate RRN number
            const rrnNumber = await this.generateRRNNumber();
            
            // Create RRN
            const rrnResult = await runQuery(
                `INSERT INTO retread_receiving_notes 
                (rrn_number, retread_order_id, receipt_date, received_by, supplier_invoice_number, 
                 delivery_note_number, notes, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'COMPLETED')`,
                [rrnNumber, orderId, receipt_date, received_by, supplier_invoice_number, 
                 delivery_note_number, notes]
            );
            
            const rrnId = rrnResult.lastID;
            
            // Process received items
            let receivedCount = 0;
            let rejectedCount = 0;
            
            for (const item of items) {
                // Insert receiving item
                await runQuery(
                    `INSERT INTO retread_receiving_items 
                    (rrn_id, retread_order_item_id, received_type, new_serial_number, retread_cost, notes)
                    VALUES (?, ?, ?, ?, ?, ?)`,
                    [rrnId, item.order_item_id, item.received_type, item.new_serial_number, 
                     item.retread_cost, item.notes]
                );
                
                // Update retread order item status
                await runQuery(
                    `UPDATE retread_order_items 
                     SET status = ?, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [item.received_type === 'RETREADED' ? 'COMPLETED' : 'REJECTED', item.order_item_id]
                );
                
                // Handle tire based on received type
                const orderItem = await getQuery(
                    `SELECT tire_id FROM retread_order_items WHERE id = ?`,
                    [item.order_item_id]
                );
                
                if (item.received_type === 'RETREADED') {
                    // Create new tire (retreaded)
                    const tireData = await getQuery(
                        `SELECT size, brand, model FROM tires WHERE id = ?`,
                        [orderItem.tire_id]
                    );
                    
                    const newTireResult = await runQuery(
                        `INSERT INTO tires 
                        (serial_number, size, brand, model, type, status, purchase_cost, retread_order_item_id)
                        VALUES (?, ?, ?, ?, 'RETREADED', 'IN_STORE', ?, ?)`,
                        [item.new_serial_number, tireData.size, tireData.brand, tireData.model, 
                         item.retread_cost, item.order_item_id]
                    );
                    
                    // Record movement for new tire
                    await runQuery(
                        `INSERT INTO tire_movements 
                        (tire_id, from_location, to_location, movement_type, retread_order_id, rrn_id, user_id, retread_cost)
                        VALUES (?, 'AT_RETREAD_SUPPLIER', 'IN_STORE', 'RETREAD_SUPPLIER_TO_STORE', ?, ?, ?, ?)`,
                        [newTireResult.lastID, orderId, rrnId, received_by, item.retread_cost]
                    );
                    
                    receivedCount++;
                } else {
                    // Return rejected tire to used store
                    await runQuery(
                        `UPDATE tires SET status = 'USED_STORE' WHERE id = ?`,
                        [orderItem.tire_id]
                    );
                    
                    // Record movement for rejected tire
                    await runQuery(
                        `INSERT INTO tire_movements 
                        (tire_id, from_location, to_location, movement_type, retread_order_id, rrn_id, user_id)
                        VALUES (?, 'AT_RETREAD_SUPPLIER', 'USED_STORE', 'RETREAD_SUPPLIER_TO_STORE', ?, ?, ?)`,
                        [orderItem.tire_id, orderId, rrnId, received_by]
                    );
                    
                    rejectedCount++;
                }
            }
            
            // Update order status
            const totalItems = await getQuery(
                `SELECT COUNT(*) as total FROM retread_order_items WHERE retread_order_id = ?`,
                [orderId]
            );
            
            const receivedItems = await getQuery(
                `SELECT COUNT(*) as received FROM retread_order_items 
                 WHERE retread_order_id = ? AND status IN ('COMPLETED', 'REJECTED')`,
                [orderId]
            );
            
            let orderStatus = 'PARTIALLY_RECEIVED';
            if (receivedItems.received === totalItems.total) {
                orderStatus = 'FULLY_RECEIVED';
            }
            
            await runQuery(
                `UPDATE retread_orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [orderStatus, orderId]
            );
            
            await runQuery('COMMIT');
            
            return { 
                success: true, 
                rrnId, 
                rrnNumber,
                summary: {
                    received: receivedCount,
                    rejected: rejectedCount
                }
            };
        } catch (error) {
            await runQuery('ROLLBACK');
            throw error;
        }
    }

    // Generate RRN number
    async generateRRNNumber() {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        
        const result = await getQuery(
            `SELECT COUNT(*) as count FROM retread_receiving_notes 
             WHERE rrn_number LIKE ?`,
            [`RRN${year}${month}%`]
        );
        
        const sequence = String(result.count + 1).padStart(4, '0');
        return `RRN${year}${month}${sequence}`;
    }

    // Link RRN to GRN (accounting integration)
    async linkToGRN(rrnId, grnId) {
        try {
            await runQuery(
                `INSERT INTO retread_grn_links (rrn_id, grn_id) VALUES (?, ?)`,
                [rrnId, grnId]
            );
            
            // Update RRN status to indicate it's linked to accounting
            await runQuery(
                `UPDATE retread_receiving_notes 
                 SET status = 'COMPLETED' 
                 WHERE id = ?`,
                [rrnId]
            );
            
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    // Get retread orders with filters
    async getRetreadOrders(filters = {}) {
        let sql = `
            SELECT ro.*, s.name as supplier_name, u.username as created_by_name
            FROM retread_orders ro
            LEFT JOIN suppliers s ON ro.supplier_id = s.id
            LEFT JOIN users u ON ro.created_by = u.id
            WHERE 1=1
        `;
        const params = [];
        
        if (filters.status) {
            sql += ` AND ro.status = ?`;
            params.push(filters.status);
        }
        
        if (filters.supplier_id) {
            sql += ` AND ro.supplier_id = ?`;
            params.push(filters.supplier_id);
        }
        
        if (filters.from_date) {
            sql += ` AND ro.order_date >= ?`;
            params.push(filters.from_date);
        }
        
        if (filters.to_date) {
            sql += ` AND ro.order_date <= ?`;
            params.push(filters.to_date);
        }
        
        sql += ` ORDER BY ro.created_at DESC`;
        
        return await allQuery(sql, params);
    }

    // Get retread order details with items
    async getRetreadOrderDetails(orderId) {
        const order = await getQuery(
            `SELECT ro.*, s.name as supplier_name, s.contact_person, s.phone, s.email,
                    u1.username as created_by_name, u2.username as approved_by_name
             FROM retread_orders ro
             LEFT JOIN suppliers s ON ro.supplier_id = s.id
             LEFT JOIN users u1 ON ro.created_by = u1.id
             LEFT JOIN users u2 ON ro.approved_by = u2.id
             WHERE ro.id = ?`,
            [orderId]
        );
        
        if (!order) return null;
        
        const items = await allQuery(
            `SELECT roi.*, t.serial_number, t.status as tire_status
             FROM retread_order_items roi
             LEFT JOIN tires t ON roi.tire_id = t.id
             WHERE roi.retread_order_id = ?`,
            [orderId]
        );
        
        const receivingNotes = await allQuery(
            `SELECT rrn.*, COUNT(rri.id) as items_received
             FROM retread_receiving_notes rrn
             LEFT JOIN retread_receiving_items rri ON rrn.id = rri.rrn_id
             WHERE rrn.retread_order_id = ?
             GROUP BY rrn.id`,
            [orderId]
        );
        
        return {
            ...order,
            items,
            receivingNotes
        };
    }

    // Record tire movement helper
    async recordTireMovement(tireId, orderId, userId) {
        await runQuery(
            `INSERT INTO tire_movements 
            (tire_id, from_location, to_location, movement_type, retread_order_id, user_id)
            SELECT 
                t.id,
                t.status,
                'AWAITING_RETREAD',
                'STORE_TO_RETREAD_SUPPLIER',
                ?,
                ?
            FROM tires t
            WHERE t.id = ?`,
            [orderId, userId, tireId]
        );
    }

    // Get available tires for retreading
    async getTiresForRetreading() {
        return await allQuery(
            `SELECT t.*, 
                    v.vehicle_number,
                    ta.position_id,
                    wp.position_name
             FROM tires t
             LEFT JOIN tire_assignments ta ON t.id = ta.tire_id AND ta.removal_date IS NULL
             LEFT JOIN vehicles v ON ta.vehicle_id = v.id
             LEFT JOIN wheel_positions wp ON ta.position_id = wp.id
             WHERE t.status IN ('USED_STORE', 'ON_VEHICLE')
             ORDER BY t.created_at DESC`
        );
    }
}

module.exports = new RetreadService();