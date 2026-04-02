-- ============================================================
-- FinFlow SMB - Production Hardening Migration
-- ============================================================

USE finflow_smb;

-- 1) Enforce lifecycle/status columns for non-destructive deletion.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS status ENUM('draft','posted','void') NOT NULL DEFAULT 'posted',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- 2) Audit log table for mutation traceability.
CREATE TABLE IF NOT EXISTS audit_logs (
  id             VARCHAR(36) PRIMARY KEY,
  user_id        VARCHAR(36) NULL,
  http_method    VARCHAR(10) NOT NULL,
  endpoint       VARCHAR(255) NOT NULL,
  status_code    INT NOT NULL,
  request_body   JSON NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL,
  KEY idx_audit_user_date (user_id, created_at)
);

-- 3) Prevent hard-delete corruption on core financial docs.
DROP TRIGGER IF EXISTS trg_no_hard_delete_invoices;
DROP TRIGGER IF EXISTS trg_no_hard_delete_purchases;

DELIMITER $$
CREATE TRIGGER trg_no_hard_delete_invoices
BEFORE DELETE ON invoices
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Hard delete blocked on invoices. Use status cancel/void + reversal workflow.';
END$$

CREATE TRIGGER trg_no_hard_delete_purchases
BEFORE DELETE ON purchases
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Hard delete blocked on purchases. Use status void + reversal workflow.';
END$$
DELIMITER ;

-- 4) Helpful integrity indexes.
CREATE INDEX IF NOT EXISTS idx_invoices_user_status_date ON invoices(user_id, status, invoice_date);
CREATE INDEX IF NOT EXISTS idx_purchases_user_status_date ON purchases(user_id, status, purchase_date);
CREATE INDEX IF NOT EXISTS idx_payments_company_type_date ON payments(company_id, type, payment_date);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_invoice ON payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_alloc_purchase ON payment_allocations(purchase_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_item_date ON stock_movements(company_id, item_id, created_at);
