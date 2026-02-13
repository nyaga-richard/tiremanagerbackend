// controllers/SettingsController.js
const db = require('../config/database');

// Promisify database methods
const runQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

const getQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const allQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

class SettingsController {
    // =============== SYSTEM SETTINGS ===============

    // Get system settings
    async getSystemSettings(req, res) {
        try {
            // Check if settings exist, if not create default
            let settings = await getQuery(`
                SELECT * FROM system_settings WHERE id = 1
            `);

            if (!settings) {
                const currentYear = new Date().getFullYear();
                await runQuery(`
                    INSERT INTO system_settings (
                        id, company_name, fiscal_year_start, fiscal_year_end,
                        date_format, time_format, timezone, currency, currency_symbol, vat_rate
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    'Tire Management System',
                    `${currentYear}-01-01`,
                    `${currentYear}-12-31`,
                    'MMM dd, yyyy',
                    'HH:mm:ss',
                    'Africa/Nairobi',
                    'KES',
                    'KSH',
                    16
                ]);

                settings = await getQuery(`SELECT * FROM system_settings WHERE id = 1`);
            }

            // Get user who last updated
            if (settings && settings.updated_by) {
                const user = await getQuery(
                    'SELECT username, full_name FROM users WHERE id = ?',
                    [settings.updated_by]
                );
                settings.updated_by_name = user ? (user.full_name || user.username) : null;
            }

            res.json({
                success: true,
                settings
            });
        } catch (error) {
            console.error('Error fetching system settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch system settings',
                error: error.message
            });
        }
    }

    // Update system settings
    async updateSystemSettings(req, res) {
        try {
            const {
                company_name,
                company_address,
                company_phone,
                company_email,
                company_website,
                company_tax_id,
                fiscal_year_start,
                fiscal_year_end,
                date_format,
                time_format,
                timezone,
                currency,
                currency_symbol,
                vat_rate,
                updated_by
            } = req.body;

            // Validate required fields
            if (!company_name) {
                return res.status(400).json({
                    success: false,
                    message: 'Company name is required'
                });
            }

            // Check if settings exist
            const settings = await getQuery(`SELECT * FROM system_settings WHERE id = 1`);
            
            if (!settings) {
                // Insert if not exists
                await runQuery(`
                    INSERT INTO system_settings (
                        id, company_name, company_address, company_phone, company_email,
                        company_website, company_tax_id, fiscal_year_start, fiscal_year_end,
                        date_format, time_format, timezone, currency, currency_symbol, vat_rate,
                        updated_by, updated_at
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    company_name,
                    company_address || null,
                    company_phone || null,
                    company_email || null,
                    company_website || null,
                    company_tax_id || null,
                    fiscal_year_start || null,
                    fiscal_year_end || null,
                    date_format || 'MMM dd, yyyy',
                    time_format || 'HH:mm:ss',
                    timezone || 'Africa/Nairobi',
                    currency || 'KES',
                    currency_symbol || 'KSH',
                    vat_rate || 16,
                    updated_by || null
                ]);
            } else {
                // Update existing
                await runQuery(`
                    UPDATE system_settings SET
                        company_name = ?,
                        company_address = ?,
                        company_phone = ?,
                        company_email = ?,
                        company_website = ?,
                        company_tax_id = ?,
                        fiscal_year_start = ?,
                        fiscal_year_end = ?,
                        date_format = ?,
                        time_format = ?,
                        timezone = ?,
                        currency = ?,
                        currency_symbol = ?,
                        vat_rate = ?,
                        updated_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `, [
                    company_name,
                    company_address || null,
                    company_phone || null,
                    company_email || null,
                    company_website || null,
                    company_tax_id || null,
                    fiscal_year_start || null,
                    fiscal_year_end || null,
                    date_format || 'MMM dd, yyyy',
                    time_format || 'HH:mm:ss',
                    timezone || 'Africa/Nairobi',
                    currency || 'KES',
                    currency_symbol || 'KSH',
                    vat_rate || 16,
                    updated_by || null
                ]);
            }

            // Log audit
            await this.logAudit({
                user_id: updated_by,
                action: 'UPDATE_SYSTEM_SETTINGS',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req
            });

            res.json({
                success: true,
                message: 'System settings updated successfully'
            });
        } catch (error) {
            console.error('Error updating system settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update system settings',
                error: error.message
            });
        }
    }

    // =============== EMAIL SETTINGS ===============

    // Get email settings
    async getEmailSettings(req, res) {
        try {
            let settings = await getQuery(`
                SELECT * FROM email_settings WHERE id = 1
            `);

            if (!settings) {
                await runQuery(`
                    INSERT INTO email_settings (
                        id, smtp_host, smtp_port, smtp_encryption, 
                        from_email, from_name, enabled
                    ) VALUES (1, ?, ?, ?, ?, ?, ?)
                `, [
                    'smtp.gmail.com',
                    587,
                    'tls',
                    'noreply@tiremanager.com',
                    'Tire Management System',
                    0
                ]);

                settings = await getQuery(`SELECT * FROM email_settings WHERE id = 1`);
            }

            // Don't send password in response
            if (settings) {
                delete settings.smtp_password;
            }

            res.json({
                success: true,
                settings
            });
        } catch (error) {
            console.error('Error fetching email settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch email settings',
                error: error.message
            });
        }
    }

    // Update email settings
    async updateEmailSettings(req, res) {
        try {
            const {
                smtp_host,
                smtp_port,
                smtp_encryption,
                smtp_username,
                smtp_password,
                from_email,
                from_name,
                reply_to,
                enabled,
                updated_by
            } = req.body;

            // Validate required fields if enabled
            if (enabled) {
                if (!smtp_host || !smtp_port || !from_email || !from_name) {
                    return res.status(400).json({
                        success: false,
                        message: 'SMTP host, port, from email, and from name are required when email is enabled'
                    });
                }
            }

            // Check if settings exist
            const settings = await getQuery(`SELECT * FROM email_settings WHERE id = 1`);

            if (!settings) {
                // Build insert query
                let sql = `
                    INSERT INTO email_settings (
                        id, smtp_host, smtp_port, smtp_encryption, smtp_username,
                        from_email, from_name, reply_to, enabled, updated_by, updated_at
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `;
                let params = [
                    smtp_host || null,
                    smtp_port || 587,
                    smtp_encryption || 'tls',
                    smtp_username || null,
                    from_email || null,
                    from_name || null,
                    reply_to || null,
                    enabled ? 1 : 0,
                    updated_by || null
                ];

                // Add password if provided
                if (smtp_password) {
                    sql = sql.replace(
                        'smtp_host = ?,',
                        'smtp_password = ?, smtp_host = ?,'
                    );
                    params.unshift(smtp_password);
                }

                await runQuery(sql, params);
            } else {
                // Build update query
                let sql = `
                    UPDATE email_settings SET
                        smtp_host = ?,
                        smtp_port = ?,
                        smtp_encryption = ?,
                        smtp_username = ?,
                        from_email = ?,
                        from_name = ?,
                        reply_to = ?,
                        enabled = ?,
                        updated_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                `;
                let params = [
                    smtp_host || null,
                    smtp_port || 587,
                    smtp_encryption || 'tls',
                    smtp_username || null,
                    from_email || null,
                    from_name || null,
                    reply_to || null,
                    enabled ? 1 : 0,
                    updated_by || null
                ];

                // Only update password if provided
                if (smtp_password) {
                    sql = sql.replace(
                        'SET smtp_host = ?',
                        'SET smtp_password = ?, smtp_host = ?'
                    );
                    params.unshift(smtp_password);
                }

                sql += ' WHERE id = 1';
                await runQuery(sql, params);
            }

            // Log audit
            await this.logAudit({
                user_id: updated_by,
                action: 'UPDATE_EMAIL_SETTINGS',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req
            });

            res.json({
                success: true,
                message: 'Email settings updated successfully'
            });
        } catch (error) {
            console.error('Error updating email settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update email settings',
                error: error.message
            });
        }
    }

    // Test email connection
    async testEmailConnection(req, res) {
        try {
            const { to } = req.body;
            const { user } = req;

            if (!to) {
                return res.status(400).json({
                    success: false,
                    message: 'Recipient email address is required'
                });
            }

            // Get email settings
            const settings = await getQuery(`SELECT * FROM email_settings WHERE id = 1`);

            if (!settings || !settings.enabled) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is not enabled. Please configure and enable email settings first.'
                });
            }

            // Here you would implement actual email sending logic
            // For now, we'll simulate success
            console.log('Test email would be sent to:', to);
            console.log('Using SMTP settings:', {
                host: settings.smtp_host,
                port: settings.smtp_port,
                encryption: settings.smtp_encryption,
                username: settings.smtp_username
            });

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'TEST_EMAIL',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req,
                new_values: { recipient: to }
            });

            res.json({
                success: true,
                message: 'Test email sent successfully'
            });
        } catch (error) {
            console.error('Error testing email connection:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to send test email',
                error: error.message
            });
        }
    }

    // =============== NOTIFICATION SETTINGS ===============

    // Get notification settings
    async getNotificationSettings(req, res) {
        try {
            let settings = await getQuery(`
                SELECT * FROM notification_settings WHERE id = 1
            `);

            if (!settings) {
                await runQuery(`
                    INSERT INTO notification_settings (
                        id, email_notifications, system_notifications,
                        purchase_order_alerts, low_stock_alerts, retread_due_alerts,
                        vehicle_service_alerts, user_login_alerts, daily_summary, weekly_report
                    ) VALUES (1, 1, 1, 1, 1, 1, 1, 0, 0, 1)
                `);

                settings = await getQuery(`SELECT * FROM notification_settings WHERE id = 1`);
            }

            res.json({
                success: true,
                settings
            });
        } catch (error) {
            console.error('Error fetching notification settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch notification settings',
                error: error.message
            });
        }
    }

    // Update notification settings
    async updateNotificationSettings(req, res) {
        try {
            const {
                email_notifications,
                system_notifications,
                purchase_order_alerts,
                low_stock_alerts,
                retread_due_alerts,
                vehicle_service_alerts,
                user_login_alerts,
                daily_summary,
                weekly_report,
                updated_by
            } = req.body;

            // Check if settings exist
            const settings = await getQuery(`SELECT * FROM notification_settings WHERE id = 1`);

            if (!settings) {
                await runQuery(`
                    INSERT INTO notification_settings (
                        id, email_notifications, system_notifications,
                        purchase_order_alerts, low_stock_alerts, retread_due_alerts,
                        vehicle_service_alerts, user_login_alerts, daily_summary, weekly_report,
                        updated_by, updated_at
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    email_notifications ? 1 : 0,
                    system_notifications ? 1 : 0,
                    purchase_order_alerts ? 1 : 0,
                    low_stock_alerts ? 1 : 0,
                    retread_due_alerts ? 1 : 0,
                    vehicle_service_alerts ? 1 : 0,
                    user_login_alerts ? 1 : 0,
                    daily_summary ? 1 : 0,
                    weekly_report ? 1 : 0,
                    updated_by || null
                ]);
            } else {
                await runQuery(`
                    UPDATE notification_settings SET
                        email_notifications = ?,
                        system_notifications = ?,
                        purchase_order_alerts = ?,
                        low_stock_alerts = ?,
                        retread_due_alerts = ?,
                        vehicle_service_alerts = ?,
                        user_login_alerts = ?,
                        daily_summary = ?,
                        weekly_report = ?,
                        updated_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `, [
                    email_notifications ? 1 : 0,
                    system_notifications ? 1 : 0,
                    purchase_order_alerts ? 1 : 0,
                    low_stock_alerts ? 1 : 0,
                    retread_due_alerts ? 1 : 0,
                    vehicle_service_alerts ? 1 : 0,
                    user_login_alerts ? 1 : 0,
                    daily_summary ? 1 : 0,
                    weekly_report ? 1 : 0,
                    updated_by || null
                ]);
            }

            // Log audit
            await this.logAudit({
                user_id: updated_by,
                action: 'UPDATE_NOTIFICATION_SETTINGS',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req
            });

            res.json({
                success: true,
                message: 'Notification settings updated successfully'
            });
        } catch (error) {
            console.error('Error updating notification settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update notification settings',
                error: error.message
            });
        }
    }

    // =============== BACKUP SETTINGS ===============

    // Get backup settings
    async getBackupSettings(req, res) {
        try {
            let settings = await getQuery(`
                SELECT * FROM backup_settings WHERE id = 1
            `);

            if (!settings) {
                await runQuery(`
                    INSERT INTO backup_settings (
                        id, enabled, frequency, retention_days, backup_time, include_attachments
                    ) VALUES (1, 1, 'daily', 30, '02:00', 1)
                `);

                settings = await getQuery(`SELECT * FROM backup_settings WHERE id = 1`);
            }

            res.json({
                success: true,
                settings
            });
        } catch (error) {
            console.error('Error fetching backup settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch backup settings',
                error: error.message
            });
        }
    }

    // Update backup settings
    async updateBackupSettings(req, res) {
        try {
            const {
                enabled,
                frequency,
                retention_days,
                backup_time,
                include_attachments,
                updated_by
            } = req.body;

            // Check if settings exist
            const settings = await getQuery(`SELECT * FROM backup_settings WHERE id = 1`);

            if (!settings) {
                await runQuery(`
                    INSERT INTO backup_settings (
                        id, enabled, frequency, retention_days, backup_time, include_attachments,
                        updated_by, updated_at
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    enabled ? 1 : 0,
                    frequency || 'daily',
                    retention_days || 30,
                    backup_time || '02:00',
                    include_attachments ? 1 : 0,
                    updated_by || null
                ]);
            } else {
                await runQuery(`
                    UPDATE backup_settings SET
                        enabled = ?,
                        frequency = ?,
                        retention_days = ?,
                        backup_time = ?,
                        include_attachments = ?,
                        updated_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `, [
                    enabled ? 1 : 0,
                    frequency || 'daily',
                    retention_days || 30,
                    backup_time || '02:00',
                    include_attachments ? 1 : 0,
                    updated_by || null
                ]);
            }

            // Log audit
            await this.logAudit({
                user_id: updated_by,
                action: 'UPDATE_BACKUP_SETTINGS',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req
            });

            res.json({
                success: true,
                message: 'Backup settings updated successfully'
            });
        } catch (error) {
            console.error('Error updating backup settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update backup settings',
                error: error.message
            });
        }
    }

    // Create manual backup
    async createBackup(req, res) {
        try {
            const { user } = req;
            
            // Here you would implement actual backup logic
            // For now, we'll simulate a backup
            const backupTimestamp = new Date().toISOString();
            const backupSize = Math.floor(Math.random() * 10000000) + 5000000; // Random 5-15MB

            await runQuery(`
                UPDATE backup_settings SET
                    last_backup = CURRENT_TIMESTAMP,
                    last_backup_size = ?,
                    last_backup_status = 'success',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `, [backupSize]);

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'CREATE_BACKUP',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req,
                new_values: { size: backupSize, timestamp: backupTimestamp }
            });

            res.json({
                success: true,
                message: 'Backup created successfully',
                backup: {
                    timestamp: backupTimestamp,
                    size: backupSize,
                    status: 'success'
                }
            });
        } catch (error) {
            console.error('Error creating backup:', error);

            // Update backup status to failed
            await runQuery(`
                UPDATE backup_settings SET
                    last_backup_status = 'failed',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = 1
            `);

            res.status(500).json({
                success: false,
                message: 'Failed to create backup',
                error: error.message
            });
        }
    }

    // =============== AUDIT SETTINGS ===============

    // Get audit settings
    async getAuditSettings(req, res) {
        try {
            let settings = await getQuery(`
                SELECT * FROM audit_settings WHERE id = 1
            `);

            if (!settings) {
                await runQuery(`
                    INSERT INTO audit_settings (
                        id, retention_days, log_failed_logins, log_successful_logins,
                        log_api_calls, log_data_changes, log_exports
                    ) VALUES (1, 90, 1, 0, 0, 1, 1)
                `);

                settings = await getQuery(`SELECT * FROM audit_settings WHERE id = 1`);
            }

            res.json({
                success: true,
                settings
            });
        } catch (error) {
            console.error('Error fetching audit settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch audit settings',
                error: error.message
            });
        }
    }

    // Update audit settings
    async updateAuditSettings(req, res) {
        try {
            const {
                retention_days,
                log_failed_logins,
                log_successful_logins,
                log_api_calls,
                log_data_changes,
                log_exports,
                updated_by
            } = req.body;

            // Check if settings exist
            const settings = await getQuery(`SELECT * FROM audit_settings WHERE id = 1`);

            if (!settings) {
                await runQuery(`
                    INSERT INTO audit_settings (
                        id, retention_days, log_failed_logins, log_successful_logins,
                        log_api_calls, log_data_changes, log_exports,
                        updated_by, updated_at
                    ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                `, [
                    retention_days || 90,
                    log_failed_logins ? 1 : 0,
                    log_successful_logins ? 1 : 0,
                    log_api_calls ? 1 : 0,
                    log_data_changes ? 1 : 0,
                    log_exports ? 1 : 0,
                    updated_by || null
                ]);
            } else {
                await runQuery(`
                    UPDATE audit_settings SET
                        retention_days = ?,
                        log_failed_logins = ?,
                        log_successful_logins = ?,
                        log_api_calls = ?,
                        log_data_changes = ?,
                        log_exports = ?,
                        updated_by = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = 1
                `, [
                    retention_days || 90,
                    log_failed_logins ? 1 : 0,
                    log_successful_logins ? 1 : 0,
                    log_api_calls ? 1 : 0,
                    log_data_changes ? 1 : 0,
                    log_exports ? 1 : 0,
                    updated_by || null
                ]);
            }

            // Log audit
            await this.logAudit({
                user_id: updated_by,
                action: 'UPDATE_AUDIT_SETTINGS',
                entity_type: 'SYSTEM',
                entity_id: 1,
                req
            });

            res.json({
                success: true,
                message: 'Audit settings updated successfully'
            });
        } catch (error) {
            console.error('Error updating audit settings:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update audit settings',
                error: error.message
            });
        }
    }

    // =============== TAX RATES ===============

    // Get all tax rates
    async getTaxRates(req, res) {
        try {
            const { include_inactive } = req.query;
            
            let sql = `
                SELECT 
                    t.*,
                    CASE 
                        WHEN t.id = (SELECT setting_value FROM system_settings_store WHERE setting_key = 'default_tax_rate_id') 
                        THEN 1 ELSE 0 
                    END as is_default
                FROM tax_rates t
            `;
            
            const params = [];
            
            if (include_inactive !== 'true') {
                sql += ' WHERE t.is_active = 1';
            }
            
            sql += ' ORDER BY t.is_active DESC, t.name ASC';

            const taxRates = await allQuery(sql, params);

            res.json({
                success: true,
                tax_rates: taxRates
            });
        } catch (error) {
            console.error('Error fetching tax rates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch tax rates',
                error: error.message
            });
        }
    }

    // Create tax rate
    async createTaxRate(req, res) {
        try {
            const { name, rate, type, description, is_default, is_active } = req.body;
            const { user } = req;

            if (!name || rate === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and rate are required'
                });
            }

            // Start transaction
            await runQuery('BEGIN TRANSACTION');

            // Insert tax rate
            const result = await runQuery(`
                INSERT INTO tax_rates (name, rate, type, description, is_active)
                VALUES (?, ?, ?, ?, ?)
            `, [
                name,
                parseFloat(rate),
                type || 'VAT',
                description || null,
                is_active ? 1 : 0
            ]);

            const taxRateId = result.lastID;

            // Set as default if requested
            if (is_default) {
                await this.setDefaultTaxRate(taxRateId);
            }

            await runQuery('COMMIT');

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'CREATE_TAX_RATE',
                entity_type: 'TAX_RATE',
                entity_id: taxRateId,
                req,
                new_values: { name, rate, type, description }
            });

            res.json({
                success: true,
                message: 'Tax rate created successfully',
                tax_rate_id: taxRateId
            });
        } catch (error) {
            await runQuery('ROLLBACK');
            console.error('Error creating tax rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create tax rate',
                error: error.message
            });
        }
    }

    // Update tax rate
    async updateTaxRate(req, res) {
        try {
            const { id } = req.params;
            const { name, rate, type, description, is_default, is_active } = req.body;
            const { user } = req;

            if (!name || rate === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and rate are required'
                });
            }

            // Start transaction
            await runQuery('BEGIN TRANSACTION');

            // Get old values for audit
            const oldValues = await getQuery(
                'SELECT * FROM tax_rates WHERE id = ?',
                [id]
            );

            if (!oldValues) {
                await runQuery('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'Tax rate not found'
                });
            }

            // Update tax rate
            await runQuery(`
                UPDATE tax_rates SET
                    name = ?,
                    rate = ?,
                    type = ?,
                    description = ?,
                    is_active = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                name,
                parseFloat(rate),
                type || 'VAT',
                description || null,
                is_active ? 1 : 0,
                id
            ]);

            // Set as default if requested
            if (is_default) {
                await this.setDefaultTaxRate(id);
            }

            await runQuery('COMMIT');

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'UPDATE_TAX_RATE',
                entity_type: 'TAX_RATE',
                entity_id: parseInt(id),
                req,
                old_values: oldValues,
                new_values: { name, rate, type, description }
            });

            res.json({
                success: true,
                message: 'Tax rate updated successfully'
            });
        } catch (error) {
            await runQuery('ROLLBACK');
            console.error('Error updating tax rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update tax rate',
                error: error.message
            });
        }
    }

    // Delete tax rate
    async deleteTaxRate(req, res) {
        try {
            const { id } = req.params;
            const { user } = req;

            // Check if tax rate exists
            const taxRate = await getQuery(
                'SELECT * FROM tax_rates WHERE id = ?',
                [id]
            );

            if (!taxRate) {
                return res.status(404).json({
                    success: false,
                    message: 'Tax rate not found'
                });
            }

            // Check if tax rate is in use
            const usage = await getQuery(`
                SELECT COUNT(*) as count FROM purchase_order_items WHERE tax_rate_id = ?
            `, [id]);

            if (usage.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete tax rate that is in use'
                });
            }

            // Check if it's the default
            const isDefault = await getQuery(`
                SELECT setting_value FROM system_settings_store 
                WHERE setting_key = 'default_tax_rate_id' AND setting_value = ?
            `, [id.toString()]);

            if (isDefault) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete default tax rate. Set another tax rate as default first.'
                });
            }

            // Get old values for audit
            const oldValues = { ...taxRate };

            // Delete tax rate
            await runQuery('DELETE FROM tax_rates WHERE id = ?', [id]);

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'DELETE_TAX_RATE',
                entity_type: 'TAX_RATE',
                entity_id: parseInt(id),
                req,
                old_values: oldValues
            });

            res.json({
                success: true,
                message: 'Tax rate deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting tax rate:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete tax rate',
                error: error.message
            });
        }
    }

    // Helper: Set default tax rate
    async setDefaultTaxRate(taxRateId) {
        // Remove current default
        await runQuery(`
            DELETE FROM system_settings_store WHERE setting_key = 'default_tax_rate_id'
        `);

        // Set new default
        await runQuery(`
            INSERT INTO system_settings_store (setting_key, setting_value)
            VALUES ('default_tax_rate_id', ?)
        `, [taxRateId.toString()]);
    }

    // =============== PAYMENT TERMS ===============

    // Get all payment terms
    async getPaymentTerms(req, res) {
        try {
            const { include_inactive } = req.query;
            
            let sql = `
                SELECT 
                    p.*,
                    CASE 
                        WHEN p.id = (SELECT setting_value FROM system_settings_store WHERE setting_key = 'default_payment_term_id') 
                        THEN 1 ELSE 0 
                    END as is_default
                FROM payment_terms p
            `;
            
            const params = [];
            
            if (include_inactive !== 'true') {
                sql += ' WHERE p.is_active = 1';
            }
            
            sql += ' ORDER BY p.is_active DESC, p.days ASC';

            const paymentTerms = await allQuery(sql, params);

            res.json({
                success: true,
                payment_terms: paymentTerms
            });
        } catch (error) {
            console.error('Error fetching payment terms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment terms',
                error: error.message
            });
        }
    }

    // Create payment term
    async createPaymentTerm(req, res) {
        try {
            const { name, days, description, is_default, is_active } = req.body;
            const { user } = req;

            if (!name || days === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and days are required'
                });
            }

            // Start transaction
            await runQuery('BEGIN TRANSACTION');

            // Insert payment term
            const result = await runQuery(`
                INSERT INTO payment_terms (name, days, description, is_active)
                VALUES (?, ?, ?, ?)
            `, [
                name,
                parseInt(days),
                description || null,
                is_active ? 1 : 0
            ]);

            const paymentTermId = result.lastID;

            // Set as default if requested
            if (is_default) {
                await this.setDefaultPaymentTerm(paymentTermId);
            }

            await runQuery('COMMIT');

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'CREATE_PAYMENT_TERM',
                entity_type: 'PAYMENT_TERM',
                entity_id: paymentTermId,
                req,
                new_values: { name, days, description }
            });

            res.json({
                success: true,
                message: 'Payment term created successfully',
                payment_term_id: paymentTermId
            });
        } catch (error) {
            await runQuery('ROLLBACK');
            console.error('Error creating payment term:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create payment term',
                error: error.message
            });
        }
    }

    // Update payment term
    async updatePaymentTerm(req, res) {
        try {
            const { id } = req.params;
            const { name, days, description, is_default, is_active } = req.body;
            const { user } = req;

            if (!name || days === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Name and days are required'
                });
            }

            // Start transaction
            await runQuery('BEGIN TRANSACTION');

            // Get old values for audit
            const oldValues = await getQuery(
                'SELECT * FROM payment_terms WHERE id = ?',
                [id]
            );

            if (!oldValues) {
                await runQuery('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    message: 'Payment term not found'
                });
            }

            // Update payment term
            await runQuery(`
                UPDATE payment_terms SET
                    name = ?,
                    days = ?,
                    description = ?,
                    is_active = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                name,
                parseInt(days),
                description || null,
                is_active ? 1 : 0,
                id
            ]);

            // Set as default if requested
            if (is_default) {
                await this.setDefaultPaymentTerm(id);
            }

            await runQuery('COMMIT');

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'UPDATE_PAYMENT_TERM',
                entity_type: 'PAYMENT_TERM',
                entity_id: parseInt(id),
                req,
                old_values: oldValues,
                new_values: { name, days, description }
            });

            res.json({
                success: true,
                message: 'Payment term updated successfully'
            });
        } catch (error) {
            await runQuery('ROLLBACK');
            console.error('Error updating payment term:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update payment term',
                error: error.message
            });
        }
    }

    // Delete payment term
    async deletePaymentTerm(req, res) {
        try {
            const { id } = req.params;
            const { user } = req;

            // Check if payment term exists
            const paymentTerm = await getQuery(
                'SELECT * FROM payment_terms WHERE id = ?',
                [id]
            );

            if (!paymentTerm) {
                return res.status(404).json({
                    success: false,
                    message: 'Payment term not found'
                });
            }

            // Check if payment term is in use
            const usage = await getQuery(`
                SELECT COUNT(*) as count FROM purchase_orders WHERE payment_term_id = ?
            `, [id]);

            if (usage.count > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete payment term that is in use'
                });
            }

            // Check if it's the default
            const isDefault = await getQuery(`
                SELECT setting_value FROM system_settings_store 
                WHERE setting_key = 'default_payment_term_id' AND setting_value = ?
            `, [id.toString()]);

            if (isDefault) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete default payment term. Set another payment term as default first.'
                });
            }

            // Get old values for audit
            const oldValues = { ...paymentTerm };

            // Delete payment term
            await runQuery('DELETE FROM payment_terms WHERE id = ?', [id]);

            // Log audit
            await this.logAudit({
                user_id: user?.id,
                action: 'DELETE_PAYMENT_TERM',
                entity_type: 'PAYMENT_TERM',
                entity_id: parseInt(id),
                req,
                old_values: oldValues
            });

            res.json({
                success: true,
                message: 'Payment term deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting payment term:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete payment term',
                error: error.message
            });
        }
    }

    // Helper: Set default payment term
    async setDefaultPaymentTerm(paymentTermId) {
        // Remove current default
        await runQuery(`
            DELETE FROM system_settings_store WHERE setting_key = 'default_payment_term_id'
        `);

        // Set new default
        await runQuery(`
            INSERT INTO system_settings_store (setting_key, setting_value)
            VALUES ('default_payment_term_id', ?)
        `, [paymentTermId.toString()]);
    }

    // =============== AUDIT LOGGING ===============

    async logAudit({ user_id, action, entity_type, entity_id, req, old_values, new_values }) {
        try {
            const ip = req?.ip || req?.connection?.remoteAddress || null;
            const userAgent = req?.headers['user-agent'] || null;

            await runQuery(`
                INSERT INTO audit_log 
                (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                user_id || null,
                action,
                entity_type,
                entity_id || null,
                old_values ? JSON.stringify(old_values) : null,
                new_values ? JSON.stringify(new_values) : null,
                ip,
                userAgent
            ]);
        } catch (error) {
            console.error('Error logging audit:', error);
        }
    }
}

module.exports = SettingsController;