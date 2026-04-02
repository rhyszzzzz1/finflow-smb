-- ============================================================
-- FinFlow SMB - Inventory Ledger Migration
-- Split inventory master from stock transactions
-- ============================================================

USE finflow_smb;

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100),
  description TEXT,
  unit_of_measure VARCHAR(20) DEFAULT 'pcs',
  default_purchase_price DECIMAL(14,2) DEFAULT 0,
  default_selling_price DECIMAL(14,2) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_item_company_sku (company_id, sku),
  KEY idx_item_company_name (company_id, name)
);

CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(30) NOT NULL,
  is_default TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouse_company FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_warehouse_company_code (company_id, code)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  warehouse_id VARCHAR(36) NOT NULL,
  movement_type ENUM('opening_balance','purchase_receipt','sale_issue','adjustment','transfer_in','transfer_out') NOT NULL,
  quantity_delta DECIMAL(14,4) NOT NULL,
  unit_cost DECIMAL(14,4) DEFAULT NULL,
  total_cost DECIMAL(14,2) DEFAULT NULL,
  reference_type ENUM('purchase','invoice','manual_adjustment','transfer','opening_balance') NOT NULL,
  reference_id VARCHAR(36) DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  created_by_user_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_company FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_actor FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE RESTRICT,
  KEY idx_stock_item_warehouse (item_id, warehouse_id, created_at),
  KEY idx_stock_reference (company_id, reference_type, reference_id)
);

CREATE OR REPLACE VIEW v_item_stock_balances AS
SELECT
  sm.company_id,
  sm.item_id,
  sm.warehouse_id,
  COALESCE(SUM(sm.quantity_delta), 0) AS current_stock,
  COALESCE(
    CASE
      WHEN SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END) > 0
      THEN SUM(CASE WHEN sm.quantity_delta > 0 THEN COALESCE(sm.total_cost, sm.unit_cost * sm.quantity_delta, 0) ELSE 0 END)
           / SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END)
      ELSE 0
    END,
    0
  ) AS weighted_avg_cost
FROM stock_movements sm
GROUP BY sm.company_id, sm.item_id, sm.warehouse_id;

-- Optional one-time migration seed from legacy inventory table
-- INSERT INTO items (id, company_id, name, sku, description, default_purchase_price, default_selling_price)
-- SELECT id, user_id, product_name, sku, description, purchase_price, selling_price
-- FROM inventory;
