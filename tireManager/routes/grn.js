const express = require('express');
const router = express.Router();
const GRNController = require('../controllers/GRNController');

// Create instance with proper binding
const grnController = new GRNController();

// Generate GRN number
router.get('/generate-number', (req, res) => grnController.generateGrnNumber(req, res));

// Get receipt preview for PO
router.get('/preview/:poId', (req, res) => grnController.getReceiptPreview(req, res));

// Get all GRNs (with filtering)
router.get('/', (req, res) => grnController.getAll(req, res));

// Create GRN
router.post('/', (req, res) => grnController.create(req, res));

// Get GRN by ID
router.get('/:id', (req, res) => grnController.getById(req, res));

// Get GRNs by PO ID
router.get('/po/:poId', (req, res) => grnController.getByPoId(req, res));

module.exports = router;