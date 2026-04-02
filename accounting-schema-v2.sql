-- ============================================================
-- FinFlow SMB - Accounting Schema V2 (MySQL 8.0+)
-- Purpose: normalized, auditable, double-entry accounting design
-- ============================================================

CREATE DATABASE IF NOT EXISTS finflow_smb
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE finflow_smb;

SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS v_customer_receivables;
DROP VIEW IF EXISTS v_vendor_payables;

DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS stock_movements;
DROP TABLE IF EXISTS warehouses;
DROP TABLE IF EXISTS payment_allocations;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS purchase_bill_lines;
DROP TABLE IF EXISTS purchase_bills;
DROP TABLE IF EXISTS sales_invoice_lines;
DROP TABLE IF EXISTS sales_invoices;
DROP TABLE IF EXISTS items;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS journal_lines;
DROP TABLE IF EXISTS journal_entries;
DROP TABLE IF EXISTS fiscal_periods;
DROP TABLE IF EXISTS chart_of_accounts;
DROP TABLE IF EXISTS tax_codes;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS companies;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- CORE
-- ============================================================

CREATE TABLE companies (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NULL,
  tax_registration_no VARCHAR(100) NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'NPR',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kathmandu',
  fiscal_year_start_month TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('active', 'suspended', 'closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_companies_tax_registration_no (tax_registration_no)
) ENGINE=InnoDB;

CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  legacy_user_uuid VARCHAR(36) NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('owner', 'admin', 'accountant', 'staff', 'auditor') NOT NULL DEFAULT 'staff',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES companies(id),
  UNIQUE KEY uq_users_company_email (company_id, email),
  UNIQUE KEY uq_users_legacy_user_uuid (legacy_user_uuid)
) ENGINE=InnoDB;

CREATE TABLE fiscal_periods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  period_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('open', 'closed', 'archived') NOT NULL DEFAULT 'open',
  closed_at DATETIME NULL,
  closed_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fiscal_periods_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_fiscal_periods_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_fiscal_period_dates CHECK (start_date <= end_date),
  UNIQUE KEY uq_fiscal_period_name (company_id, period_name),
  UNIQUE KEY uq_fiscal_period_range (company_id, start_date, end_date)
) ENGINE=InnoDB;

CREATE TABLE chart_of_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  account_code VARCHAR(30) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_type ENUM('asset', 'liability', 'equity', 'income', 'expense', 'cogs') NOT NULL,
  normal_balance ENUM('debit', 'credit') NOT NULL,
  parent_account_id BIGINT UNSIGNED NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  allow_posting TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_coa_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_coa_parent FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id),
  UNIQUE KEY uq_coa_company_code (company_id, account_code),
  UNIQUE KEY uq_coa_company_name (company_id, account_name)
) ENGINE=InnoDB;

CREATE TABLE tax_codes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  tax_code VARCHAR(30) NOT NULL,
  tax_name VARCHAR(100) NOT NULL,
  tax_scope ENUM('sales', 'purchase', 'both') NOT NULL DEFAULT 'both',
  rate_percent DECIMAL(9,4) NOT NULL,
  output_tax_account_id BIGINT UNSIGNED NULL,
  input_tax_account_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tax_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_tax_output_account FOREIGN KEY (output_tax_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_tax_input_account FOREIGN KEY (input_tax_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT chk_tax_rate_non_negative CHECK (rate_percent >= 0),
  UNIQUE KEY uq_tax_company_code (company_id, tax_code)
) ENGINE=InnoDB;

CREATE TABLE journal_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  fiscal_period_id BIGINT UNSIGNED NOT NULL,
  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  posting_status ENUM('draft', 'posted', 'reversed') NOT NULL DEFAULT 'draft',
  source_type ENUM('sales_invoice', 'purchase_bill', 'payment', 'stock_movement', 'manual', 'opening_balance', 'adjustment') NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  memo VARCHAR(500) NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  posted_by_user_id BIGINT UNSIGNED NULL,
  posted_at DATETIME NULL,
  reversed_entry_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_je_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_je_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id),
  CONSTRAINT fk_je_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_je_posted_by FOREIGN KEY (posted_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_je_reversed_entry FOREIGN KEY (reversed_entry_id) REFERENCES journal_entries(id),
  UNIQUE KEY uq_je_company_entry_number (company_id, entry_number),
  KEY idx_je_source (company_id, source_type, source_id),
  KEY idx_je_entry_date (company_id, entry_date)
) ENGINE=InnoDB;

