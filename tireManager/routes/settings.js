// routes/settings.js
const express = require('express');
const router = express.Router();
const SettingsController = require('../controllers/SettingsController');
const AuthMiddleware = require('../middleware/auth-middleware');
const db = require('../config/database');

// Initialize auth middleware and controller
const auth = new AuthMiddleware(db);
const settingsController = new SettingsController();

// Apply authentication to all routes
router.use(auth.authenticate);

// Permission middleware
const checkPermission = (permissionCode, action = 'view') => {
    return auth.checkPermission(permissionCode, action);
};

// =============== SYSTEM SETTINGS ===============
router.get('/system', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getSystemSettings(req, res)
);

router.put('/system', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateSystemSettings(req, res)
);

// =============== EMAIL SETTINGS ===============
router.get('/email', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getEmailSettings(req, res)
);

router.put('/email', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateEmailSettings(req, res)
);

router.post('/email/test', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.testEmailConnection(req, res)
);

// =============== NOTIFICATION SETTINGS ===============
router.get('/notifications', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getNotificationSettings(req, res)
);

router.put('/notifications', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateNotificationSettings(req, res)
);

// =============== BACKUP SETTINGS ===============
router.get('/backup', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getBackupSettings(req, res)
);

router.put('/backup', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateBackupSettings(req, res)
);

router.post('/backup/create', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.createBackup(req, res)
);

// =============== AUDIT SETTINGS ===============
router.get('/audit', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getAuditSettings(req, res)
);

router.put('/audit', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateAuditSettings(req, res)
);

// =============== TAX RATES ===============
router.get('/tax-rates', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getTaxRates(req, res)
);

router.post('/tax-rates', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.createTaxRate(req, res)
);

router.put('/tax-rates/:id', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updateTaxRate(req, res)
);

router.delete('/tax-rates/:id', 
    checkPermission('settings.edit', 'delete'),
    (req, res) => settingsController.deleteTaxRate(req, res)
);

// =============== PAYMENT TERMS ===============
router.get('/payment-terms', 
    checkPermission('settings.view'),
    (req, res) => settingsController.getPaymentTerms(req, res)
);

router.post('/payment-terms', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.createPaymentTerm(req, res)
);

router.put('/payment-terms/:id', 
    checkPermission('settings.edit'),
    (req, res) => settingsController.updatePaymentTerm(req, res)
);

router.delete('/payment-terms/:id', 
    checkPermission('settings.edit', 'delete'),
    (req, res) => settingsController.deletePaymentTerm(req, res)
);

module.exports = router;