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

// Send for retreading (legacy endpoint)
router.post('/send-retread', 
    checkPermission('tire.retread', 'create'),
    TireController.sendForRetreading
);

// Return from retreading (legacy endpoint)
router.post('/return-retread', 
    checkPermission('tire.retread', 'edit'),
    TireController.returnFromRetreading
);

// ==================== DISPOSAL ROUTES ====================

// Dispose single tire (with ID in URL)
router.post('/:id/dispose', 
    checkPermission('tire.dispose', 'create'),
    TireController.disposeTire
);

// Bulk dispose tires
router.post('/bulk-dispose', 
    checkPermission('tire.dispose', 'create'),
    TireController.bulkDisposeTires
);

// Get disposal history with filters
router.get('/disposal-history', 
    checkPermission('tire.dispose', 'view'),
    TireController.getDisposalHistory
);

// Get disposal summary statistics
router.get('/disposal-summary', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposalSummary
);

// Get eligible tires for disposal
router.get('/eligible-for-disposal', 
    checkPermission('tire.dispose', 'view'),
    TireController.getEligibleForDisposal
);

// Get disposal reasons (for dropdowns)
router.get('/disposal-reasons', 
    checkPermission('tire.dispose', 'view'),
    TireController.getDisposalReasons
);

// ==================== NEW DISPOSED TIRES ENDPOINTS ====================

// Get disposed tires with filtering and pagination
router.get('/disposed', 
    checkPermission('tire.dispose', 'view'),
    TireController.getDisposedTires
);

// Get disposed tires summary statistics
router.get('/disposed/summary', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposedTiresSummary
);

// Get disposed tires trend analysis
router.get('/disposed/trend', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposedTiresTrend
);

// Get disposed tires grouped by reason
router.get('/disposed/by-reason', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposedTiresByReason
);

// Get disposed tires grouped by method
router.get('/disposed/by-method', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposedTiresByMethod
);

// Get disposed tires grouped by size
router.get('/disposed/by-size', 
    checkPermission('reports.view', 'view'),
    TireController.getDisposedTiresBySize
);

// Get a single disposed tire by ID with full details
router.get('/disposed/:id', 
    checkPermission('tire.dispose', 'view'),
    TireController.getDisposedTireById
);

// Export disposed tires data
router.get('/disposed/export', 
    checkPermission('tire.dispose', 'export'),
    TireController.exportDisposedTires
);

// Reverse/Cancel a disposal (admin only)
router.post('/:id/reverse-disposal', 
    checkPermission('tire.dispose', 'edit'),
    TireController.reverseDisposal
);

// Get disposal certificate for a tire
router.get('/:id/certificate', 
    checkPermission('tire.dispose', 'view'),
    TireController.getDisposalCertificate
);

// ==================== END DISPOSAL ROUTES ====================

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