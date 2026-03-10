-- ============================================================
-- FINFLOW SMB  –  Complete MySQL Schema
-- Run this in phpMyAdmin or MySQL CLI to set up from scratch.
-- DB name: finflow_smb  (create it first if it doesn't exist)
-- ============================================================

CREATE DATABASE IF NOT EXISTS finflow_smb
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE finflow_smb;

-- ── Disable FK checks so drops are not blocked ────────────
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS admin_roles;
DROP TABLE IF EXISTS company_settings;
DROP TABLE IF EXISTS purchases;
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS payables;
DROP TABLE IF EXISTS receivables;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS clients;
DROP TABLE IF EXISTS vendors;
DROP TABLE IF EXISTS inventory;
DROP TABLE IF EXISTS kyc_documents;
DROP TABLE IF EXISTS kyc_status;
DROP TABLE IF EXISTS profiles;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. PROFILES  (users)
-- ============================================================
CREATE TABLE profiles (
  id            VARCHAR(36)  PRIMARY KEY,
  name          VARCHAR(100),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  company_name  VARCHAR(255),
  gst_number    VARCHAR(50),
  address       TEXT,
  business_name VARCHAR(255),
  is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- 2. KYC STATUS
-- ============================================================
CREATE TABLE kyc_status (
  id               VARCHAR(36) PRIMARY KEY,
  user_id          VARCHAR(36) NOT NULL UNIQUE,
  status           ENUM('pending','approved','rejected') DEFAULT 'pending',
  rejection_reason TEXT,
  submitted_at     TIMESTAMP NULL DEFAULT NULL,
  reviewed_at      TIMESTAMP NULL DEFAULT NULL,
  reviewed_by      VARCHAR(36),
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- 3. KYC DOCUMENTS
-- ============================================================
CREATE TABLE kyc_documents (
  id            VARCHAR(36)  PRIMARY KEY,
  user_id       VARCHAR(36)  NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  file_size     INT,
  mime_type     VARCHAR(100),
  uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 4. INVENTORY  (products)
-- ============================================================
CREATE TABLE inventory (
  id             VARCHAR(36)    PRIMARY KEY,
  user_id        VARCHAR(36)    NOT NULL,
  product_name   VARCHAR(255)   NOT NULL,
  sku            VARCHAR(100)   NOT NULL,
  category       VARCHAR(100),
  description    TEXT,
  stock_quantity INT            NOT NULL DEFAULT 0,
  purchase_price DECIMAL(12,2)  NOT NULL,
  selling_price  DECIMAL(12,2)  NOT NULL,
  tax_rate       DECIMAL(5,2)   DEFAULT 18,
  vendor_name    VARCHAR(255),
  payment_type   ENUM('cash','credit') DEFAULT 'cash',
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  UNIQUE KEY unique_sku_per_user (user_id, sku)
);

-- ============================================================
-- 5. CLIENTS  (sales clients)
-- ============================================================
CREATE TABLE clients (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(20),
  address     TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 6. VENDORS  (purchase vendors)
-- ============================================================
CREATE TABLE vendors (
  id          VARCHAR(36)  PRIMARY KEY,
  user_id     VARCHAR(36)  NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(20),
  address     TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 7. INVOICES
-- ============================================================
CREATE TABLE invoices (
  id           VARCHAR(36)   PRIMARY KEY,
  user_id      VARCHAR(36)   NOT NULL,
  invoice_no   VARCHAR(50)   NOT NULL,
  client_name  VARCHAR(255)  NOT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  tax_amount   DECIMAL(14,2) DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL,
  status       ENUM('pending','paid','overdue','cancelled') DEFAULT 'pending',
  invoice_date DATE          NOT NULL,
  due_date     DATE          NOT NULL,
  payment_date DATE,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_due_date (due_date)
);

-- ============================================================
-- 8. RECEIVABLES
-- ============================================================
CREATE TABLE receivables (
  id          VARCHAR(36)   PRIMARY KEY,
  user_id     VARCHAR(36)   NOT NULL,
  client_name VARCHAR(255)  NOT NULL,
  invoice_id  VARCHAR(50),
  amount      DECIMAL(14,2) NOT NULL,
  due_date    DATE          NOT NULL,
  status      ENUM('pending','paid','overdue') DEFAULT 'pending',
  days_overdue INT DEFAULT 0,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 9. PAYABLES
-- ============================================================
CREATE TABLE payables (
  id           VARCHAR(36)   PRIMARY KEY,
  user_id      VARCHAR(36)   NOT NULL,
  vendor_name  VARCHAR(255)  NOT NULL,
  invoice_id   VARCHAR(50),
  amount       DECIMAL(14,2) NOT NULL,
  due_date     DATE          NOT NULL,
  status       ENUM('pending','paid','overdue') DEFAULT 'pending',
  days_overdue INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 10. SALES
-- ============================================================
CREATE TABLE sales (
  id           VARCHAR(36)   PRIMARY KEY,
  user_id      VARCHAR(36)   NOT NULL,
  client_name  VARCHAR(255)  NOT NULL,
  amount       DECIMAL(14,2) NOT NULL,
  sale_date    DATE          NOT NULL,
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_sale_date (sale_date),
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 11. PURCHASES
-- ============================================================
CREATE TABLE purchases (
  id             VARCHAR(36)   PRIMARY KEY,
  user_id        VARCHAR(36)   NOT NULL,
  vendor_name    VARCHAR(255)  NOT NULL,
  product_name   VARCHAR(255)  NOT NULL,
  quantity       INT           NOT NULL DEFAULT 1,
  amount         DECIMAL(14,2) NOT NULL,
  purchase_date  DATE          NOT NULL,
  payment_type   ENUM('cash','credit') DEFAULT 'cash',
  payment_status ENUM('paid','pending') DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
  INDEX idx_purchase_date (purchase_date),
  INDEX idx_user_id (user_id)
);

-- ============================================================
-- 12. COMPANY SETTINGS
-- ============================================================
CREATE TABLE company_settings (
  id           VARCHAR(36)  PRIMARY KEY,
  user_id      VARCHAR(36)  NOT NULL UNIQUE,
  company_name VARCHAR(255),
  gst_number   VARCHAR(50),
  address      TEXT,
  currency     VARCHAR(10)  DEFAULT 'NPR',
  region       VARCHAR(50)  DEFAULT 'Nepal',
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- 13. ADMIN ROLES  (legacy – kept for reference)
-- ============================================================
CREATE TABLE admin_roles (
  id         VARCHAR(36) PRIMARY KEY,
  user_id    VARCHAR(36) NOT NULL UNIQUE,
  role       VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
);

-- ============================================================
-- SEED: DEFAULT ADMIN ACCOUNT
-- Email: admin@finflow.com  |  Password: 123456
-- (bcrypt hash of "123456" with 10 salt rounds)
-- ============================================================
INSERT INTO profiles (id, name, email, password_hash, is_admin)
VALUES (
  UUID(),
  'Admin',
  'admin@finflow.com',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
  1
);
