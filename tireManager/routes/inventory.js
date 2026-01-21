const express = require('express');
const router = express.Router();
const Tire = require('../models/Tire');

// Get inventory grouped by size
router.get('/by-size', async (req, res) => {
    try {
        const inventory = await Tire.getInventoryBySize();
        res.json(inventory);
    } catch (error) {
        console.error('Error getting inventory:', error);
        res.status(500).json({ error: 'Failed to get inventory' });
    }
});

// Get tires in store
router.get('/store/:status?', async (req, res) => {
    try {
        const status = req.params.status || 'IN_STORE';
        const tires = await Tire.findAllByStatus(status);
        res.json(tires);
    } catch (error) {
        console.error('Error getting store tires:', error);
        res.status(500).json({ error: 'Failed to get store tires' });
    }
});

// Get retread candidates
router.get('/retread-candidates', async (req, res) => {
    try {
        const candidates = await Tire.getRetreadCandidates();
        res.json(candidates);
    } catch (error) {
        console.error('Error getting retread candidates:', error);
        res.status(500).json({ error: 'Failed to get retread candidates' });
    }
});

// Get tires pending disposal
router.get('/pending-disposal', async (req, res) => {
    try {
        const db = require('../config/database');
        const tires = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, 
                       MAX(ta.install_date) as last_used_date,
                       MAX(ta.removal_odometer) as last_odometer
                FROM tires t
                LEFT JOIN tire_assignments ta ON t.id = ta.tire_id
                WHERE t.status = 'USED_STORE'
                AND (julianday('now') - julianday(COALESCE(MAX(ta.removal_date), t.purchase_date))) > 180
                GROUP BY t.id
                ORDER BY t.size, t.brand
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        res.json(tires);
    } catch (error) {
        console.error('Error getting pending disposal:', error);
        res.status(500).json({ error: 'Failed to get pending disposal' });
    }
});

    // Get tires by size (optionally filtered by status)
    router.get('/size/:size', async (req, res) => {
        try {
            const size = decodeURIComponent(req.params.size);
            const { status } = req.query;

            const tires = await Tire.getTiresBySize(size, status);
            res.json(tires);
        } catch (error) {
            console.error('Error getting tires by size:', error);
            res.status(500).json({ error: 'Failed to get tires by size' });
        }
    });


// Get dashboard stats
router.get('/dashboard-stats', async (req, res) => {
    try {
        const db = require('../config/database');
        
        const stats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(CASE WHEN status = 'IN_STORE' THEN 1 END) as in_store,
                    COUNT(CASE WHEN status = 'ON_VEHICLE' THEN 1 END) as on_vehicle,
                    COUNT(CASE WHEN status = 'USED_STORE' THEN 1 END) as used_store,
                    COUNT(CASE WHEN status = 'AWAITING_RETREAD' THEN 1 END) as awaiting_retread,
                    COUNT(CASE WHEN status = 'AT_RETREAD_SUPPLIER' THEN 1 END) as at_retreader,
                    COUNT(CASE WHEN status = 'DISPOSED' THEN 1 END) as disposed,
                    COUNT(CASE WHEN type = 'NEW' THEN 1 END) as new_tires,
                    COUNT(CASE WHEN type = 'RETREADED' THEN 1 END) as retreaded_tires,
                    SUM(purchase_cost) as total_value
                FROM tires
            `, [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json(stats);
    } catch (error) {
        console.error('Error getting dashboard stats:', error);
        res.status(500).json({ error: 'Failed to get dashboard stats' });
    }
});

module.exports = router;