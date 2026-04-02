-- ============================================================
-- FinFlow SMB - Invoice/Purchase Line Item Refactor
-- ============================================================

USE finflow_smb;

CREATE TABLE IF NOT EXISTS tax_codes (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  code VARCHAR(30) NOT NULL,
  name VARCHAR(100) NOT NULL,
  rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tax_codes_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tax_code_user (user_id, code)
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  entry_no VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  source_type ENUM('sales_invoice','purchase_bill','payment','adjustment') NOT NULL,
  source_id VARCHAR(36) NOT NULL,
  status ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
  memo VARCHAR(255),
  reversed_entry_id VARCHAR(36) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_je_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_entry_no_user (user_id, entry_no),
  KEY idx_je_source (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id VARCHAR(36) PRIMARY KEY,
  journal_entry_id VARCHAR(36) NOT NULL,
  line_order INT NOT NULL,
  account_code VARCHAR(40) NOT NULL,
  description VARCHAR(255),
  debit DECIMAL(14,2) NOT NULL DEFAULT 0,
  credit DECIMAL(14,2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(40),
  reference_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jl_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  KEY idx_jl_entry (journal_entry_id)
);

CREATE TABLE IF NOT EXISTS sales_invoice_headers (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  invoice_no VARCHAR(50) NOT NULL,
  customer_id VARCHAR(36) DEFAULT NULL,
  customer_name VARCHAR(255) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  posted_journal_entry_id VARCHAR(36) DEFAULT NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sih_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_sales_invoice_no_user (user_id, invoice_no)
);

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id VARCHAR(36) PRIMARY KEY,
  sales_invoice_id VARCHAR(36) NOT NULL,
  line_order INT NOT NULL,
  item_id VARCHAR(36) DEFAULT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  unit_price DECIMAL(14,4) NOT NULL,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  tax_code_id VARCHAR(36) DEFAULT NULL,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  line_subtotal DECIMAL(14,2) NOT NULL,
  line_discount DECIMAL(14,2) NOT NULL,
  line_tax DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sil_header FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoice_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sil_tax FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  KEY idx_sil_header (sales_invoice_id)
);

CREATE TABLE IF NOT EXISTS purchase_bill_headers (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  bill_no VARCHAR(50) NOT NULL,
  vendor_id VARCHAR(36) DEFAULT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  posted_journal_entry_id VARCHAR(36) DEFAULT NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pbh_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY uq_purchase_bill_no_user (user_id, bill_no)
);

CREATE TABLE IF NOT EXISTS purchase_bill_lines (
  id VARCHAR(36) PRIMARY KEY,
  purchase_bill_id VARCHAR(36) NOT NULL,
  line_order INT NOT NULL,
  item_id VARCHAR(36) DEFAULT NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(14,4) NOT NULL,
  unit_price DECIMAL(14,4) NOT NULL,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  tax_code_id VARCHAR(36) DEFAULT NULL,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
  line_subtotal DECIMAL(14,2) NOT NULL,
  line_discount DECIMAL(14,2) NOT NULL,
  line_tax DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pbl_header FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bill_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_pbl_tax FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  KEY idx_pbl_header (purchase_bill_id)
);

CREATE OR REPLACE VIEW v_sales_invoice_totals AS
SELECT
  h.id,
  h.user_id,
  h.invoice_no,
  h.status,
  COALESCE(SUM(l.line_subtotal),0) AS subtotal_amount,
  COALESCE(SUM(l.line_discount),0) AS discount_amount,
  COALESCE(SUM(l.line_tax),0) AS tax_amount,
  COALESCE(SUM(l.line_total),0) AS total_amount
FROM sales_invoice_headers h
LEFT JOIN sales_invoice_lines l ON l.sales_invoice_id = h.id
GROUP BY h.id, h.user_id, h.invoice_no, h.status;

CREATE OR REPLACE VIEW v_purchase_bill_totals AS
SELECT
  h.id,
  h.user_id,
  h.bill_no,
  h.status,
  COALESCE(SUM(l.line_subtotal),0) AS subtotal_amount,
  COALESCE(SUM(l.line_discount),0) AS discount_amount,
  COALESCE(SUM(l.line_tax),0) AS tax_amount,
  COALESCE(SUM(l.line_total),0) AS total_amount
FROM purchase_bill_headers h
LEFT JOIN purchase_bill_lines l ON l.purchase_bill_id = h.id
GROUP BY h.id, h.user_id, h.bill_no, h.status;
