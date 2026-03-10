-- FinTrac Database Schema for MySQL
-- Run this in your phpMyAdmin or MySQL Workbench

CREATE DATABASE IF NOT EXISTS testdb;
USE testdb;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Company settings table (one per user)
CREATE TABLE IF NOT EXISTS company_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  company_name VARCHAR(255),
  gst_number VARCHAR(50),
  address TEXT,
  currency VARCHAR(10) DEFAULT 'NPR',
  region VARCHAR(50) DEFAULT 'Nepal',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_settings (user_id)
);

-- Inventory/Products table
CREATE TABLE IF NOT EXISTS inventory (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  purchase_price DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_sku (user_id, sku)
);

-- Invoices/Billing table
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  invoice_no VARCHAR(50) NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status ENUM('Paid', 'Unpaid', 'Pending') DEFAULT 'Unpaid',
  due_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_user_invoice (user_id, invoice_no)
);

-- Receivables table
CREATE TABLE IF NOT EXISTS receivables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  client_name VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('Pending', 'Paid', 'Overdue') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Payables table
CREATE TABLE IF NOT EXISTS payables (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  vendor_name VARCHAR(255) NOT NULL,
  invoice_id VARCHAR(50) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('Pending', 'Paid', 'Overdue') DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Sales records table (for reports)
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  sale_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- Purchases records table (for reports)
CREATE TABLE IF NOT EXISTS purchases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT,
  product_name VARCHAR(255) NOT NULL,
  quantity INT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  purchase_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES inventory(id) ON DELETE SET NULL
);

-- Insert sample admin user (password: admin123)
-- Password hash for 'admin123' generated with bcrypt
INSERT INTO users (name, email, password) VALUES 
('Admin User', 'admin@fintrac.com', '$2a$10$rOHLKZXN6QXH1KeQd4LPVOLWqhWJxFhq.dpXvU4SHcQqXPY8p5cQy');
