const express = require('express');
const router = express.Router();
const TireController = require('../controllers/tireController');



// Purchase new tires
router.post('/purchase', TireController.purchaseTires);

// Install on vehicle
router.post('/install', TireController.installOnVehicle);

// Remove from vehicle
router.post('/remove', TireController.removeFromVehicle);

// Send for retreading
router.post('/send-retread', TireController.sendForRetreading);

// Return from retreading
router.post('/return-retread', TireController.returnFromRetreading);

// Dispose tire
router.post('/dispose', TireController.disposeTire);

// Fetch all transactions
router.get('/transactions', TireController.getTransactions);

// Get tire details
router.get('/:id', TireController.getTireDetails);

// Search tires
router.get('/', TireController.searchTires);




module.exports = router;