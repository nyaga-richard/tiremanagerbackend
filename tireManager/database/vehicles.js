const queries = [
  `ALTER TABLE vehicles ADD COLUMN retired_date DATE;`,
  `ALTER TABLE vehicles ADD COLUMN retirement_reason TEXT;`,
  `ALTER TABLE vehicles ADD COLUMN retired_by INTEGER;`,
  
  `CREATE TABLE IF NOT EXISTS vehicle_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL,
    details TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
  );`
];

module.exports = queries;