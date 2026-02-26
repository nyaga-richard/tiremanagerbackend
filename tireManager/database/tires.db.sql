BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "accounting_transactions" (
	"id"	INTEGER,
	"transaction_date"	DATE NOT NULL,
	"posting_date"	DATE NOT NULL,
	"transaction_number"	TEXT NOT NULL UNIQUE,
	"reference_number"	TEXT,
	"description"	TEXT NOT NULL,
	"transaction_type"	TEXT NOT NULL CHECK("transaction_type" IN ('PURCHASE_INVOICE', 'PAYMENT', 'JOURNAL_ENTRY', 'CREDIT_NOTE')),
	"total_amount"	REAL NOT NULL,
	"currency"	TEXT DEFAULT 'USD',
	"status"	TEXT DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT', 'POSTED', 'VOID', 'REVERSED')),
	"supplier_id"	INTEGER,
	"customer_id"	INTEGER,
	"related_grn_id"	INTEGER,
	"related_po_id"	INTEGER,
	"created_by"	INTEGER NOT NULL,
	"approved_by"	INTEGER,
	"posted_by"	INTEGER,
	"posted_date"	TIMESTAMP,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("created_by") REFERENCES "users"("id") ON DELETE SET NULL,
	FOREIGN KEY("related_grn_id") REFERENCES "goods_received_notes"("id") ON DELETE SET NULL,
	FOREIGN KEY("related_po_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL,
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id"	INTEGER,
	"user_id"	INTEGER,
	"action"	TEXT NOT NULL,
	"entity_type"	TEXT NOT NULL,
	"entity_id"	INTEGER,
	"old_values"	TEXT,
	"new_values"	TEXT,
	"ip_address"	TEXT,
	"user_agent"	TEXT,
	"timestamp"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "audit_settings" (
	"id"	INTEGER,
	"retention_days"	INTEGER DEFAULT 90,
	"log_failed_logins"	BOOLEAN DEFAULT 1,
	"log_successful_logins"	BOOLEAN DEFAULT 0,
	"log_api_calls"	BOOLEAN DEFAULT 0,
	"log_data_changes"	BOOLEAN DEFAULT 1,
	"log_exports"	BOOLEAN DEFAULT 1,
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "backup_settings" (
	"id"	INTEGER,
	"enabled"	BOOLEAN DEFAULT 1,
	"frequency"	TEXT DEFAULT 'daily' CHECK("frequency" IN ('daily', 'weekly', 'monthly')),
	"retention_days"	INTEGER DEFAULT 30,
	"backup_time"	TEXT DEFAULT '02:00',
	"include_attachments"	BOOLEAN DEFAULT 1,
	"last_backup"	TIMESTAMP,
	"last_backup_size"	INTEGER,
	"last_backup_status"	TEXT CHECK("last_backup_status" IN ('success', 'failed')),
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "chart_of_accounts" (
	"id"	INTEGER,
	"account_code"	TEXT NOT NULL UNIQUE,
	"account_name"	TEXT NOT NULL,
	"account_type"	TEXT NOT NULL CHECK("account_type" IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
	"sub_type"	TEXT,
	"normal_balance"	TEXT CHECK("normal_balance" IN ('DEBIT', 'CREDIT')),
	"is_active"	BOOLEAN DEFAULT 1,
	"description"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "email_settings" (
	"id"	INTEGER,
	"smtp_host"	TEXT,
	"smtp_port"	INTEGER,
	"smtp_encryption"	TEXT DEFAULT 'tls' CHECK("smtp_encryption" IN ('tls', 'ssl', 'none')),
	"smtp_username"	TEXT,
	"smtp_password"	TEXT,
	"from_email"	TEXT,
	"from_name"	TEXT,
	"reply_to"	TEXT,
	"enabled"	BOOLEAN DEFAULT 0,
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "goods_received_notes" (
	"id"	INTEGER,
	"grn_number"	TEXT NOT NULL UNIQUE,
	"po_id"	INTEGER,
	"retread_order_id"	INTEGER,
	"receipt_date"	DATE NOT NULL,
	"received_by"	INTEGER NOT NULL,
	"supplier_invoice_number"	TEXT,
	"delivery_note_number"	TEXT,
	"vehicle_number"	TEXT,
	"driver_name"	TEXT,
	"notes"	TEXT,
	"status"	TEXT DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT', 'COMPLETED', 'CANCELLED')),
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("po_id") REFERENCES "purchase_orders"("id"),
	FOREIGN KEY("received_by") REFERENCES "users"("id"),
	FOREIGN KEY("retread_order_id") REFERENCES "retread_orders"("id")
);
CREATE TABLE IF NOT EXISTS "grn_items" (
	"id"	INTEGER,
	"grn_id"	INTEGER NOT NULL,
	"po_item_id"	INTEGER,
	"retread_order_item_id"	INTEGER,
	"quantity_received"	INTEGER NOT NULL CHECK("quantity_received" > 0),
	"unit_cost"	REAL NOT NULL,
	"batch_number"	TEXT,
	"serial_numbers"	TEXT,
	"brand"	TEXT,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("grn_id") REFERENCES "goods_received_notes"("id") ON DELETE CASCADE,
	FOREIGN KEY("po_item_id") REFERENCES "purchase_order_items"("id"),
	FOREIGN KEY("retread_order_item_id") REFERENCES "retread_order_items"("id")
);
CREATE TABLE IF NOT EXISTS "inventory_catalog" (
	"id"	INTEGER,
	"size"	TEXT NOT NULL,
	"brand"	TEXT,
	"model"	TEXT,
	"type"	TEXT DEFAULT 'NEW' CHECK("type" IN ('NEW', 'RETREADED')),
	"current_stock"	INTEGER DEFAULT 0,
	"min_stock"	INTEGER DEFAULT 0,
	"max_stock"	INTEGER,
	"reorder_point"	INTEGER,
	"last_purchase_date"	DATE,
	"last_purchase_price"	REAL,
	"average_cost"	REAL,
	"supplier_id"	INTEGER,
	"is_active"	BOOLEAN DEFAULT 1,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("size","brand","model","type"),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id")
);
CREATE TABLE IF NOT EXISTS "journal_entries" (
	"id"	INTEGER,
	"transaction_id"	INTEGER NOT NULL,
	"account_code"	TEXT NOT NULL,
	"account_name"	TEXT NOT NULL,
	"debit"	REAL DEFAULT 0,
	"credit"	REAL DEFAULT 0,
	"description"	TEXT,
	"cost_center"	TEXT,
	"department"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("transaction_id") REFERENCES "accounting_transactions"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "notification_settings" (
	"id"	INTEGER,
	"email_notifications"	BOOLEAN DEFAULT 1,
	"system_notifications"	BOOLEAN DEFAULT 1,
	"purchase_order_alerts"	BOOLEAN DEFAULT 1,
	"low_stock_alerts"	BOOLEAN DEFAULT 1,
	"retread_due_alerts"	BOOLEAN DEFAULT 1,
	"vehicle_service_alerts"	BOOLEAN DEFAULT 1,
	"user_login_alerts"	BOOLEAN DEFAULT 0,
	"daily_summary"	BOOLEAN DEFAULT 0,
	"weekly_report"	BOOLEAN DEFAULT 1,
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "password_resets" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"token"	TEXT NOT NULL UNIQUE,
	"expires_at"	TIMESTAMP NOT NULL,
	"is_used"	BOOLEAN DEFAULT 0,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "payment_terms" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"days"	INTEGER NOT NULL,
	"description"	TEXT,
	"is_active"	BOOLEAN DEFAULT 1,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "permissions" (
	"id"	INTEGER,
	"category"	TEXT NOT NULL,
	"code"	TEXT NOT NULL UNIQUE,
	"name"	TEXT NOT NULL,
	"description"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "po_receipts" (
	"id"	INTEGER,
	"po_id"	INTEGER NOT NULL,
	"po_item_id"	INTEGER NOT NULL,
	"receipt_date"	DATE NOT NULL,
	"quantity_received"	INTEGER NOT NULL,
	"unit_cost"	REAL,
	"batch_number"	TEXT,
	"received_by"	INTEGER NOT NULL,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("po_id") REFERENCES "purchase_orders"("id"),
	FOREIGN KEY("po_item_id") REFERENCES "purchase_order_items"("id")
);
CREATE TABLE IF NOT EXISTS "purchase_order_items" (
	"id"	INTEGER,
	"po_id"	INTEGER NOT NULL,
	"size"	TEXT NOT NULL,
	"brand"	TEXT,
	"model"	TEXT,
	"type"	TEXT DEFAULT 'NEW' CHECK("type" IN ('NEW', 'RETREADED')),
	"quantity"	INTEGER NOT NULL CHECK("quantity" > 0),
	"received_quantity"	INTEGER DEFAULT 0,
	"unit_price"	REAL NOT NULL,
	"line_total"	REAL GENERATED ALWAYS AS ("quantity" * "unit_price") VIRTUAL,
	"received_total"	REAL GENERATED ALWAYS AS ("received_quantity" * "unit_price") VIRTUAL,
	"remaining_quantity"	INTEGER GENERATED ALWAYS AS ("quantity" - "received_quantity") VIRTUAL,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "purchase_orders" (
	"id"	INTEGER,
	"po_number"	TEXT NOT NULL UNIQUE,
	"supplier_id"	INTEGER NOT NULL,
	"po_date"	DATE NOT NULL,
	"expected_delivery_date"	DATE,
	"delivery_date"	DATE,
	"status"	TEXT DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED', 'CLOSED')),
	"total_amount"	REAL DEFAULT 0,
	"tax_amount"	REAL DEFAULT 0,
	"shipping_amount"	REAL DEFAULT 0,
	"final_amount"	REAL DEFAULT 0,
	"notes"	TEXT,
	"terms"	TEXT,
	"shipping_address"	TEXT,
	"billing_address"	TEXT,
	"created_by"	INTEGER NOT NULL,
	"approved_by"	INTEGER,
	"approved_date"	TIMESTAMP,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id")
);
CREATE TABLE IF NOT EXISTS "retread_order_items" (
	"id"	INTEGER,
	"retread_order_id"	INTEGER NOT NULL,
	"tire_id"	INTEGER NOT NULL,
	"cost"	REAL,
	"status"	TEXT DEFAULT 'PENDING',
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("retread_order_id","tire_id"),
	FOREIGN KEY("retread_order_id") REFERENCES "retread_orders"("id") ON DELETE CASCADE,
	FOREIGN KEY("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "retread_orders" (
	"id"	INTEGER,
	"order_number"	TEXT NOT NULL UNIQUE,
	"supplier_id"	INTEGER NOT NULL,
	"status"	TEXT DEFAULT 'DRAFT' CHECK("status" IN ('DRAFT', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'RECEIVED', 'PARTIALLY_RECEIVED')),
	"total_tires"	INTEGER DEFAULT 0,
	"total_cost"	REAL DEFAULT 0,
	"expected_completion_date"	DATE,
	"sent_date"	DATE,
	"received_date"	DATE,
	"notes"	TEXT,
	"created_by"	INTEGER NOT NULL,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("created_by") REFERENCES "users"("id"),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id")
);
CREATE TABLE IF NOT EXISTS "retread_received_items" (
	"id"	INTEGER,
	"receiving_id"	INTEGER NOT NULL,
	"tire_id"	INTEGER NOT NULL,
	"received_depth"	REAL,
	"quality"	TEXT DEFAULT 'GOOD' CHECK("quality" IN ('GOOD', 'ACCEPTABLE', 'POOR')),
	"status"	TEXT NOT NULL CHECK("status" IN ('RECEIVED', 'REJECTED')),
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("receiving_id") REFERENCES "retread_receiving"("id") ON DELETE CASCADE,
	FOREIGN KEY("tire_id") REFERENCES "tires"("id")
);
CREATE TABLE IF NOT EXISTS "retread_receiving" (
	"id"	INTEGER,
	"retread_order_id"	INTEGER NOT NULL,
	"received_date"	DATE NOT NULL,
	"received_by"	INTEGER NOT NULL,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("received_by") REFERENCES "users"("id"),
	FOREIGN KEY("retread_order_id") REFERENCES "retread_orders"("id")
);
CREATE TABLE IF NOT EXISTS "retread_timeline" (
	"id"	INTEGER,
	"retread_order_id"	INTEGER NOT NULL,
	"status"	TEXT NOT NULL,
	"note"	TEXT,
	"user_id"	INTEGER NOT NULL,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("retread_order_id") REFERENCES "retread_orders"("id") ON DELETE CASCADE,
	FOREIGN KEY("user_id") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "role_permissions" (
	"role_id"	INTEGER NOT NULL,
	"permission_id"	INTEGER NOT NULL,
	"can_view"	BOOLEAN DEFAULT 0,
	"can_create"	BOOLEAN DEFAULT 0,
	"can_edit"	BOOLEAN DEFAULT 0,
	"can_delete"	BOOLEAN DEFAULT 0,
	"can_approve"	BOOLEAN DEFAULT 0,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("role_id","permission_id"),
	FOREIGN KEY("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE,
	FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "roles" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL UNIQUE,
	"description"	TEXT,
	"is_system_role"	BOOLEAN DEFAULT 0,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "supplier_ledger" (
	"id"	INTEGER,
	"supplier_id"	INTEGER NOT NULL,
	"date"	DATE NOT NULL,
	"description"	TEXT NOT NULL,
	"transaction_type"	TEXT NOT NULL CHECK("transaction_type" IN ('PURCHASE', 'PAYMENT', 'RETREAD_SERVICE')),
	"amount"	REAL NOT NULL,
	"reference_number"	TEXT,
	"created_by"	TEXT,
	"po_id"	INTEGER,
	"grn_id"	INTEGER,
	"accounting_transaction_id"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("accounting_transaction_id") REFERENCES "accounting_transactions"("id"),
	FOREIGN KEY("grn_id") REFERENCES "goods_received_notes"("id"),
	FOREIGN KEY("po_id") REFERENCES "purchase_orders"("id"),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id")
);
CREATE TABLE IF NOT EXISTS "suppliers" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"type"	TEXT NOT NULL CHECK("type" IN ('TIRE', 'RETREAD')),
	"contact_person"	TEXT,
	"phone"	TEXT,
	"email"	TEXT,
	"address"	TEXT,
	"balance"	REAL DEFAULT 0,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "system_settings" (
	"id"	INTEGER,
	"company_name"	TEXT NOT NULL,
	"company_address"	TEXT,
	"company_phone"	TEXT,
	"company_email"	TEXT,
	"company_website"	TEXT,
	"company_tax_id"	TEXT,
	"company_logo"	TEXT,
	"fiscal_year_start"	DATE,
	"fiscal_year_end"	DATE,
	"date_format"	TEXT DEFAULT 'MMM dd, yyyy',
	"time_format"	TEXT DEFAULT 'HH:mm:ss',
	"timezone"	TEXT DEFAULT 'Africa/Nairobi',
	"currency"	TEXT DEFAULT 'KES',
	"currency_symbol"	TEXT DEFAULT 'KSH',
	"vat_rate"	REAL DEFAULT 16,
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "system_settings_store" (
	"id"	INTEGER,
	"setting_key"	TEXT NOT NULL UNIQUE,
	"setting_value"	TEXT,
	"description"	TEXT,
	"updated_by"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("updated_by") REFERENCES "users"("id")
);
CREATE TABLE IF NOT EXISTS "tax_rates" (
	"id"	INTEGER,
	"name"	TEXT NOT NULL,
	"rate"	REAL NOT NULL,
	"type"	TEXT DEFAULT 'VAT' CHECK("type" IN ('VAT', 'SERVICE', 'OTHER')),
	"description"	TEXT,
	"is_active"	BOOLEAN DEFAULT 1,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "tire_assignments" (
	"id"	INTEGER,
	"tire_id"	INTEGER NOT NULL,
	"vehicle_id"	INTEGER NOT NULL,
	"position_id"	INTEGER NOT NULL,
	"install_date"	DATE NOT NULL,
	"removal_date"	DATE,
	"install_odometer"	REAL NOT NULL,
	"removal_odometer"	REAL,
	"reason_for_change"	TEXT,
	"created_by"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("position_id") REFERENCES "wheel_positions"("id"),
	FOREIGN KEY("tire_id") REFERENCES "tires"("id"),
	FOREIGN KEY("vehicle_id") REFERENCES "vehicles"("id")
);
CREATE TABLE IF NOT EXISTS "tire_movements" (
	"id"	INTEGER,
	"tire_id"	INTEGER NOT NULL,
	"from_location"	TEXT NOT NULL,
	"to_location"	TEXT NOT NULL,
	"movement_date"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"movement_type"	TEXT NOT NULL CHECK("movement_type" IN ('PURCHASE_TO_STORE', 'STORE_TO_VEHICLE', 'VEHICLE_TO_STORE', 'STORE_TO_RETREAD_SUPPLIER', 'RETREAD_SUPPLIER_TO_STORE', 'STORE_TO_DISPOSAL', 'INTERNAL_TRANSFER')),
	"reference_id"	TEXT,
	"reference_type"	TEXT,
	"po_item_id"	INTEGER,
	"grn_id"	INTEGER,
	"user_id"	TEXT NOT NULL,
	"notes"	TEXT,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"supplier_id"	INTEGER,
	"vehicle_id"	INTEGER,
	"supplier_name"	TEXT,
	"vehicle_number"	TEXT,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("grn_id") REFERENCES "goods_received_notes"("id"),
	FOREIGN KEY("po_item_id") REFERENCES "purchase_order_items"("id"),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id"),
	FOREIGN KEY("tire_id") REFERENCES "tires"("id"),
	FOREIGN KEY("vehicle_id") REFERENCES "vehicles"("id")
);
CREATE TABLE IF NOT EXISTS "tires" (
	"id"	INTEGER,
	"serial_number"	TEXT NOT NULL UNIQUE,
	"size"	TEXT NOT NULL,
	"brand"	TEXT,
	"model"	TEXT,
	"type"	TEXT DEFAULT 'NEW' CHECK("type" IN ('NEW', 'RETREADED')),
	"status"	TEXT DEFAULT 'IN_STORE' CHECK("status" IN ('IN_STORE', 'ON_VEHICLE', 'AWAITING_RETREAD', 'AT_RETREAD_SUPPLIER', 'USED_STORE', 'DISPOSED')),
	"purchase_cost"	REAL,
	"supplier_id"	INTEGER,
	"purchase_date"	DATE,
	"current_location"	TEXT,
	"po_item_id"	INTEGER,
	"grn_id"	INTEGER,
	"grn_item_id"	INTEGER,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"retread_count"	INTEGER DEFAULT 0,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("grn_id") REFERENCES "goods_received_notes"("id"),
	FOREIGN KEY("grn_item_id") REFERENCES "grn_items"("id"),
	FOREIGN KEY("po_item_id") REFERENCES "purchase_order_items"("id"),
	FOREIGN KEY("supplier_id") REFERENCES "suppliers"("id")
);
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id"	INTEGER,
	"user_id"	INTEGER NOT NULL,
	"session_token"	TEXT NOT NULL UNIQUE,
	"device_info"	TEXT,
	"ip_address"	TEXT,
	"expires_at"	TIMESTAMP NOT NULL,
	"is_active"	BOOLEAN DEFAULT 1,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "users" (
	"id"	INTEGER,
	"username"	TEXT NOT NULL UNIQUE,
	"email"	TEXT NOT NULL UNIQUE,
	"password_hash"	TEXT NOT NULL,
	"full_name"	TEXT NOT NULL,
	"role_id"	INTEGER,
	"department"	TEXT,
	"is_active"	BOOLEAN DEFAULT 1,
	"last_login"	TIMESTAMP,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	"updated_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS "vehicles" (
	"id"	INTEGER,
	"vehicle_number"	TEXT NOT NULL UNIQUE,
	"make"	TEXT,
	"model"	TEXT,
	"year"	INTEGER,
	"wheel_config"	TEXT,
	"current_odometer"	REAL DEFAULT 0,
	"status"	TEXT DEFAULT 'ACTIVE',
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT)
);
CREATE TABLE IF NOT EXISTS "wheel_positions" (
	"id"	INTEGER,
	"vehicle_id"	INTEGER NOT NULL,
	"position_code"	TEXT NOT NULL,
	"position_name"	TEXT NOT NULL,
	"axle_number"	INTEGER,
	"is_trailer"	BOOLEAN DEFAULT 0,
	"created_at"	TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY("id" AUTOINCREMENT),
	UNIQUE("vehicle_id","position_code"),
	FOREIGN KEY("vehicle_id") REFERENCES "vehicles"("id")
);
CREATE INDEX IF NOT EXISTS "idx_accounting_transactions_date" ON "accounting_transactions" (
	"transaction_date"
);
CREATE INDEX IF NOT EXISTS "idx_accounting_transactions_grn" ON "accounting_transactions" (
	"related_grn_id"
);
CREATE INDEX IF NOT EXISTS "idx_accounting_transactions_number" ON "accounting_transactions" (
	"transaction_number"
);
CREATE INDEX IF NOT EXISTS "idx_accounting_transactions_supplier" ON "accounting_transactions" (
	"supplier_id"
);
CREATE INDEX IF NOT EXISTS "idx_accounting_transactions_type" ON "accounting_transactions" (
	"transaction_type"
);
CREATE INDEX IF NOT EXISTS "idx_assignments_active" ON "tire_assignments" (
	"removal_date"
) WHERE "removal_date" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_assignments_tire" ON "tire_assignments" (
	"tire_id"
);
CREATE INDEX IF NOT EXISTS "idx_assignments_vehicle" ON "tire_assignments" (
	"vehicle_id"
);
CREATE INDEX IF NOT EXISTS "idx_audit_entity" ON "audit_log" (
	"entity_type",
	"entity_id"
);
CREATE INDEX IF NOT EXISTS "idx_audit_timestamp" ON "audit_log" (
	"timestamp"
);
CREATE INDEX IF NOT EXISTS "idx_audit_user" ON "audit_log" (
	"user_id"
);
CREATE INDEX IF NOT EXISTS "idx_chart_accounts_code" ON "chart_of_accounts" (
	"account_code"
);
CREATE INDEX IF NOT EXISTS "idx_chart_accounts_type" ON "chart_of_accounts" (
	"account_type"
);
CREATE INDEX IF NOT EXISTS "idx_grn_date" ON "goods_received_notes" (
	"receipt_date"
);
CREATE INDEX IF NOT EXISTS "idx_grn_items_grn" ON "grn_items" (
	"grn_id"
);
CREATE INDEX IF NOT EXISTS "idx_grn_items_po_item" ON "grn_items" (
	"po_item_id"
);
CREATE INDEX IF NOT EXISTS "idx_grn_items_retread_item" ON "grn_items" (
	"retread_order_item_id"
);
CREATE INDEX IF NOT EXISTS "idx_grn_number" ON "goods_received_notes" (
	"grn_number"
);
CREATE INDEX IF NOT EXISTS "idx_grn_po" ON "goods_received_notes" (
	"po_id"
);
CREATE INDEX IF NOT EXISTS "idx_grn_retread" ON "goods_received_notes" (
	"retread_order_id"
);
CREATE INDEX IF NOT EXISTS "idx_grn_status" ON "goods_received_notes" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_inventory_catalog_size" ON "inventory_catalog" (
	"size",
	"brand",
	"model",
	"type"
);
CREATE INDEX IF NOT EXISTS "idx_inventory_catalog_stock" ON "inventory_catalog" (
	"current_stock"
);
CREATE INDEX IF NOT EXISTS "idx_journal_entries_account" ON "journal_entries" (
	"account_code"
);
CREATE INDEX IF NOT EXISTS "idx_journal_entries_transaction" ON "journal_entries" (
	"transaction_id"
);
CREATE INDEX IF NOT EXISTS "idx_movements_date" ON "tire_movements" (
	"movement_date"
);
CREATE INDEX IF NOT EXISTS "idx_movements_grn" ON "tire_movements" (
	"grn_id"
);
CREATE INDEX IF NOT EXISTS "idx_movements_po_item" ON "tire_movements" (
	"po_item_id"
);
CREATE INDEX IF NOT EXISTS "idx_movements_tire" ON "tire_movements" (
	"tire_id"
);
CREATE INDEX IF NOT EXISTS "idx_password_resets_token" ON "password_resets" (
	"token"
);
CREATE INDEX IF NOT EXISTS "idx_password_resets_user" ON "password_resets" (
	"user_id"
);
CREATE INDEX IF NOT EXISTS "idx_po_approved_by" ON "purchase_orders" (
	"approved_by"
);
CREATE INDEX IF NOT EXISTS "idx_po_created_by" ON "purchase_orders" (
	"created_by"
);
CREATE INDEX IF NOT EXISTS "idx_po_date" ON "purchase_orders" (
	"po_date"
);
CREATE INDEX IF NOT EXISTS "idx_po_items_po" ON "purchase_order_items" (
	"po_id"
);
CREATE INDEX IF NOT EXISTS "idx_po_items_size" ON "purchase_order_items" (
	"size"
);
CREATE INDEX IF NOT EXISTS "idx_po_number" ON "purchase_orders" (
	"po_number"
);
CREATE INDEX IF NOT EXISTS "idx_po_receipts_item" ON "po_receipts" (
	"po_item_id"
);
CREATE INDEX IF NOT EXISTS "idx_po_receipts_po" ON "po_receipts" (
	"po_id"
);
CREATE INDEX IF NOT EXISTS "idx_po_status" ON "purchase_orders" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_po_supplier" ON "purchase_orders" (
	"supplier_id"
);
CREATE INDEX IF NOT EXISTS "idx_retread_items_order" ON "retread_order_items" (
	"retread_order_id"
);
CREATE INDEX IF NOT EXISTS "idx_retread_items_tire" ON "retread_order_items" (
	"tire_id"
);
CREATE INDEX IF NOT EXISTS "idx_retread_orders_dates" ON "retread_orders" (
	"sent_date",
	"received_date"
);
CREATE INDEX IF NOT EXISTS "idx_retread_orders_number" ON "retread_orders" (
	"order_number"
);
CREATE INDEX IF NOT EXISTS "idx_retread_orders_status" ON "retread_orders" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_retread_orders_supplier" ON "retread_orders" (
	"supplier_id"
);
CREATE INDEX IF NOT EXISTS "idx_retread_timeline_order" ON "retread_timeline" (
	"retread_order_id"
);
CREATE INDEX IF NOT EXISTS "idx_sessions_expires" ON "user_sessions" (
	"expires_at"
);
CREATE INDEX IF NOT EXISTS "idx_sessions_token" ON "user_sessions" (
	"session_token"
);
CREATE INDEX IF NOT EXISTS "idx_sessions_user" ON "user_sessions" (
	"user_id"
);
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger" ON "supplier_ledger" (
	"supplier_id",
	"date"
);
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_accounting" ON "supplier_ledger" (
	"accounting_transaction_id"
);
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_grn" ON "supplier_ledger" (
	"grn_id"
);
CREATE INDEX IF NOT EXISTS "idx_supplier_ledger_po" ON "supplier_ledger" (
	"po_id"
);
CREATE INDEX IF NOT EXISTS "idx_suppliers_balance" ON "suppliers" (
	"balance"
);
CREATE INDEX IF NOT EXISTS "idx_suppliers_name" ON "suppliers" (
	"name"
);
CREATE INDEX IF NOT EXISTS "idx_suppliers_type" ON "suppliers" (
	"type"
);
CREATE INDEX IF NOT EXISTS "idx_tires_grn" ON "tires" (
	"grn_id"
);
CREATE INDEX IF NOT EXISTS "idx_tires_po_item" ON "tires" (
	"po_item_id"
);
CREATE INDEX IF NOT EXISTS "idx_tires_serial" ON "tires" (
	"serial_number"
);
CREATE INDEX IF NOT EXISTS "idx_tires_size" ON "tires" (
	"size"
);
CREATE INDEX IF NOT EXISTS "idx_tires_status" ON "tires" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" (
	"email"
);
CREATE INDEX IF NOT EXISTS "idx_users_role" ON "users" (
	"role_id"
);
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" (
	"username"
);
CREATE INDEX IF NOT EXISTS "idx_vehicles_number" ON "vehicles" (
	"vehicle_number"
);
CREATE INDEX IF NOT EXISTS "idx_vehicles_status" ON "vehicles" (
	"status"
);
CREATE INDEX IF NOT EXISTS "idx_wheel_positions_vehicle" ON "wheel_positions" (
	"vehicle_id"
);
COMMIT;