CREATE TABLE journal_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  journal_entry_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NULL,
  debit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  credit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  customer_id BIGINT UNSIGNED NULL,
  vendor_id BIGINT UNSIGNED NULL,
  item_id BIGINT UNSIGNED NULL,
  tax_code_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jl_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_jl_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT uq_jl_entry_line_no UNIQUE (journal_entry_id, line_no),
  CONSTRAINT chk_jl_positive_amounts CHECK (debit_amount >= 0 AND credit_amount >= 0),
  CONSTRAINT chk_jl_one_side_only CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  )
) ENGINE=InnoDB;

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  legacy_customer_uuid VARCHAR(36) NULL,
  customer_code VARCHAR(50) NULL,
  display_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  tax_registration_no VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  billing_address TEXT NULL,
  shipping_address TEXT NULL,
  receivable_account_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_customers_ar_account FOREIGN KEY (receivable_account_id) REFERENCES chart_of_accounts(id),
  UNIQUE KEY uq_customers_legacy_uuid (legacy_customer_uuid),
  UNIQUE KEY uq_customers_code (company_id, customer_code),
  KEY idx_customers_name (company_id, display_name)
) ENGINE=InnoDB;

CREATE TABLE sales_invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  legacy_invoice_uuid VARCHAR(36) NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status ENUM('draft', 'issued', 'partially_paid', 'paid', 'void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  posted_journal_entry_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_si_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_si_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_si_journal_entry FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id),
  CONSTRAINT fk_si_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_si_dates CHECK (invoice_date <= due_date),
  UNIQUE KEY uq_si_company_invoice_number (company_id, invoice_number),
  UNIQUE KEY uq_si_legacy_invoice_uuid (legacy_invoice_uuid),
  KEY idx_si_status_due (company_id, status, due_date)
) ENGINE=InnoDB;

CREATE TABLE sales_invoice_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sales_invoice_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  unit_price DECIMAL(18,4) NOT NULL,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  tax_code_id BIGINT UNSIGNED NULL,
  revenue_account_id BIGINT UNSIGNED NOT NULL,
  line_subtotal DECIMAL(18,2) NOT NULL,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sil_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_sil_tax FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id),
  CONSTRAINT fk_sil_revenue_account FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT uq_sil_invoice_line UNIQUE (sales_invoice_id, line_no),
  CONSTRAINT chk_sil_qty_positive CHECK (quantity > 0),
  CONSTRAINT chk_sil_unit_price_non_negative CHECK (unit_price >= 0),
  CONSTRAINT chk_sil_discount_percent CHECK (discount_percent >= 0 AND discount_percent <= 100)
) ENGINE=InnoDB;

-- ============================================================
-- PURCHASE
-- ============================================================

CREATE TABLE vendors (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  legacy_vendor_uuid VARCHAR(36) NULL,
  vendor_code VARCHAR(50) NULL,
  display_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  tax_registration_no VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  billing_address TEXT NULL,
  payable_account_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_vendors_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_vendors_ap_account FOREIGN KEY (payable_account_id) REFERENCES chart_of_accounts(id),
  UNIQUE KEY uq_vendors_legacy_uuid (legacy_vendor_uuid),
  UNIQUE KEY uq_vendors_code (company_id, vendor_code),
  KEY idx_vendors_name (company_id, display_name)
) ENGINE=InnoDB;

CREATE TABLE purchase_bills (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  vendor_id BIGINT UNSIGNED NOT NULL,
  legacy_bill_uuid VARCHAR(36) NULL,
  bill_number VARCHAR(50) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NOT NULL,
  currency_code CHAR(3) NOT NULL,
  status ENUM('draft', 'received', 'partially_paid', 'paid', 'void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  posted_journal_entry_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pb_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_pb_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_pb_journal_entry FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id),
  CONSTRAINT fk_pb_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_pb_dates CHECK (bill_date <= due_date),
  UNIQUE KEY uq_pb_company_bill_number (company_id, bill_number),
  UNIQUE KEY uq_pb_legacy_bill_uuid (legacy_bill_uuid),
  KEY idx_pb_status_due (company_id, status, due_date)
) ENGINE=InnoDB;

CREATE TABLE purchase_bill_lines (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_bill_id BIGINT UNSIGNED NOT NULL,
  line_no INT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  tax_code_id BIGINT UNSIGNED NULL,
  expense_account_id BIGINT UNSIGNED NOT NULL,
  line_subtotal DECIMAL(18,2) NOT NULL,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pbl_bill FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(id) ON DELETE CASCADE,
  CONSTRAINT fk_pbl_tax FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id),
  CONSTRAINT fk_pbl_expense_account FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT uq_pbl_bill_line UNIQUE (purchase_bill_id, line_no),
  CONSTRAINT chk_pbl_qty_positive CHECK (quantity > 0),
  CONSTRAINT chk_pbl_unit_cost_non_negative CHECK (unit_cost >= 0),
  CONSTRAINT chk_pbl_discount_percent CHECK (discount_percent >= 0 AND discount_percent <= 100)
) ENGINE=InnoDB;

-- ============================================================
-- INVENTORY
-- ============================================================

