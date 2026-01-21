const express = require('express');
const router = express.Router();
const Movement = require('../models/Movement');

// Get movements by date range
router.get('/', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const movements = await Movement.getMovementsByDate(
            startDate || new Date().toISOString().split('T')[0],
            endDate || new Date().toISOString().split('T')[0]
        );
        res.json(movements);
    } catch (error) {
        console.error('Error getting movements:', error);
        res.status(500).json({ error: 'Failed to get movements' });
    }
});

// Get movements by tire
router.get('/tire/:tireId', async (req, res) => {
    try {
        const { limit } = req.query;
        const movements = await Movement.getMovementsByTire(req.params.tireId, limit || 50);
        res.json(movements);
    } catch (error) {
        console.error('Error getting tire movements:', error);
        res.status(500).json({ error: 'Failed to get tire movements' });
    }
});
    // Get movements by tire size + date range
    router.get('/size/:size', async (req, res) => {
        try {
            const { startDate, endDate } = req.query;

            const movements = await Movement.getMovementsBySize(
                req.params.size,
                startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                endDate || new Date().toISOString().split('T')[0]
            );

            res.json(movements);
        } catch (error) {
            console.error('Error getting movements by size:', error);
            res.status(500).json([]);
        }
    });


// Get dashboard movement stats
router.get('/stats', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const stats = await Movement.getDashboardStats(
            startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate || new Date().toISOString().split('T')[0]
        );
        res.json(stats);
    } catch (error) {
        console.error('Error getting movement stats:', error);
        res.status(500).json({ error: 'Failed to get movement stats' });
    }
});

module.exports = router;