// class InventoryCatalogController {
//     // Get all inventory items
//     static async getAllInventory(req, res) {
//         try {
//             const filters = req.query;
//             const db = require('../config/database');
            
//             // Build query dynamically
//             let conditions = [];
//             let values = [];

//             if (filters.size) {
//                 conditions.push('size LIKE ?');
//                 values.push(`%${filters.size}%`);
//             }
//             if (filters.brand) {
//                 conditions.push('brand LIKE ?');
//                 values.push(`%${filters.brand}%`);
//             }
//             if (filters.model) {
//                 conditions.push('model LIKE ?');
//                 values.push(`%${filters.model}%`);
//             }
//             if (filters.type) {
//                 conditions.push('type = ?');
//                 values.push(filters.type);
//             }
//             if (filters.is_active !== undefined) {
//                 conditions.push('is_active = ?');
//                 values.push(filters.is_active ? 1 : 0);
//             }

//             const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
//             const sql = `SELECT * FROM inventory_catalog ${whereClause} ORDER BY size, brand, model`;

//             const inventory = await new Promise((resolve, reject) => {
//                 db.all(sql, values, (err, rows) => {
//                     if (err) reject(err);
//                     else resolve(rows);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 data: inventory
//             });
//         } catch (error) {
//             console.error('Error fetching inventory:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to fetch inventory',
//                 error: error.message
//             });
//         }
//     }

//     // Get inventory summary
//     static async getInventorySummary(req, res) {
//         try {
//             const db = require('../config/database');
            
//             const sql = `
//                 SELECT 
//                     COUNT(*) as total_items,
//                     SUM(current_stock) as total_stock,
//                     SUM(CASE WHEN current_stock <= reorder_point THEN 1 ELSE 0 END) as low_stock_items,
//                     SUM(CASE WHEN current_stock <= min_stock THEN 1 ELSE 0 END) as critical_stock_items,
//                     AVG(current_stock) as avg_stock_level
//                 FROM inventory_catalog 
//                 WHERE is_active = 1`;

//             const summary = await new Promise((resolve, reject) => {
//                 db.get(sql, [], (err, row) => {
//                     if (err) reject(err);
//                     else resolve(row);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 data: summary
//             });
//         } catch (error) {
//             console.error('Error fetching inventory summary:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to fetch inventory summary',
//                 error: error.message
//             });
//         }
//     }

//     // Create or update inventory item
//     static async upsertInventoryItem(req, res) {
//         try {
//             const { size, brand = null, model = null, type = 'NEW' } = req.body;
//             const db = require('../config/database');
            
//             if (!size) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Size is required'
//                 });
//             }
            
//             // Check if item already exists
//             const existing = await new Promise((resolve, reject) => {
//                 const sql = `SELECT * FROM inventory_catalog WHERE size = ? AND brand = ? AND model = ? AND type = ?`;
//                 db.get(sql, [size, brand, model, type], (err, row) => {
//                     if (err) reject(err);
//                     else resolve(row);
//                 });
//             });
            
//             if (existing) {
//                 // Update existing item
//                 const updateData = { ...req.body };
//                 delete updateData.size;
//                 delete updateData.brand;
//                 delete updateData.model;
//                 delete updateData.type;
                
//                 const updates = Object.keys(updateData).map(key => `${key} = ?`);
//                 const values = [...Object.values(updateData), size, brand, model, type];
                
//                 const sql = `UPDATE inventory_catalog SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP 
//                             WHERE size = ? AND brand = ? AND model = ? AND type = ?`;
                
//                 await new Promise((resolve, reject) => {
//                     db.run(sql, values, function(err) {
//                         if (err) reject(err);
//                         else resolve(this.changes);
//                     });
//                 });
                
//                 const updatedItem = await new Promise((resolve, reject) => {
//                     const sql = `SELECT * FROM inventory_catalog WHERE size = ? AND brand = ? AND model = ? AND type = ?`;
//                     db.get(sql, [size, brand, model, type], (err, row) => {
//                         if (err) reject(err);
//                         else resolve(row);
//                     });
//                 });
                
//                 res.json({
//                     success: true,
//                     message: 'Inventory item updated successfully',
//                     data: updatedItem
//                 });
//             } else {
//                 // Create new item
//                 const keys = Object.keys(req.body);
//                 const placeholders = keys.map(() => '?').join(', ');
//                 const values = Object.values(req.body);
                
//                 const sql = `INSERT INTO inventory_catalog (${keys.join(', ')}, created_at, updated_at) 
//                             VALUES (${placeholders}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
                
//                 const result = await new Promise((resolve, reject) => {
//                     db.run(sql, values, function(err) {
//                         if (err) reject(err);
//                         else resolve(this.lastID);
//                     });
//                 });
                
