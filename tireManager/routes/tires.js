const express = require('express');
const router = express.Router();
const TireController = require('../controllers/tireController');
const AuthMiddleware = require('../middleware/auth-middleware');
const db = require('../config/database');

// Initialize auth middleware
const auth = new AuthMiddleware(db);

// Apply authentication to all routes
router.use(auth.authenticate);

// Permission middleware
const checkPermission = (permissionCode, action = 'view') => {
    return auth.checkPermission(permissionCode, action);
};

// Retreading specific routes
router.get('/retread/eligible', 
    checkPermission('tire.retread', 'view'),
    TireController.getRetreadEligibleTires
);

router.post('/retread/send-batch', 
    checkPermission('tire.retread', 'create'),
    TireController.sendForRetreading
);

router.post('/retread/return-batch', 
    checkPermission('tire.retread', 'edit'),
    TireController.returnFromRetreading
);

router.post('/retread/mark', 
    checkPermission('tire.retread', 'create'),
    TireController.markForRetreading
);

router.get('/retread/status', 
    checkPermission('tire.retread', 'view'),
    TireController.getRetreadStatusReport
);

router.get('/retread/cost-analysis', 
    checkPermission('reports.view', 'view'),
    TireController.getRetreadCostAnalysis
);

// Install on vehicle
router.post('/install', 
    checkPermission('tire.assign', 'create'),
    TireController.installOnVehicle
);

// Remove from vehicle
router.post('/remove', 
    checkPermission('tire.assign', 'edit'),
    TireController.removeFromVehicle
);

// Send for retreading (legacy endpoint - redirecting to new endpoint structure)
router.post('/send-retread', 
    checkPermission('tire.retread', 'create'),
    TireController.sendForRetreading
);

// Return from retreading (legacy endpoint - redirecting to new endpoint structure)
router.post('/return-retread', 
    checkPermission('tire.retread', 'edit'),
    TireController.returnFromRetreading
);

// Dispose tire
router.post('/dispose', 
    checkPermission('tire.dispose', 'create'),
    TireController.disposeTire
);

// Fetch all transactions
router.get('/transactions', 
    checkPermission('movement.view', 'view'),
    TireController.getTransactions
);

// Get tire details
router.get('/:id', 
    checkPermission('tire.view', 'view'),
    TireController.getTireDetails
);

// Search tires
router.get('/', 
    checkPermission('tire.view', 'view'),
    TireController.searchTires
);

module.exports = router;