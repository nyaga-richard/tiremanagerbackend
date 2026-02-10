const express = require('express');
const router = express.Router();
const TireController = require('../controllers/tireController');



// Retreading specific routes
router.get('/retread/eligible', TireController.getRetreadEligibleTires); // Get eligible tires

router.post('/retread/send-batch', TireController.sendForRetreading); // Send batch for retreading

router.post('/retread/return-batch', TireController.returnFromRetreading); // Return batch from retreading

router.post('/retread/mark', TireController.markForRetreading); // Mark tires for retreading

router.get('/retread/status', TireController.getRetreadStatusReport); // Get retread status

router.get('/retread/cost-analysis', TireController.getRetreadCostAnalysis); // Cost analysis

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