// routes/dashboard.js
const express = require('express');
const router = express.Router();
const DashboardController = require('../controllers/DashboardController');
//const AuthMiddleware = require('../middleware/auth-middleware');
const db = require('../config/database');

//const auth = new AuthMiddleware(db);

// Get comprehensive dashboard statistics
router.get('/stats', 
    //auth.authenticate,
    async (req, res) => DashboardController.getDashboardStats(req, res)
);

// Get alerts and notifications
router.get('/alerts',
    //auth.authenticate,
    async (req, res) => DashboardController.getAlerts(req, res)
);

// Get recent system activity
router.get('/activity',
    //auth.authenticate,
    async (req, res) => DashboardController.getRecentActivity(req, res)
);

// Get quick stats (for dashboard widgets)
router.get('/quick-stats',
    //auth.authenticate,
    async (req, res) => {
        try {
            const [
                tireCount,
                vehicleCount,
                supplierCount,
                purchaseValue
            ] = await Promise.all([
                new Promise((resolve, reject) => {
                    db.get('SELECT COUNT(*) as count FROM tires', [], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    });
                }),
                new Promise((resolve, reject) => {
                    db.get('SELECT COUNT(*) as count FROM vehicles WHERE status = "ACTIVE"', [], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    });
                }),
                new Promise((resolve, reject) => {
                    db.get('SELECT COUNT(*) as count FROM suppliers', [], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.count);
                    });
                }),
                new Promise((resolve, reject) => {
                    db.get(`
                        SELECT COALESCE(SUM(total_amount), 0) as total
                        FROM purchase_orders 
                        WHERE DATE(order_date) >= DATE('now', '-30 days')
                    `, [], (err, row) => {
                        if (err) reject(err);
                        else resolve(row.total);
                    });
                })
            ]);

            res.json({
                success: true,
                stats: {
                    total_tires: tireCount,
                    active_vehicles: vehicleCount,
                    total_suppliers: supplierCount,
                    monthly_purchases: purchaseValue
                }
            });
        } catch (error) {
            console.error('Error getting quick stats:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get quick stats' 
            });
        }
    }
);

// Get KPI metrics
router.get('/kpis',
    //auth.authenticate,
    async (req, res) => {
        try {
            const sql = `
                SELECT 
                    -- Tire utilization rate
                    (
                        SELECT ROUND((COUNT(CASE WHEN status = 'ON_VEHICLE' THEN 1 END) * 100.0 / COUNT(*)), 2)
                        FROM tires
                    ) as tire_utilization_rate,
                    
                    -- Vehicle tire coverage
                    (
                        SELECT ROUND(AVG(tire_count), 2)
                        FROM (
                            SELECT v.id, COUNT(DISTINCT ta.tire_id) as tire_count
                            FROM vehicles v
                            LEFT JOIN tire_assignments ta ON v.id = ta.vehicle_id 
                                AND ta.removal_date IS NULL
                            WHERE v.status = 'ACTIVE'
                            GROUP BY v.id
                        )
                    ) as avg_tires_per_vehicle,
                    
                    -- Retread efficiency
                    (
                        SELECT ROUND((COUNT(CASE WHEN type = 'RETREADED' THEN 1 END) * 100.0 / COUNT(*)), 2)
                        FROM tires
                        WHERE type IN ('NEW', 'RETREADED')
                    ) as retread_rate,
                    
                    -- Inventory turnover (estimated)
                    (
                        SELECT ROUND((SUM(CASE WHEN movement_type = 'STORE_TO_VEHICLE' THEN 1 ELSE 0 END) * 100.0 / 
                             NULLIF(SUM(CASE WHEN movement_type = 'PURCHASE_TO_STORE' THEN 1 ELSE 0 END), 0)), 2)
                        FROM tire_movements
                        WHERE DATE(movement_date) >= DATE('now', '-30 days')
                    ) as monthly_turnover_rate,
                    
                    -- Cost savings from retreading
                    (
                        SELECT COALESCE(ROUND(SUM(purchase_cost * 0.4), 2), 0)
                        FROM tires
                        WHERE type = 'RETREADED'
                            AND DATE(purchase_date) >= DATE('now', '-365 days')
                    ) as annual_retread_savings
           
            `;

            db.get(sql, [], (err, kpis) => {
                if (err) {
                    console.error('Error getting KPIs:', err);
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to get KPIs' 
                    });
                }

                res.json({
                    success: true,
                    kpis: kpis || {}
                });
            });
        } catch (error) {
            console.error('Error getting KPIs:', error);
            res.status(500).json({ 
                success: false, 
                error: 'Failed to get KPIs' 
            });
        }
    }
);

module.exports = router;