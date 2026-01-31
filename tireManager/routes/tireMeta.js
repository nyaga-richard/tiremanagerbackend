const express = require('express');
const router = express.Router();
const { TIRE_SIZES } = require('../constants/tireSizes');

// GET /api/tires/meta/sizes
router.get('/sizes', (req, res) => {
    res.json({
        success: true,
        data: TIRE_SIZES
    });
});

module.exports = router;
