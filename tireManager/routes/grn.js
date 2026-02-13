const express = require('express');
const router = express.Router();
const GRNController = require('../controllers/GRNController');
const AuthMiddleware = require('../middleware/auth-middleware');
const db = require('../config/database');

// Initialize auth middleware
const auth = new AuthMiddleware(db);

// Create instance with proper binding
const grnController = new GRNController();

// Apply authentication middleware to ALL GRN routes
router.use(auth.authenticate);

// Generate GRN number
router.get('/generate-number', (req, res) => grnController.generateGrnNumber(req, res));

// Get receipt preview for PO
router.get('/preview/:poId', (req, res) => grnController.getReceiptPreview(req, res));

// Get all GRNs (with filtering)
router.get('/', (req, res) => grnController.getAll(req, res));

// Create GRN
router.post('/', (req, res) => grnController.create(req, res));

router.patch('/:id', (req, res) => grnController.updateInvoice(req, res));

// Get GRN by ID
router.get('/:id', (req, res) => grnController.getById(req, res));

// Get GRNs by PO ID
router.get('/po/:poId', (req, res) => grnController.getByPoId(req, res));

module.exports = router;