//                 const newItem = await new Promise((resolve, reject) => {
//                     const sql = `SELECT * FROM inventory_catalog WHERE id = ?`;
//                     db.get(sql, [result], (err, row) => {
//                         if (err) reject(err);
//                         else resolve(row);
//                     });
//                 });
                
//                 res.status(201).json({
//                     success: true,
//                     message: 'Inventory item created successfully',
//                     data: newItem
//                 });
//             }
//         } catch (error) {
//             console.error('Error upserting inventory item:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to upsert inventory item',
//                 error: error.message
//             });
//         }
//     }

//     // Update stock levels
//     static async updateStock(req, res) {
//         try {
//             const { size, brand = null, model = null, type = 'NEW', quantity_change } = req.body;
//             const db = require('../config/database');
            
//             if (!size || quantity_change === undefined) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Size and quantity_change are required'
//                 });
//             }
            
//             const sql = `
//                 UPDATE inventory_catalog 
//                 SET current_stock = current_stock + ?,
//                     updated_at = CURRENT_TIMESTAMP
//                 WHERE size = ? AND brand = ? AND model = ? AND type = ?`;

//             const changes = await new Promise((resolve, reject) => {
//                 db.run(sql, [parseInt(quantity_change), size, brand, model, type], function(err) {
//                     if (err) reject(err);
//                     else resolve(this.changes);
//                 });
//             });
            
//             const updatedItem = await new Promise((resolve, reject) => {
//                 const sql = `SELECT * FROM inventory_catalog WHERE size = ? AND brand = ? AND model = ? AND type = ?`;
//                 db.get(sql, [size, brand, model, type], (err, row) => {
//                     if (err) reject(err);
//                     else resolve(row);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 message: 'Stock updated successfully',
//                 data: updatedItem
//             });
//         } catch (error) {
//             console.error('Error updating stock:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to update stock',
//                 error: error.message
//             });
//         }
//     }

//     // Get low stock items
//     static async getLowStock(req, res) {
//         try {
//             const db = require('../config/database');
            
//             const sql = `
//                 SELECT * FROM inventory_catalog 
//                 WHERE current_stock <= reorder_point 
//                     AND is_active = 1
//                 ORDER BY (current_stock * 1.0 / reorder_point) ASC`;

//             const lowStock = await new Promise((resolve, reject) => {
//                 db.all(sql, [], (err, rows) => {
//                     if (err) reject(err);
//                     else resolve(rows);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 data: lowStock
//             });
//         } catch (error) {
//             console.error('Error fetching low stock items:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to fetch low stock items',
//                 error: error.message
//             });
//         }
//     }

//     // Search inventory
//     static async searchInventory(req, res) {
//         try {
//             const { q } = req.query;
//             const db = require('../config/database');
            
//             if (!q) {
//                 return res.status(400).json({
//                     success: false,
//                     message: 'Search query is required'
//                 });
//             }
            
//             const sql = `
//                 SELECT * FROM inventory_catalog 
//                 WHERE (size LIKE ? OR brand LIKE ? OR model LIKE ?)
//                     AND is_active = 1
//                 ORDER BY size, brand, model
//                 LIMIT 50`;
            
//             const searchTerm = `%${q}%`;
//             const results = await new Promise((resolve, reject) => {
//                 db.all(sql, [searchTerm, searchTerm, searchTerm], (err, rows) => {
//                     if (err) reject(err);
//                     else resolve(rows);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 data: results
//             });
//         } catch (error) {
//             console.error('Error searching inventory:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to search inventory',
//                 error: error.message
//             });
//         }
//     }

//     // Get inventory catalog with statistics
//     static async getInventoryStats(req, res) {
//         try {
//             const db = require('../config/database');
            
//             const sql = `
//                 SELECT 
//                     size,
//                     brand,
//                     model,
//                     type,
//                     current_stock,
//                     reorder_point,
//                     min_stock,
//                     max_stock,
//                     last_purchase_date,
//                     last_purchase_price,
//                     average_cost,
//                     is_active,
//                     (current_stock * 1.0 / reorder_point * 100) as stock_percentage,
//                     CASE 
//                         WHEN current_stock <= min_stock THEN 'CRITICAL'
//                         WHEN current_stock <= reorder_point THEN 'LOW'
//                         ELSE 'OK'
//                     END as stock_status
//                 FROM inventory_catalog 
//                 WHERE is_active = 1
//                 ORDER BY stock_percentage ASC, size, brand`;

//             const stats = await new Promise((resolve, reject) => {
//                 db.all(sql, [], (err, rows) => {
//                     if (err) reject(err);
//                     else resolve(rows);
//                 });
//             });
            
//             res.json({
//                 success: true,
//                 data: stats
//             });
//         } catch (error) {
//             console.error('Error fetching inventory stats:', error);
//             res.status(500).json({
//                 success: false,
//                 message: 'Failed to fetch inventory statistics',
//                 error: error.message
//             });
//         }
//     }
// }

// module.exports = InventoryCatalogController;