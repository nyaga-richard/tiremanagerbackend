import { NextResponse } from 'next/server';
import db from '@/config/database';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('userId');
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Parse CSV
    const fileContent = await file.text();
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const results = {
      success: [],
      errors: [],
      total: records.length
    };

    // Process each record
    for (const record of records) {
      try {
        // Validate required fields
        if (!record.serial_number || !record.size || !record.brand) {
          throw new Error('Missing required fields: serial_number, size, brand');
        }

        // Check if serial number already exists
        const existing = await new Promise((resolve, reject) => {
          db.get(
            'SELECT id FROM tires WHERE serial_number = ?',
            [record.serial_number.trim()],
            (err, row) => {
              if (err) reject(err);
              else resolve(row);
            }
          );
        });

        if (existing) {
          throw new Error(`Serial number ${record.serial_number} already exists`);
        }

        // Insert tire
        const result = await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO tires (
              serial_number, size, brand, model, type, status,
              purchase_cost, supplier_id, purchase_date, current_location,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [
              record.serial_number.trim(),
              record.size.trim(),
              record.brand.trim(),
              record.model || null,
              (record.type || 'NEW').toUpperCase(),
              'IN_STORE',
              record.purchase_cost ? parseFloat(record.purchase_cost) : null,
              record.supplier_id ? parseInt(record.supplier_id) : null,
              record.purchase_date || new Date().toISOString().split('T')[0],
              record.current_location || 'Main Store',
            ],
            function(err) {
              if (err) reject(err);
              else resolve(this.lastID);
            }
          );
        });

        // Update inventory catalog
        await updateInventoryCatalog(record);

        // Log movement
        await logMovement({
          tire_id: result,
          from_location: 'UPLOAD',
          to_location: record.current_location || 'Main Store',
          movement_type: 'PURCHASE_TO_STORE',
          user_id: userId,
          notes: `Imported via CSV upload`
        });

        results.success.push({
          serial_number: record.serial_number,
          id: result
        });

      } catch (error) {
        results.errors.push({
          row: record,
          error: error.message
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.success.length} of ${results.total} tires`,
      results
    });

  } catch (error) {
    console.error('CSV upload error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Generate CSV template
    const headers = [
      'serial_number',
      'size',
      'brand',
      'model',
      'type',
      'purchase_cost',
      'supplier_id',
      'purchase_date',
      'current_location'
    ];

    const exampleRow = {
      serial_number: 'TIRE001234',
      size: '11R22.5',
      brand: 'Michelin',
      model: 'XZA2',
      type: 'NEW',
      purchase_cost: '45000',
      supplier_id: '1',
      purchase_date: '2024-01-15',
      current_location: 'Main Store'
    };

    const csv = [
      headers.join(','),
      headers.map(h => exampleRow[h]).join(',')
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="tires-upload-template.csv"'
      }
    });

  } catch (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Helper function to update inventory catalog
async function updateInventoryCatalog(record) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id FROM inventory_catalog 
       WHERE size = ? AND brand = ? AND (model = ? OR (model IS NULL AND ? IS NULL)) AND type = ?`,
      [record.size, record.brand, record.model || null, record.model || null, record.type || 'NEW'],
      (err, row) => {
        if (err) reject(err);
        
        if (row) {
          // Update existing
          db.run(
            `UPDATE inventory_catalog 
             SET current_stock = current_stock + 1,
                 last_purchase_date = ?,
                 last_purchase_price = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [record.purchase_date || new Date().toISOString().split('T')[0],
             record.purchase_cost || null,
             row.id],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        } else {
          // Insert new
          db.run(
            `INSERT INTO inventory_catalog 
             (size, brand, model, type, current_stock, last_purchase_date, last_purchase_price)
             VALUES (?, ?, ?, ?, 1, ?, ?)`,
            [record.size, record.brand, record.model || null, record.type || 'NEW',
             record.purchase_date || new Date().toISOString().split('T')[0],
             record.purchase_cost || null],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        }
      }
    );
  });
}

// Helper function to log tire movement
async function logMovement(data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tire_movements 
       (tire_id, from_location, to_location, movement_type, user_id, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [data.tire_id, data.from_location, data.to_location, data.movement_type, data.user_id, data.notes],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}