CREATE TABLE items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  legacy_item_uuid VARCHAR(36) NULL,
  sku VARCHAR(100) NOT NULL,
  item_name VARCHAR(255) NOT NULL,
  item_type ENUM('inventory', 'service', 'non_inventory') NOT NULL DEFAULT 'inventory',
  description TEXT NULL,
  unit_of_measure VARCHAR(30) NOT NULL DEFAULT 'pcs',
  default_tax_code_id BIGINT UNSIGNED NULL,
  inventory_account_id BIGINT UNSIGNED NULL,
  cogs_account_id BIGINT UNSIGNED NULL,
  income_account_id BIGINT UNSIGNED NULL,
  expense_account_id BIGINT UNSIGNED NULL,
  reorder_point DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_items_tax FOREIGN KEY (default_tax_code_id) REFERENCES tax_codes(id),
  CONSTRAINT fk_items_inventory_account FOREIGN KEY (inventory_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_items_cogs_account FOREIGN KEY (cogs_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_items_income_account FOREIGN KEY (income_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_items_expense_account FOREIGN KEY (expense_account_id) REFERENCES chart_of_accounts(id),
  UNIQUE KEY uq_items_legacy_uuid (legacy_item_uuid),
  UNIQUE KEY uq_items_company_sku (company_id, sku),
  KEY idx_items_name (company_id, item_name)
) ENGINE=InnoDB;

ALTER TABLE sales_invoice_lines
  ADD CONSTRAINT fk_sil_item FOREIGN KEY (item_id) REFERENCES items(id);

ALTER TABLE purchase_bill_lines
  ADD CONSTRAINT fk_pbl_item FOREIGN KEY (item_id) REFERENCES items(id);

CREATE TABLE warehouses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  warehouse_code VARCHAR(50) NOT NULL,
  warehouse_name VARCHAR(150) NOT NULL,
  address TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouses_company FOREIGN KEY (company_id) REFERENCES companies(id),
  UNIQUE KEY uq_warehouses_code (company_id, warehouse_code)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  warehouse_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM('opening_balance', 'purchase', 'sale', 'purchase_return', 'sales_return', 'adjustment', 'transfer_in', 'transfer_out') NOT NULL,
  movement_date DATETIME NOT NULL,
  quantity_delta DECIMAL(18,4) NOT NULL,
  unit_cost DECIMAL(18,6) NULL,
  total_cost DECIMAL(18,2) NULL,
  reference_type ENUM('purchase_bill_line', 'sales_invoice_line', 'manual_adjustment', 'transfer', 'opening_balance') NOT NULL,
  reference_id BIGINT UNSIGNED NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sm_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_sm_item FOREIGN KEY (item_id) REFERENCES items(id),
  CONSTRAINT fk_sm_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
  CONSTRAINT fk_sm_journal_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id),
  CONSTRAINT fk_sm_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_sm_quantity_non_zero CHECK (quantity_delta <> 0),
  KEY idx_sm_item_date (item_id, movement_date),
  KEY idx_sm_reference (company_id, reference_type, reference_id)
) ENGINE=InnoDB;

-- ============================================================
-- PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  payment_number VARCHAR(50) NOT NULL,
  payment_date DATE NOT NULL,
  direction ENUM('inbound', 'outbound') NOT NULL,
  counterparty_type ENUM('customer', 'vendor', 'other') NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  vendor_id BIGINT UNSIGNED NULL,
  cash_account_id BIGINT UNSIGNED NOT NULL,
  payment_method ENUM('cash', 'bank_transfer', 'cheque', 'card', 'wallet', 'other') NOT NULL DEFAULT 'bank_transfer',
  reference_number VARCHAR(100) NULL,
  currency_code CHAR(3) NOT NULL,
  amount_total DECIMAL(18,2) NOT NULL,
  unapplied_amount DECIMAL(18,2) NOT NULL,
  status ENUM('draft', 'posted', 'void') NOT NULL DEFAULT 'draft',
  posted_journal_entry_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_payments_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_payments_cash_account FOREIGN KEY (cash_account_id) REFERENCES chart_of_accounts(id),
  CONSTRAINT fk_payments_journal_entry FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id),
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT chk_payments_amount_positive CHECK (amount_total > 0 AND unapplied_amount >= 0),
  CONSTRAINT chk_payments_counterparty_consistency CHECK (
    (counterparty_type = 'customer' AND customer_id IS NOT NULL AND vendor_id IS NULL) OR
    (counterparty_type = 'vendor' AND vendor_id IS NOT NULL AND customer_id IS NULL) OR
    (counterparty_type = 'other' AND customer_id IS NULL AND vendor_id IS NULL)
  ),
  UNIQUE KEY uq_payments_number (company_id, payment_number),
  KEY idx_payments_date (company_id, payment_date)
) ENGINE=InnoDB;

