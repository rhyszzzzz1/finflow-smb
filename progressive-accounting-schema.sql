-- FinFlow SMB - Progressive Accounting Schema
-- Adds new accounting architecture tables without dropping legacy tables.
-- Uses UUID-style VARCHAR(36) identifiers for compatibility with the current repo.
-- Important: some transitional table names already exist in this repo
-- (for example items, warehouses, stock_movements, payments, payment_allocations,
--  tax_codes, journal_entries, journal_lines, sales_invoice_headers/lines,
--  purchase_bill_headers/lines, fiscal_periods, audit_logs).
-- In those cases CREATE TABLE IF NOT EXISTS acts as the canonical target shape
-- for fresh environments; existing environments should be aligned by follow-up ALTERs.

USE finflow_smb;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- TENANT / ACCESS
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id VARCHAR(36) PRIMARY KEY,
  legacy_profile_id VARCHAR(36) NULL,
  owner_profile_id VARCHAR(36) NULL,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255) NULL,
  pan_vat_number VARCHAR(100) NULL,
  registration_number VARCHAR(100) NULL,
  base_currency CHAR(3) NOT NULL DEFAULT 'NPR',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kathmandu',
  fiscal_year_start_month TINYINT UNSIGNED NOT NULL DEFAULT 4,
  country_code CHAR(2) NOT NULL DEFAULT 'NP',
  status ENUM('active','suspended','closed') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_companies_legacy_profile FOREIGN KEY (legacy_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_companies_owner_profile FOREIGN KEY (owner_profile_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_companies_fiscal_month CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  UNIQUE KEY uq_companies_legacy_profile (legacy_profile_id),
  KEY idx_companies_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  role_code VARCHAR(50) NOT NULL,
  role_name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_roles_company_code (company_id, role_code),
  UNIQUE KEY uq_roles_company_name (company_id, role_name),
  KEY idx_roles_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(36) PRIMARY KEY,
  permission_code VARCHAR(100) NOT NULL,
  permission_name VARCHAR(150) NOT NULL,
  domain_name VARCHAR(50) NOT NULL,
  action_name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permissions_code (permission_code),
  UNIQUE KEY uq_permissions_domain_action (domain_name, action_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  permission_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_role_permissions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  UNIQUE KEY uq_role_permissions (role_id, permission_id),
  KEY idx_role_permissions_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  role_id VARCHAR(36) NOT NULL,
  assigned_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE KEY uq_user_roles (company_id, user_id, role_id),
  KEY idx_user_roles_user (user_id),
  KEY idx_user_roles_role (role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COUNTERPARTIES
-- ============================================================

CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  legacy_client_id VARCHAR(36) NULL,
  linked_company_id VARCHAR(36) NULL,
  customer_code VARCHAR(50) NULL,
  display_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  pan_vat_number VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  billing_address TEXT NULL,
  shipping_address TEXT NULL,
  receivable_account_id VARCHAR(36) NULL,
  credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  payment_terms_days INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_customers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_customers_legacy_client FOREIGN KEY (legacy_client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_customers_linked_company FOREIGN KEY (linked_company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT chk_customers_credit_limit CHECK (credit_limit >= 0),
  CONSTRAINT chk_customers_payment_terms CHECK (payment_terms_days >= 0),
  UNIQUE KEY uq_customers_company_code (company_id, customer_code),
  KEY idx_customers_company_name (company_id, display_name),
  KEY idx_customers_company_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vendors (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  legacy_vendor_id VARCHAR(36) NULL,
  linked_company_id VARCHAR(36) NULL,
  vendor_code VARCHAR(50) NULL,
  display_name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255) NULL,
  pan_vat_number VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  billing_address TEXT NULL,
  payable_account_id VARCHAR(36) NULL,
  payment_terms_days INT NOT NULL DEFAULT 0,
  status ENUM('active','inactive','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_vendors_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_vendors_legacy_vendor FOREIGN KEY (legacy_vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_new_vendors_linked_company FOREIGN KEY (linked_company_id) REFERENCES companies(id) ON DELETE SET NULL,
  CONSTRAINT chk_new_vendors_payment_terms CHECK (payment_terms_days >= 0),
  UNIQUE KEY uq_new_vendors_company_code (company_id, vendor_code),
  KEY idx_new_vendors_company_name (company_id, display_name),
  KEY idx_new_vendors_company_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_persons (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  counterparty_type ENUM('customer','vendor') NOT NULL,
  customer_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NULL,
  full_name VARCHAR(150) NOT NULL,
  designation VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(30) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_contact_persons_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact_persons_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_contact_persons_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE CASCADE,
  CONSTRAINT chk_contact_person_target CHECK (
    (counterparty_type='customer' AND customer_id IS NOT NULL AND vendor_id IS NULL) OR
    (counterparty_type='vendor' AND vendor_id IS NOT NULL AND customer_id IS NULL)
  ),
  KEY idx_contact_persons_customer (customer_id),
  KEY idx_contact_persons_vendor (vendor_id),
  KEY idx_contact_persons_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INVENTORY / ACCOUNTING FOUNDATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS item_categories (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  parent_category_id VARCHAR(36) NULL,
  category_code VARCHAR(50) NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_item_categories_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_item_categories_parent FOREIGN KEY (parent_category_id) REFERENCES item_categories(id) ON DELETE SET NULL,
  UNIQUE KEY uq_item_categories_company_code (company_id, category_code),
  UNIQUE KEY uq_item_categories_company_name (company_id, parent_category_id, name),
  KEY idx_item_categories_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS units_of_measure (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  base_unit_id VARCHAR(36) NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  conversion_factor DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_units_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_units_base_unit FOREIGN KEY (base_unit_id) REFERENCES units_of_measure(id) ON DELETE SET NULL,
  CONSTRAINT chk_units_conversion_factor CHECK (conversion_factor > 0),
  UNIQUE KEY uq_units_company_code (company_id, code),
  UNIQUE KEY uq_units_company_name (company_id, name),
  KEY idx_units_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  parent_account_id VARCHAR(36) NULL,
  account_code VARCHAR(20) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_type ENUM('asset','liability','equity','income','expense','contra_asset','contra_liability','contra_income','contra_expense') NOT NULL,
  normal_balance ENUM('debit','credit') NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_control_account TINYINT(1) NOT NULL DEFAULT 0,
  allow_posting TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_coa_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_coa_parent FOREIGN KEY (parent_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  UNIQUE KEY uq_coa_company_code (company_id, account_code),
  UNIQUE KEY uq_coa_company_name (company_id, account_name),
  KEY idx_coa_company_type (company_id, account_type),
  KEY idx_coa_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  legacy_inventory_id VARCHAR(36) NULL,
  legacy_vendor_product_id VARCHAR(36) NULL,
  category_id VARCHAR(36) NULL,
  unit_of_measure_id VARCHAR(36) NULL,
  inventory_account_id VARCHAR(36) NULL,
  cogs_account_id VARCHAR(36) NULL,
  sales_account_id VARCHAR(36) NULL,
  purchase_account_id VARCHAR(36) NULL,
  item_code VARCHAR(50) NOT NULL,
  sku VARCHAR(100) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  item_type ENUM('inventory','service','non_inventory') NOT NULL DEFAULT 'inventory',
  default_sales_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  default_purchase_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  reorder_level DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_items_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_category FOREIGN KEY (category_id) REFERENCES item_categories(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_uom FOREIGN KEY (unit_of_measure_id) REFERENCES units_of_measure(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_inventory_account FOREIGN KEY (inventory_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_cogs_account FOREIGN KEY (cogs_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_sales_account FOREIGN KEY (sales_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_purchase_account FOREIGN KEY (purchase_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT chk_items_sales_price CHECK (default_sales_price >= 0),
  CONSTRAINT chk_items_purchase_price CHECK (default_purchase_price >= 0),
  CONSTRAINT chk_items_reorder_level CHECK (reorder_level >= 0),
  UNIQUE KEY uq_items_company_code (company_id, item_code),
  UNIQUE KEY uq_items_company_sku (company_id, sku),
  KEY idx_items_company_name (company_id, name),
  KEY idx_items_company_type (company_id, item_type),
  KEY idx_items_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS warehouses (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  warehouse_code VARCHAR(50) NOT NULL,
  warehouse_name VARCHAR(150) NOT NULL,
  address TEXT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_warehouses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE KEY uq_warehouses_company_code (company_id, warehouse_code),
  UNIQUE KEY uq_warehouses_company_name (company_id, warehouse_name),
  KEY idx_warehouses_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  period_name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status ENUM('open','closed','locked') NOT NULL DEFAULT 'open',
  closed_at TIMESTAMP NULL DEFAULT NULL,
  closed_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fiscal_periods_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_fiscal_periods_closed_by FOREIGN KEY (closed_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_fiscal_period_dates CHECK (end_date >= start_date),
  UNIQUE KEY uq_fiscal_periods_company_name (company_id, period_name),
  UNIQUE KEY uq_fiscal_periods_company_dates (company_id, start_date, end_date),
  KEY idx_fiscal_periods_company_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_entries (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  entry_number VARCHAR(50) NOT NULL,
  entry_date DATE NOT NULL,
  source_type ENUM('sales_invoice','sales_credit_note','purchase_bill','purchase_debit_note','payment','stock_movement','opening_balance','manual') NOT NULL,
  source_id VARCHAR(36) NULL,
  posting_status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
  memo VARCHAR(255) NULL,
  created_by_user_id VARCHAR(36) NULL,
  posted_by_user_id VARCHAR(36) NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  reversed_entry_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_journal_entries_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_entries_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_journal_entries_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_entries_posted_by FOREIGN KEY (posted_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_entries_reversed_entry FOREIGN KEY (reversed_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  UNIQUE KEY uq_journal_entries_company_number (company_id, entry_number),
  KEY idx_journal_entries_company_date (company_id, entry_date),
  KEY idx_journal_entries_company_status (company_id, posting_status),
  KEY idx_journal_entries_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_codes (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  tax_code VARCHAR(20) NOT NULL,
  tax_name VARCHAR(100) NOT NULL,
  tax_scope ENUM('sales','purchase','both') NOT NULL DEFAULT 'both',
  rate_percent DECIMAL(7,4) NOT NULL,
  output_tax_account_id VARCHAR(36) NULL,
  input_tax_account_id VARCHAR(36) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tax_codes_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tax_codes_output_account FOREIGN KEY (output_tax_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_tax_codes_input_account FOREIGN KEY (input_tax_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT chk_tax_codes_rate CHECK (rate_percent >= 0),
  UNIQUE KEY uq_tax_codes_company_code (company_id, tax_code),
  KEY idx_tax_codes_company_scope (company_id, tax_scope),
  KEY idx_tax_codes_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  warehouse_id VARCHAR(36) NOT NULL,
  movement_type ENUM('opening','purchase_receipt','sales_issue','sales_return','purchase_return','adjustment_in','adjustment_out','transfer_in','transfer_out') NOT NULL,
  source_type ENUM('purchase_bill','purchase_debit_note','sales_invoice','sales_credit_note','inventory_adjustment','stock_transfer','opening_balance','manual') NOT NULL,
  source_id VARCHAR(36) NULL,
  movement_date DATE NOT NULL,
  quantity_delta DECIMAL(18,4) NOT NULL,
  unit_cost DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  total_cost DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  reason VARCHAR(255) NULL,
  posted_journal_entry_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_stock_movements_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_movements_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_movements_journal_entry FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_stock_movements_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  KEY idx_stock_movements_company_date (company_id, movement_date),
  KEY idx_stock_movements_item_date (item_id, movement_date),
  KEY idx_stock_movements_warehouse_date (warehouse_id, movement_date),
  KEY idx_stock_movements_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SALES
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_invoice_headers (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  legacy_invoice_id VARCHAR(36) NULL,
  customer_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  status ENUM('draft','issued','partially_paid','paid','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  posted_journal_entry_id VARCHAR(36) NULL,
  sequence_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_invoice_headers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_invoice_headers_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_invoice_headers_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_invoice_headers_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_invoice_headers_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_sales_invoice_headers_amounts CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  ),
  UNIQUE KEY uq_sales_invoice_headers_company_number (company_id, invoice_number),
  KEY idx_sales_invoice_headers_company_date (company_id, invoice_date),
  KEY idx_sales_invoice_headers_customer_status (customer_id, status),
  KEY idx_sales_invoice_headers_period (fiscal_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_invoice_lines (
  id VARCHAR(36) PRIMARY KEY,
  sales_invoice_id VARCHAR(36) NOT NULL,
  line_no INT NOT NULL,
  item_id VARCHAR(36) NULL,
  revenue_account_id VARCHAR(36) NULL,
  tax_code_id VARCHAR(36) NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  line_subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_invoice_lines_header FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoice_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_invoice_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_invoice_lines_revenue_account FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_invoice_lines_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  CONSTRAINT chk_sales_invoice_lines_amounts CHECK (
    quantity >= 0 AND unit_price >= 0 AND discount_percent >= 0 AND discount_amount >= 0 AND
    tax_rate_percent >= 0 AND line_subtotal >= 0 AND line_tax_amount >= 0 AND line_total_amount >= 0
  ),
  UNIQUE KEY uq_sales_invoice_lines_line (sales_invoice_id, line_no),
  KEY idx_sales_invoice_lines_item (item_id),
  KEY idx_sales_invoice_lines_tax_code (tax_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_credit_note_headers (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  related_sales_invoice_id VARCHAR(36) NULL,
  credit_note_number VARCHAR(50) NOT NULL,
  credit_note_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  status ENUM('draft','issued','applied','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  posted_journal_entry_id VARCHAR(36) NULL,
  sequence_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_credit_note_headers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_credit_note_headers_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_credit_note_headers_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_credit_note_headers_invoice FOREIGN KEY (related_sales_invoice_id) REFERENCES sales_invoice_headers(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_credit_note_headers_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_credit_note_headers_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_sales_credit_note_headers_amounts CHECK (
    subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  ),
  UNIQUE KEY uq_sales_credit_note_headers_company_number (company_id, credit_note_number),
  KEY idx_sales_credit_note_headers_customer_status (customer_id, status),
  KEY idx_sales_credit_note_headers_company_date (company_id, credit_note_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_credit_note_lines (
  id VARCHAR(36) PRIMARY KEY,
  sales_credit_note_id VARCHAR(36) NOT NULL,
  line_no INT NOT NULL,
  item_id VARCHAR(36) NULL,
  revenue_account_id VARCHAR(36) NULL,
  tax_code_id VARCHAR(36) NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  line_subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_credit_note_lines_header FOREIGN KEY (sales_credit_note_id) REFERENCES sales_credit_note_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_credit_note_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_credit_note_lines_revenue_account FOREIGN KEY (revenue_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_credit_note_lines_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  CONSTRAINT chk_sales_credit_note_lines_amounts CHECK (
    quantity >= 0 AND unit_price >= 0 AND tax_rate_percent >= 0 AND
    line_subtotal >= 0 AND line_tax_amount >= 0 AND line_total_amount >= 0
  ),
  UNIQUE KEY uq_sales_credit_note_lines_line (sales_credit_note_id, line_no),
  KEY idx_sales_credit_note_lines_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PURCHASING
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_bill_headers (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  legacy_purchase_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  bill_number VARCHAR(50) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  status ENUM('draft','received','partially_paid','paid','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  posted_journal_entry_id VARCHAR(36) NULL,
  sequence_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_bill_headers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_bill_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_bill_headers_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_bill_headers_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_bill_headers_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_purchase_bill_headers_amounts CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  ),
  UNIQUE KEY uq_purchase_bill_headers_company_number (company_id, bill_number),
  KEY idx_purchase_bill_headers_company_date (company_id, bill_date),
  KEY idx_purchase_bill_headers_vendor_status (vendor_id, status),
  KEY idx_purchase_bill_headers_period (fiscal_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_bill_lines (
  id VARCHAR(36) PRIMARY KEY,
  purchase_bill_id VARCHAR(36) NOT NULL,
  line_no INT NOT NULL,
  item_id VARCHAR(36) NULL,
  expense_or_inventory_account_id VARCHAR(36) NULL,
  tax_code_id VARCHAR(36) NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  line_subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_bill_lines_header FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bill_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_bill_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_bill_lines_account FOREIGN KEY (expense_or_inventory_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_bill_lines_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  CONSTRAINT chk_purchase_bill_lines_amounts CHECK (
    quantity >= 0 AND unit_price >= 0 AND discount_percent >= 0 AND discount_amount >= 0 AND
    tax_rate_percent >= 0 AND line_subtotal >= 0 AND line_tax_amount >= 0 AND line_total_amount >= 0
  ),
  UNIQUE KEY uq_purchase_bill_lines_line (purchase_bill_id, line_no),
  KEY idx_purchase_bill_lines_item (item_id),
  KEY idx_purchase_bill_lines_tax_code (tax_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_debit_note_headers (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  vendor_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  related_purchase_bill_id VARCHAR(36) NULL,
  debit_note_number VARCHAR(50) NOT NULL,
  debit_note_date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  status ENUM('draft','issued','applied','void') NOT NULL DEFAULT 'draft',
  subtotal_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  posted_journal_entry_id VARCHAR(36) NULL,
  sequence_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_debit_note_headers_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_debit_note_headers_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_debit_note_headers_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchase_debit_note_headers_bill FOREIGN KEY (related_purchase_bill_id) REFERENCES purchase_bill_headers(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_debit_note_headers_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_debit_note_headers_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_purchase_debit_note_headers_amounts CHECK (
    subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0
  ),
  UNIQUE KEY uq_purchase_debit_note_headers_company_number (company_id, debit_note_number),
  KEY idx_purchase_debit_note_headers_vendor_status (vendor_id, status),
  KEY idx_purchase_debit_note_headers_company_date (company_id, debit_note_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS purchase_debit_note_lines (
  id VARCHAR(36) PRIMARY KEY,
  purchase_debit_note_id VARCHAR(36) NOT NULL,
  line_no INT NOT NULL,
  item_id VARCHAR(36) NULL,
  expense_or_inventory_account_id VARCHAR(36) NULL,
  tax_code_id VARCHAR(36) NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit_price DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  line_subtotal DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  line_total_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchase_debit_note_lines_header FOREIGN KEY (purchase_debit_note_id) REFERENCES purchase_debit_note_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_debit_note_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_debit_note_lines_account FOREIGN KEY (expense_or_inventory_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_purchase_debit_note_lines_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  CONSTRAINT chk_purchase_debit_note_lines_amounts CHECK (
    quantity >= 0 AND unit_price >= 0 AND tax_rate_percent >= 0 AND
    line_subtotal >= 0 AND line_tax_amount >= 0 AND line_total_amount >= 0
  ),
  UNIQUE KEY uq_purchase_debit_note_lines_line (purchase_debit_note_id, line_no),
  KEY idx_purchase_debit_note_lines_item (item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- PAYMENTS / ACCOUNTING / CONTROLS
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  gl_account_id VARCHAR(36) NULL,
  account_name VARCHAR(150) NOT NULL,
  bank_name VARCHAR(150) NOT NULL,
  account_number VARCHAR(100) NOT NULL,
  branch_name VARCHAR(150) NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bank_accounts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_bank_accounts_gl_account FOREIGN KEY (gl_account_id) REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  UNIQUE KEY uq_bank_accounts_company_number (company_id, account_number),
  KEY idx_bank_accounts_company_active (company_id, is_active),
  KEY idx_bank_accounts_company_default (company_id, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  bank_account_id VARCHAR(36) NULL,
  customer_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  payment_number VARCHAR(50) NOT NULL,
  payment_type ENUM('incoming','outgoing') NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  payment_method ENUM('cash','bank_transfer','cheque','card','wallet','other') NOT NULL DEFAULT 'bank_transfer',
  reference_number VARCHAR(100) NULL,
  notes TEXT NULL,
  status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
  posted_journal_entry_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_bank_account FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_payments_amount CHECK (amount > 0),
  CONSTRAINT chk_payments_counterparty CHECK (
    (customer_id IS NOT NULL AND vendor_id IS NULL AND payment_type='incoming') OR
    (vendor_id IS NOT NULL AND customer_id IS NULL AND payment_type='outgoing') OR
    (customer_id IS NULL AND vendor_id IS NULL)
  ),
  UNIQUE KEY uq_payments_company_number (company_id, payment_number),
  KEY idx_payments_company_date (company_id, payment_date),
  KEY idx_payments_customer (customer_id),
  KEY idx_payments_vendor (vendor_id),
  KEY idx_payments_status (company_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id VARCHAR(36) PRIMARY KEY,
  payment_id VARCHAR(36) NOT NULL,
  sales_invoice_id VARCHAR(36) NULL,
  purchase_bill_id VARCHAR(36) NULL,
  sales_credit_note_id VARCHAR(36) NULL,
  purchase_debit_note_id VARCHAR(36) NULL,
  allocated_amount DECIMAL(18,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_allocations_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_sales_invoice FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoice_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_purchase_bill FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bill_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_sales_credit_note FOREIGN KEY (sales_credit_note_id) REFERENCES sales_credit_note_headers(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_allocations_purchase_debit_note FOREIGN KEY (purchase_debit_note_id) REFERENCES purchase_debit_note_headers(id) ON DELETE CASCADE,
  CONSTRAINT chk_payment_allocations_amount CHECK (allocated_amount > 0),
  CONSTRAINT chk_payment_allocations_target CHECK (
    (sales_invoice_id IS NOT NULL) +
    (purchase_bill_id IS NOT NULL) +
    (sales_credit_note_id IS NOT NULL) +
    (purchase_debit_note_id IS NOT NULL) = 1
  ),
  KEY idx_payment_allocations_payment (payment_id),
  KEY idx_payment_allocations_sales_invoice (sales_invoice_id),
  KEY idx_payment_allocations_purchase_bill (purchase_bill_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS journal_lines (
  id VARCHAR(36) PRIMARY KEY,
  journal_entry_id VARCHAR(36) NOT NULL,
  line_no INT NOT NULL,
  account_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NULL,
  item_id VARCHAR(36) NULL,
  tax_code_id VARCHAR(36) NULL,
  description VARCHAR(255) NULL,
  debit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  credit_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_journal_lines_entry FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_journal_lines_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_journal_lines_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_lines_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_lines_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_journal_lines_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
  CONSTRAINT chk_journal_lines_side CHECK (
    (debit_amount > 0 AND credit_amount = 0) OR
    (credit_amount > 0 AND debit_amount = 0)
  ),
  UNIQUE KEY uq_journal_lines_entry_line (journal_entry_id, line_no),
  KEY idx_journal_lines_account (account_id),
  KEY idx_journal_lines_customer (customer_id),
  KEY idx_journal_lines_vendor (vendor_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS opening_balances (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NOT NULL,
  account_id VARCHAR(36) NOT NULL,
  customer_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NULL,
  item_id VARCHAR(36) NULL,
  warehouse_id VARCHAR(36) NULL,
  side ENUM('debit','credit') NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  posted_journal_entry_id VARCHAR(36) NULL,
  created_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_opening_balances_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_opening_balances_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_opening_balances_account FOREIGN KEY (account_id) REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_opening_balances_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_opening_balances_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_opening_balances_item FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL,
  CONSTRAINT fk_opening_balances_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL,
  CONSTRAINT fk_opening_balances_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_opening_balances_created_by FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT chk_opening_balances_amount CHECK (amount > 0),
  KEY idx_opening_balances_company_account (company_id, account_id),
  KEY idx_opening_balances_period (fiscal_period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tax_transactions (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  tax_code_id VARCHAR(36) NOT NULL,
  source_type ENUM('sales_invoice_line','sales_credit_note_line','purchase_bill_line','purchase_debit_note_line','journal_line') NOT NULL,
  source_id VARCHAR(36) NOT NULL,
  source_line_id VARCHAR(36) NULL,
  customer_id VARCHAR(36) NULL,
  vendor_id VARCHAR(36) NULL,
  tax_direction ENUM('input','output') NOT NULL,
  transaction_date DATE NOT NULL,
  taxable_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  posted_journal_entry_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tax_transactions_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_tax_transactions_tax_code FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tax_transactions_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  CONSTRAINT fk_tax_transactions_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL,
  CONSTRAINT fk_tax_transactions_journal FOREIGN KEY (posted_journal_entry_id) REFERENCES journal_entries(id) ON DELETE SET NULL,
  CONSTRAINT chk_tax_transactions_amounts CHECK (taxable_amount >= 0 AND tax_amount >= 0),
  KEY idx_tax_transactions_company_date (company_id, transaction_date),
  KEY idx_tax_transactions_tax_code (tax_code_id),
  KEY idx_tax_transactions_source (source_type, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_sequences (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  fiscal_period_id VARCHAR(36) NULL,
  document_type ENUM('sales_invoice','sales_credit_note','purchase_bill','purchase_debit_note','payment','journal_entry') NOT NULL,
  prefix VARCHAR(20) NOT NULL,
  next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
  reset_rule ENUM('never','yearly','period') NOT NULL DEFAULT 'period',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_document_sequences_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_document_sequences_period FOREIGN KEY (fiscal_period_id) REFERENCES fiscal_periods(id) ON DELETE SET NULL,
  CONSTRAINT chk_document_sequences_next_number CHECK (next_number >= 1),
  UNIQUE KEY uq_document_sequences_scope (company_id, fiscal_period_id, document_type, prefix),
  KEY idx_document_sequences_company_active (company_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  actor_user_id VARCHAR(36) NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(36) NULL,
  action_type VARCHAR(50) NOT NULL,
  reason VARCHAR(255) NULL,
  before_state JSON NULL,
  after_state JSON NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_new_audit_logs_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_new_audit_logs_actor FOREIGN KEY (actor_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  KEY idx_new_audit_logs_company_entity (company_id, entity_type, entity_id),
  KEY idx_new_audit_logs_company_action (company_id, action_type),
  KEY idx_new_audit_logs_actor (actor_user_id),
  KEY idx_new_audit_logs_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attachments (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NULL,
  file_size BIGINT UNSIGNED NULL,
  uploaded_by_user_id VARCHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachments_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_attachments_uploaded_by FOREIGN KEY (uploaded_by_user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  KEY idx_attachments_entity (company_id, entity_type, entity_id),
  KEY idx_attachments_uploaded_by (uploaded_by_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- INDEX RECOMMENDATIONS
-- ============================================================
-- 1. Keep document number uniqueness scoped by company_id.
-- 2. Keep document date indexes on sales invoices, purchase bills, payments,
--    journal entries, stock movements, and tax transactions for reporting.
-- 3. Keep composite indexes on (company_id, status) for operational lists.
-- 4. Keep allocation target indexes to support derived receivable/payable queries.
-- 5. Consider adding covering indexes for frequently-used dashboard queries
--    after measuring the real workload in production.

-- ============================================================
-- OLD -> NEW MAPPING NOTES
-- ============================================================
-- profiles -> companies + future users table (company bootstrap still anchored
--             to profiles during progressive migration)
-- company_settings -> companies
-- clients -> customers
-- vendors (legacy) -> vendors (new canonical shape)
-- vendor_products + legacy inventory master fields -> items
-- inventory snapshot rows -> items + stock_movements projection
-- invoices -> sales_invoice_headers + sales_invoice_lines
-- purchases -> purchase_bill_headers + purchase_bill_lines
-- receivables -> derived from sales_invoice_headers minus payment_allocations
-- payables -> derived from purchase_bill_headers minus payment_allocations
-- payments/payment_allocations -> evolve into the canonical settlement layer
-- tax_codes -> evolve into the canonical tax setup layer
-- existing audit_logs -> keep temporarily for HTTP/request audit; new audit_logs
--                       target domain/audit-trail semantics

-- ============================================================
-- DERIVED VS STORED NOTES
-- ============================================================
-- Derive customer receivable balances from issued sales invoices, credit notes,
-- and payment allocations instead of storing editable receivable rows.
-- Derive vendor payable balances from purchase bills, debit notes, and
-- payment allocations instead of storing editable payable rows.
-- Derive stock on hand and stock value from stock_movements rather than relying
-- on mutable current_stock fields as the system of record.
-- Derive document payment status from allocations where practical; persist
-- status only as a workflow convenience/cache, not as the primary truth.
-- Derive tax return summaries from tax_transactions and posted journal lines
-- rather than manually maintained report tables.
