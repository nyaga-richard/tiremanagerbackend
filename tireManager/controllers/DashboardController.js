// controllers/DashboardController.js
const db = require('../config/database');

class DashboardController {
    // Get all dashboard stats
    static async getDashboardStats(req, res) {
        try {
            const { startDate, endDate } = req.query;
            
            // Get current date for endDate if not provided
            const end = endDate || new Date().toISOString().split('T')[0];
            // Default to last 30 days for startDate
            const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            
            // Run all stats queries in parallel
            const [
                tireStats,
                vehicleStats,
                movementStats,
                purchaseStats,
                supplierStats,
                financialStats,
                retreadStats,
                inventoryStats
            ] = await Promise.all([
                this.getTireStatistics(),
                this.getVehicleStatistics(),
                this.getMovementStatistics(start, end),
                this.getPurchaseStatistics(start, end),
                this.getSupplierStatistics(),
                this.getFinancialStatistics(start, end),
                this.getRetreadStatistics(start, end),
                this.getInventoryStatistics()
            ]);

            res.json({
                success: true,
                period: { start, end },
                summary: {
                    total_tires: tireStats.total_tires,
                    total_vehicles: vehicleStats.total_vehicles,
                    total_suppliers: supplierStats.total_suppliers,
                    total_purchases: purchaseStats.total_purchases,
                    total_movements: movementStats.total_movements,
                    total_inventory_value: inventoryStats.total_value
                },
                tire_stats: tireStats,
                vehicle_stats: vehicleStats,
                movement_stats: movementStats,
                purchase_stats: purchaseStats,
                supplier_stats: supplierStats,
                financial_stats: financialStats,
                retread_stats: retreadStats,
                inventory_stats: inventoryStats,
                charts: {
                    tire_status_distribution: tireStats.status_distribution,
                    tire_type_distribution: tireStats.type_distribution,
                    movement_trends: movementStats.daily_trends,
                    purchase_trends: purchaseStats.monthly_trends,
                    supplier_balances: supplierStats.top_suppliers,
                    vehicle_tire_distribution: vehicleStats.tire_distribution
                }
            });
        } catch (error) {
            console.error('Error getting dashboard stats:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get dashboard statistics' 
            });
        }
    }

    // 1. Tire Statistics
    static async getTireStatistics() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_tires,
                    SUM(purchase_cost) as total_value,
                    -- Status distribution
                    COUNT(CASE WHEN status = 'IN_STORE' THEN 1 END) as in_store,
                    COUNT(CASE WHEN status = 'ON_VEHICLE' THEN 1 END) as on_vehicle,
                    COUNT(CASE WHEN status = 'USED_STORE' THEN 1 END) as used_store,
                    COUNT(CASE WHEN status = 'AT_RETREAD_SUPPLIER' THEN 1 END) as at_retreader,
                    COUNT(CASE WHEN status = 'DISPOSED' THEN 1 END) as disposed,
                    -- Type distribution
                    COUNT(CASE WHEN type = 'NEW' THEN 1 END) as new_tires,
                    COUNT(CASE WHEN type = 'RETREADED' THEN 1 END) as retreaded_tires,
                    -- Size distribution (top 5)
                    (
                        SELECT json_group_array(json_object('size', size, 'count', count))
                        FROM (
                            SELECT size, COUNT(*) as count
                            FROM tires
                            GROUP BY size
                            ORDER BY count DESC
                            LIMIT 5
                        )
                    ) as top_sizes,
                    -- Brand distribution (top 5)
                    (
                        SELECT json_group_array(json_object('brand', brand, 'count', count))
                        FROM (
                            SELECT brand, COUNT(*) as count
                            FROM tires
                            WHERE brand IS NOT NULL
                            GROUP BY brand
                            ORDER BY count DESC
                            LIMIT 5
                        )
                    ) as top_brands
                FROM tires
            `;

            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const status_distribution = [
                        { status: 'In Store', count: row.in_store || 0, color: '#4CAF50' },
                        { status: 'On Vehicle', count: row.on_vehicle || 0, color: '#2196F3' },
                        { status: 'Used in Store', count: row.used_store || 0, color: '#FF9800' },
                        { status: 'At Retreader', count: row.at_retreader || 0, color: '#9C27B0' },
                        { status: 'Disposed', count: row.disposed || 0, color: '#F44336' }
                    ];

                    const type_distribution = [
                        { type: 'New', count: row.new_tires || 0, color: '#4CAF50' },
                        { type: 'Retreaded', count: row.retreaded_tires || 0, color: '#2196F3' }
                    ];

                    const top_sizes = row.top_sizes ? JSON.parse(row.top_sizes) : [];
                    const top_brands = row.top_brands ? JSON.parse(row.top_brands) : [];

                    resolve({
                        ...row,
                        status_distribution,
                        type_distribution,
                        top_sizes,
                        top_brands
                    });
                }
            });
        });
    }

    // 2. Vehicle Statistics
    static async getVehicleStatistics() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_vehicles,
                    COUNT(CASE WHEN status = 'ACTIVE' THEN 1 END) as active_vehicles,
                    COUNT(CASE WHEN status = 'RETIRED' THEN 1 END) as retired_vehicles,
                    COUNT(CASE WHEN status = 'MAINTENANCE' THEN 1 END) as maintenance_vehicles,
                    -- Tires per vehicle distribution
                    (
                        SELECT AVG(tire_count)
                        FROM (
                            SELECT v.id, COUNT(DISTINCT ta.tire_id) as tire_count
                            FROM vehicles v
                            LEFT JOIN tire_assignments ta ON v.id = ta.vehicle_id 
                                AND ta.removal_date IS NULL
                            WHERE v.status = 'ACTIVE'
                            GROUP BY v.id
                        )
                    ) as avg_tires_per_vehicle,
                    -- Top vehicles by tire count
                    (
                        SELECT json_group_array(json_object('vehicle', vehicle_number, 'tire_count', tire_count))
                        FROM (
                            SELECT v.vehicle_number, COUNT(DISTINCT ta.tire_id) as tire_count
                            FROM vehicles v
                            LEFT JOIN tire_assignments ta ON v.id = ta.vehicle_id 
                                AND ta.removal_date IS NULL
                            WHERE v.status = 'ACTIVE'
                            GROUP BY v.id
                            ORDER BY tire_count DESC
                            LIMIT 5
                        )
                    ) as top_vehicles_by_tires
                FROM vehicles
            `;

            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const tire_distribution = row.top_vehicles_by_tires ? 
                        JSON.parse(row.top_vehicles_by_tires) : [];
                    
                    resolve({
                        ...row,
                        tire_distribution
                    });
                }
            });
        });
    }

    // 3. Movement Statistics
    static async getMovementStatistics(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                WITH daily_movements AS (
                    SELECT 
                        DATE(movement_date) as date,
                        movement_type,
                        COUNT(*) as count
                    FROM tire_movements
                    WHERE DATE(movement_date) BETWEEN ? AND ?
                    GROUP BY DATE(movement_date), movement_type
                )
                SELECT 
                    -- Total movements
                    COUNT(*) as total_movements,
                    -- Movement type breakdown
                    COUNT(CASE WHEN movement_type = 'PURCHASE_TO_STORE' THEN 1 END) as purchases,
                    COUNT(CASE WHEN movement_type = 'STORE_TO_VEHICLE' THEN 1 END) as installations,
                    COUNT(CASE WHEN movement_type = 'VEHICLE_TO_STORE' THEN 1 END) as removals,
                    COUNT(CASE WHEN movement_type = 'STORE_TO_RETREAD_SUPPLIER' THEN 1 END) as sent_for_retreading,
                    COUNT(CASE WHEN movement_type = 'RETREAD_SUPPLIER_TO_STORE' THEN 1 END) as returned_from_retreading,
                    COUNT(CASE WHEN movement_type = 'STORE_TO_DISPOSAL' THEN 1 END) as disposals,
                    -- Daily trend
                    (
                        SELECT json_group_array(json_object('date', date, 'installations', installations, 'removals', removals))
                        FROM (
                            SELECT 
                                date,
                                SUM(CASE WHEN movement_type = 'STORE_TO_VEHICLE' THEN count ELSE 0 END) as installations,
                                SUM(CASE WHEN movement_type = 'VEHICLE_TO_STORE' THEN count ELSE 0 END) as removals
                            FROM daily_movements
                            GROUP BY date
                            ORDER BY date
                        )
                    ) as daily_trends,
                    -- Most active tires
                    (
                        SELECT json_group_array(json_object('tire_id', tire_id, 'serial', serial_number, 'movement_count', movement_count))
                        FROM (
                            SELECT 
                                tm.tire_id,
                                t.serial_number,
                                COUNT(*) as movement_count
                            FROM tire_movements tm
                            JOIN tires t ON tm.tire_id = t.id
                            WHERE DATE(tm.movement_date) BETWEEN ? AND ?
                            GROUP BY tm.tire_id
                            ORDER BY movement_count DESC
                            LIMIT 5
                        )
                    ) as most_active_tires
                FROM tire_movements
                WHERE DATE(movement_date) BETWEEN ? AND ?
            `;

            db.get(sql, [startDate, endDate, startDate, endDate, startDate, endDate], (err, row) => {
                if (err) reject(err);
                else {
                    const daily_trends = row.daily_trends ? JSON.parse(row.daily_trends) : [];
                    const most_active_tires = row.most_active_tires ? JSON.parse(row.most_active_tires) : [];
                    
                    resolve({
                        ...row,
                        daily_trends,
                        most_active_tires
                    });
                }
            });
        });
    }

    // 4. Purchase Statistics
    static async getPurchaseStatistics(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    -- Total purchases
                    COUNT(*) as total_purchases,
                    -- Total purchase value
                    SUM(po.total_amount) as total_purchase_value,
                    -- Average purchase value
                    AVG(po.total_amount) as avg_purchase_value,
                    -- Top suppliers by purchase value
                    (
                        SELECT json_group_array(json_object('supplier', supplier_name, 'total_spent', total_spent))
                        FROM (
                            SELECT 
                                s.name as supplier_name,
                                SUM(po.total_amount) as total_spent
                            FROM purchase_orders po
                            JOIN suppliers s ON po.supplier_id = s.id
                            WHERE DATE(po.po_date) BETWEEN ? AND ?
                                AND po.status IN ('APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED')
                            GROUP BY s.id
                            ORDER BY total_spent DESC
                            LIMIT 5
                        )
                    ) as top_suppliers,
                    -- Monthly purchase trend
                    (
                        SELECT json_group_array(json_object('month', month, 'total', total, 'count', count))
                        FROM (
                            SELECT 
                                strftime('%Y-%m', po_date) as month,
                                SUM(total_amount) as total,
                                COUNT(*) as count
                            FROM purchase_orders
                            WHERE DATE(po_date) BETWEEN ? AND ?
                                AND status IN ('APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED')
                            GROUP BY strftime('%Y-%m', po_date)
                            ORDER BY month
                        )
                    ) as monthly_trends,
                    -- Recent purchases
                    (
                        SELECT json_group_array(json_object(
                            'po_number', po_number,
                            'supplier', supplier_name,
                            'amount', total_amount,
                            'date', po_date,
                            'status', status
                        ))
                        FROM (
                            SELECT 
                                po.po_number,
                                s.name as supplier_name,
                                po.total_amount,
                                po.po_date,
                                po.status
                            FROM purchase_orders po
                            JOIN suppliers s ON po.supplier_id = s.id
                            WHERE DATE(po.po_date) BETWEEN ? AND ?
                            ORDER BY po.po_date DESC
                            LIMIT 5
                        )
                    ) as recent_purchases
                FROM purchase_orders po
                WHERE DATE(po.po_date) BETWEEN ? AND ?
            `;

            db.get(sql, [startDate, endDate, startDate, endDate, startDate, endDate, startDate, endDate], (err, row) => {
                if (err) reject(err);
                else {
                    const top_suppliers = row.top_suppliers ? JSON.parse(row.top_suppliers) : [];
                    const monthly_trends = row.monthly_trends ? JSON.parse(row.monthly_trends) : [];
                    const recent_purchases = row.recent_purchases ? JSON.parse(row.recent_purchases) : [];
                    
                    resolve({
                        ...row,
                        top_suppliers,
                        monthly_trends,
                        recent_purchases
                    });
                }
            });
        });
    }

    // 5. Supplier Statistics
    static async getSupplierStatistics() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    COUNT(*) as total_suppliers,
                    COUNT(CASE WHEN type = 'TIRE' THEN 1 END) as tire_suppliers,
                    COUNT(CASE WHEN type = 'RETREAD' THEN 1 END) as retread_suppliers,
                    -- Suppliers with outstanding balance
                    (
                        SELECT COUNT(DISTINCT s.id)
                        FROM suppliers s
                        WHERE s.balance > 0
                    ) as suppliers_with_balance,
                    -- Top suppliers by outstanding balance
                    (
                        SELECT json_group_array(json_object(
                            'supplier', name,
                            'balance', balance,
                            'last_transaction', (
                                SELECT MAX(date)
                                FROM supplier_ledger sl
                                WHERE sl.supplier_id = s.id
                            )
                        ))
                        FROM suppliers s
                        WHERE s.balance > 0
                        ORDER BY s.balance DESC
                        LIMIT 5
                    ) as top_suppliers
                FROM suppliers
            `;

            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const top_suppliers = row.top_suppliers ? JSON.parse(row.top_suppliers) : [];
                    
                    resolve({
                        ...row,
                        top_suppliers
                    });
                }
            });
        });
    }

    // 6. Financial Statistics
    static async getFinancialStatistics(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    -- Supplier balances
                    COALESCE(SUM(s.balance), 0) as total_outstanding,
                    -- Monthly expenses
                    (
                        SELECT json_group_array(json_object('month', month, 'purchases', purchases, 'retreading', retreading))
                        FROM (
                            SELECT 
                                strftime('%Y-%m', sl.date) as month,
                                SUM(CASE WHEN sl.transaction_type = 'PURCHASE' THEN sl.amount ELSE 0 END) as purchases,
                                SUM(CASE WHEN sl.transaction_type = 'RETREAD_SERVICE' THEN sl.amount ELSE 0 END) as retreading
                            FROM supplier_ledger sl
                            WHERE DATE(sl.date) BETWEEN ? AND ?
                            GROUP BY strftime('%Y-%m', sl.date)
                            ORDER BY month
                        )
                    ) as monthly_expenses,
                    -- Tire value summary
                    (
                        SELECT json_object(
                            'new_tires_value', COALESCE(SUM(CASE WHEN type = 'NEW' THEN purchase_cost ELSE 0 END), 0),
                            'retreaded_tires_value', COALESCE(SUM(CASE WHEN type = 'RETREADED' THEN purchase_cost ELSE 0 END), 0)
                        )
                        FROM tires
                    ) as tire_values
                FROM suppliers s
                WHERE s.balance > 0
            `;

            db.get(sql, [startDate, endDate], (err, row) => {
                if (err) reject(err);
                else {
                    const monthly_expenses = row.monthly_expenses ? JSON.parse(row.monthly_expenses) : [];
                    const tire_values = row.tire_values ? JSON.parse(row.tire_values) : {};
                    
                    resolve({
                        ...row,
                        monthly_expenses,
                        tire_values
                    });
                }
            });
        });
    }

    // 7. Retreading Statistics
    static async getRetreadStatistics(startDate, endDate) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    -- Retreading activity
                    COUNT(DISTINCT tire_id) as total_retreads,
                    -- Currently at retreader
                    (
                        SELECT COUNT(*)
                        FROM tires
                        WHERE status = 'AT_RETREAD_SUPPLIER'
                    ) as currently_at_retreader,
                    -- Retread candidates (tires in used store)
                    (
                        SELECT COUNT(*)
                        FROM tires
                        WHERE status = 'USED_STORE'
                    ) as retread_candidates,
                    -- Retreading cost savings (estimated 40% savings vs new tires)
                    (
                        SELECT COALESCE(SUM(purchase_cost * 0.4), 0)
                        FROM tires
                        WHERE type = 'RETREADED'
                            AND DATE(purchase_date) BETWEEN ? AND ?
                    ) as estimated_savings,
                    -- Retread vs new comparison
                    (
                        SELECT json_group_array(json_object('month', month, 'retreaded', retreaded, 'new', new))
                        FROM (
                            SELECT 
                                strftime('%Y-%m', purchase_date) as month,
                                COUNT(CASE WHEN type = 'RETREADED' THEN 1 END) as retreaded,
                                COUNT(CASE WHEN type = 'NEW' THEN 1 END) as new
                            FROM tires
                            WHERE DATE(purchase_date) BETWEEN ? AND ?
                            GROUP BY strftime('%Y-%m', purchase_date)
                            ORDER BY month
                        )
                    ) as retread_vs_new_trend
                FROM tire_movements
                WHERE movement_type IN ('STORE_TO_RETREAD_SUPPLIER', 'RETREAD_SUPPLIER_TO_STORE')
                    AND DATE(movement_date) BETWEEN ? AND ?
            `;

            db.get(sql, [startDate, endDate, startDate, endDate, startDate, endDate], (err, row) => {
                if (err) reject(err);
                else {
                    const retread_vs_new_trend = row.retread_vs_new_trend ? JSON.parse(row.retread_vs_new_trend) : [];
                    
                    resolve({
                        ...row,
                        retread_vs_new_trend
                    });
                }
            });
        });
    }

    // 8. Inventory Statistics
    static async getInventoryStatistics() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    -- Inventory summary
                    COUNT(*) as total_inventory_items,
                    SUM(CASE WHEN current_stock > 0 THEN 1 ELSE 0 END) as in_stock_items,
                    SUM(CASE WHEN current_stock = 0 THEN 1 ELSE 0 END) as out_of_stock_items,
                    -- Total inventory value (estimated)
                    SUM(current_stock * COALESCE(last_purchase_price, average_cost, 0)) as total_value,
                    -- Low stock items (below reorder point)
                    (
                        SELECT COUNT(*)
                        FROM inventory_catalog
                        WHERE current_stock <= reorder_point
                            AND current_stock > 0
                    ) as low_stock_items,
                    -- Critical stock items (below minimum)
                    (
                        SELECT COUNT(*)
                        FROM inventory_catalog
                        WHERE current_stock <= min_stock
                            AND current_stock > 0
                    ) as critical_stock_items,
                    -- Top sizes
                    (
                        SELECT json_group_array(json_object('size', size, 'items', items, 'value', value))
                        FROM (
                            SELECT 
                                size,
                                COUNT(*) as items,
                                SUM(current_stock * COALESCE(last_purchase_price, average_cost, 0)) as value
                            FROM inventory_catalog
                            GROUP BY size
                            ORDER BY value DESC
                            LIMIT 5
                        )
                    ) as top_categories
                FROM inventory_catalog
                WHERE is_active = 1
            `;

            db.get(sql, [], (err, row) => {
                if (err) reject(err);
                else {
                    const top_categories = row.top_categories ? JSON.parse(row.top_categories) : [];
                    
                    resolve({
                        ...row,
                        top_categories
                    });
                }
            });
        });
    }

    // Get alerts and notifications
    static async getAlerts(req, res) {
        try {
            const alerts = await Promise.all([
                this.getLowStockAlerts(),
                this.getMaintenanceAlerts(),
                this.getFinancialAlerts(),
                this.getTireAlerts()
            ]);

            res.json({
                success: true,
                alerts: alerts.flat(),
                total_alerts: alerts.flat().length
            });
        } catch (error) {
            console.error('Error getting alerts:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get alerts' 
            });
        }
    }

    static async getLowStockAlerts() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    size,
                    brand,
                    model,
                    current_stock,
                    reorder_point,
                    'LOW_STOCK' as alert_type,
                    'warning' as severity,
                    'Low stock for ' || size || ' ' || COALESCE(brand, '') || ' ' || COALESCE(model, '') as message
                FROM inventory_catalog
                WHERE current_stock <= reorder_point
                    AND current_stock > 0
                    AND is_active = 1
                ORDER BY current_stock / reorder_point
                LIMIT 10
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    static async getMaintenanceAlerts() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    v.vehicle_number,
                    v.make || ' ' || v.model as description,
                    'MAINTENANCE_DUE' as alert_type,
                    'info' as severity,
                    'Vehicle due for maintenance check' as message
                FROM vehicles v
                WHERE v.status = 'ACTIVE'
                    AND v.current_odometer > 50000  -- Example threshold
                LIMIT 10
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    static async getFinancialAlerts() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    s.name as supplier_name,
                    s.balance,
                    'OVERDUE_BALANCE' as alert_type,
                    'warning' as severity,
                    'Outstanding balance for ' || s.name || ': $' || ROUND(s.balance, 2) as message
                FROM suppliers s
                WHERE s.balance > 1000  -- Example threshold
                ORDER BY s.balance DESC
                LIMIT 10
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    static async getTireAlerts() {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT 
                    t.serial_number,
                    'TIRE_AGING' as alert_type,
                    'warning' as severity,
                    'Tire has been in storage for extended period' as message
                FROM tires t
                WHERE t.status IN ('IN_STORE', 'USED_STORE')
                    AND julianday('now') - julianday(t.created_at) > 180
                LIMIT 10
            `;

            db.all(sql, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // Get recent activity
    static async getRecentActivity(req, res) {
        try {
            const { limit = 20 } = req.query;
            
            const sql = `
                SELECT 
                    al.action,
                    al.entity_type,
                    al.entity_id,
                    u.username as user_name,
                    al.timestamp,
                    CASE 
                        WHEN al.old_values IS NOT NULL AND al.new_values IS NOT NULL 
                        THEN 'Updated ' || al.entity_type || ' #' || al.entity_id
                        WHEN al.old_values IS NULL 
                        THEN 'Created ' || al.entity_type || ' #' || al.entity_id
                        ELSE 'Deleted ' || al.entity_type || ' #' || al.entity_id
                    END as details
                FROM audit_log al
                LEFT JOIN users u ON al.user_id = u.id
                ORDER BY al.timestamp DESC
                LIMIT ?
            `;

            db.all(sql, [parseInt(limit)], (err, activities) => {
                if (err) {
                    console.error('Error getting recent activity:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to get recent activity' 
                    });
                }

                res.json({
                    success: true,
                    activities: activities || []
                });
            });
        } catch (error) {
            console.error('Error getting recent activity:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get recent activity' 
            });
        }
    }
}

module.exports = DashboardController;