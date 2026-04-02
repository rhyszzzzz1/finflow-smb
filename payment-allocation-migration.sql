-- ============================================================
-- FinFlow SMB - Payment Allocation Migration (Legacy-Compatible)
-- Goal: replace mutable receivables/payables with derived balances
-- ============================================================

USE finflow_smb;

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  company_id VARCHAR(36) NOT NULL,
  type ENUM('incoming','outgoing') NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_date DATE NOT NULL,
  method ENUM('cash','bank_transfer','cheque','card','wallet','other') DEFAULT 'bank_transfer',
  reference VARCHAR(120),
  notes TEXT,
  status ENUM('posted','voided') NOT NULL DEFAULT 'posted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_company FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
  KEY idx_payment_company_date (company_id, payment_date),
  KEY idx_payment_company_type (company_id, type)
);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id VARCHAR(36) PRIMARY KEY,
  payment_id VARCHAR(36) NOT NULL,
  invoice_id VARCHAR(36) NULL,
  purchase_id VARCHAR(36) NULL,
  allocated_amount DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_alloc_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_alloc_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT chk_alloc_target CHECK (
    (invoice_id IS NOT NULL AND purchase_id IS NULL) OR
    (invoice_id IS NULL AND purchase_id IS NOT NULL)
  ),
  CONSTRAINT chk_alloc_positive CHECK (allocated_amount > 0),
  KEY idx_alloc_payment (payment_id),
  KEY idx_alloc_invoice (invoice_id),
  KEY idx_alloc_purchase (purchase_id)
);

DROP VIEW IF EXISTS v_receivables_derived;
CREATE VIEW v_receivables_derived AS
SELECT
  i.user_id AS company_id,
  i.id AS invoice_id,
  i.invoice_no,
  i.client_name,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount,
  (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) AS outstanding_amount,
  GREATEST(DATEDIFF(CURDATE(), i.due_date), 0) AS days_overdue,
  CASE
    WHEN (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) <= 0 THEN 'paid'
    WHEN i.due_date < CURDATE() THEN 'overdue'
    ELSE 'open'
  END AS status
FROM invoices i
LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
LEFT JOIN payments p ON p.id = pa.payment_id
GROUP BY i.user_id, i.id, i.invoice_no, i.client_name, i.invoice_date, i.due_date, i.total_amount;

DROP VIEW IF EXISTS v_payables_derived;
CREATE VIEW v_payables_derived AS
SELECT
  pu.user_id AS company_id,
  pu.id AS purchase_id,
  pu.vendor_name,
  pu.purchase_date,
  pu.amount,
  COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount,
  (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) AS outstanding_amount,
  GREATEST(DATEDIFF(CURDATE(), pu.purchase_date), 0) AS days_overdue,
  CASE
    WHEN (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) <= 0 THEN 'paid'
    WHEN pu.purchase_date < CURDATE() THEN 'overdue'
    ELSE 'open'
  END AS status
FROM purchases pu
LEFT JOIN payment_allocations pa ON pa.purchase_id = pu.id
LEFT JOIN payments p ON p.id = pa.payment_id
GROUP BY pu.user_id, pu.id, pu.vendor_name, pu.purchase_date, pu.amount;

-- Optional hard-stop protections to prevent future accidental writes.
-- Keep these commented until API clients are fully switched.
--
-- DELIMITER $$
-- CREATE TRIGGER trg_receivables_no_insert BEFORE INSERT ON receivables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receivables is deprecated; use allocations'; END$$
-- CREATE TRIGGER trg_receivables_no_update BEFORE UPDATE ON receivables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receivables is deprecated; use allocations'; END$$
-- CREATE TRIGGER trg_receivables_no_delete BEFORE DELETE ON receivables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='receivables is deprecated; use allocations'; END$$
-- CREATE TRIGGER trg_payables_no_insert BEFORE INSERT ON payables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payables is deprecated; use allocations'; END$$
-- CREATE TRIGGER trg_payables_no_update BEFORE UPDATE ON payables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payables is deprecated; use allocations'; END$$
-- CREATE TRIGGER trg_payables_no_delete BEFORE DELETE ON payables
-- FOR EACH ROW BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='payables is deprecated; use allocations'; END$$
-- DELIMITER ;