CREATE TABLE payment_allocations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  allocation_date DATE NOT NULL,
  allocated_amount DECIMAL(18,2) NOT NULL,
  target_type ENUM('sales_invoice', 'purchase_bill') NOT NULL,
  sales_invoice_id BIGINT UNSIGNED NULL,
  purchase_bill_id BIGINT UNSIGNED NULL,
  notes VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pa_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_sales_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoices(id),
  CONSTRAINT fk_pa_purchase_bill FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bills(id),
  CONSTRAINT chk_pa_amount_positive CHECK (allocated_amount > 0),
  CONSTRAINT chk_pa_target_consistency CHECK (
    (target_type = 'sales_invoice' AND sales_invoice_id IS NOT NULL AND purchase_bill_id IS NULL) OR
    (target_type = 'purchase_bill' AND purchase_bill_id IS NOT NULL AND sales_invoice_id IS NULL)
  ),
  KEY idx_pa_target_sales (sales_invoice_id),
  KEY idx_pa_target_purchase (purchase_bill_id)
) ENGINE=InnoDB;

-- ============================================================
-- OTHER
-- ============================================================

CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(80) NOT NULL,
  action_type ENUM('create', 'update', 'delete', 'post', 'void', 'reverse', 'login', 'logout', 'other') NOT NULL,
  reason VARCHAR(255) NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_company FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  KEY idx_audit_entity (company_id, entity_type, entity_id),
  KEY idx_audit_created_at (company_id, created_at)
) ENGINE=InnoDB;

ALTER TABLE journal_lines
  ADD CONSTRAINT fk_jl_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  ADD CONSTRAINT fk_jl_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  ADD CONSTRAINT fk_jl_item FOREIGN KEY (item_id) REFERENCES items(id),
  ADD CONSTRAINT fk_jl_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id);

-- ============================================================
-- POSTING SAFEGUARD: prevent unbalanced posting
-- ============================================================

DELIMITER $$
CREATE TRIGGER trg_journal_entries_validate_posting
BEFORE UPDATE ON journal_entries
FOR EACH ROW
BEGIN
  DECLARE v_total_debit DECIMAL(18,2);
  DECLARE v_total_credit DECIMAL(18,2);

  IF NEW.posting_status = 'posted' AND OLD.posting_status <> 'posted' THEN
    SELECT COALESCE(SUM(debit_amount), 0), COALESCE(SUM(credit_amount), 0)
      INTO v_total_debit, v_total_credit
    FROM journal_lines
    WHERE journal_entry_id = NEW.id;

    IF v_total_debit = 0 OR v_total_credit = 0 OR v_total_debit <> v_total_credit THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot post unbalanced journal entry';
    END IF;
  END IF;
END$$
DELIMITER ;

-- ============================================================
-- DERIVED AR/AP (not stored as mutable tables)
-- ============================================================

CREATE VIEW v_customer_receivables AS
SELECT
  si.company_id,
  si.customer_id,
  si.id AS sales_invoice_id,
  si.invoice_number,
  si.invoice_date,
  si.due_date,
  si.total_amount,
  COALESCE(SUM(pa.allocated_amount), 0.00) AS allocated_amount,
  (si.total_amount - COALESCE(SUM(pa.allocated_amount), 0.00)) AS outstanding_amount,
  CASE
    WHEN (si.total_amount - COALESCE(SUM(pa.allocated_amount), 0.00)) <= 0 THEN 'paid'
    WHEN si.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS receivable_status
FROM sales_invoices si
LEFT JOIN payment_allocations pa
  ON pa.sales_invoice_id = si.id
GROUP BY
  si.company_id,
  si.customer_id,
  si.id,
  si.invoice_number,
  si.invoice_date,
  si.due_date,
  si.total_amount;

CREATE VIEW v_vendor_payables AS
SELECT
  pb.company_id,
  pb.vendor_id,
  pb.id AS purchase_bill_id,
  pb.bill_number,
  pb.bill_date,
  pb.due_date,
  pb.total_amount,
  COALESCE(SUM(pa.allocated_amount), 0.00) AS allocated_amount,
  (pb.total_amount - COALESCE(SUM(pa.allocated_amount), 0.00)) AS outstanding_amount,
  CASE
    WHEN (pb.total_amount - COALESCE(SUM(pa.allocated_amount), 0.00)) <= 0 THEN 'paid'
    WHEN pb.due_date < CURRENT_DATE THEN 'overdue'
    ELSE 'open'
  END AS payable_status
FROM purchase_bills pb
LEFT JOIN payment_allocations pa
  ON pa.purchase_bill_id = pb.id
GROUP BY
  pb.company_id,
  pb.vendor_id,
  pb.id,
  pb.bill_number,
  pb.bill_date,
  pb.due_date,
  pb.total_amount;
