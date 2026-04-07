"use strict";

// TODO(accounting-refactor): this is a legacy compatibility service over
// `invoices` and `purchases`. Its name-based fields remain only to support
// transitional callers. Authoritative settlement logic now lives in
// `SettlementService`, which uses canonical document and counterparty IDs.

function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

class PaymentAllocationService {
  constructor(db) {
    if (!db) {
      throw new Error("PaymentAllocationService requires a mysql connection");
    }
    this.db = db;
  }

  q(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
      });
    });
  }

  begin() {
    return new Promise((resolve, reject) => {
      this.db.beginTransaction((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  commit() {
    return new Promise((resolve, reject) => {
      this.db.commit((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  rollback() {
    return new Promise((resolve) => {
      this.db.rollback(() => resolve());
    });
  }

  async ensureSchema() {
    await this.q(`
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
        FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
        INDEX idx_payment_company_date (company_id, payment_date),
        INDEX idx_payment_company_type (company_id, type)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id VARCHAR(36) PRIMARY KEY,
        payment_id VARCHAR(36) NOT NULL,
        invoice_id VARCHAR(36) NULL,
        purchase_id VARCHAR(36) NULL,
        allocated_amount DECIMAL(14,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
        CONSTRAINT chk_alloc_target CHECK (
          (invoice_id IS NOT NULL AND purchase_id IS NULL) OR
          (invoice_id IS NULL AND purchase_id IS NOT NULL)
        ),
        CONSTRAINT chk_alloc_positive CHECK (allocated_amount > 0),
        INDEX idx_alloc_payment (payment_id),
        INDEX idx_alloc_invoice (invoice_id),
        INDEX idx_alloc_purchase (purchase_id)
      )
    `);
  }

  async getInvoiceOutstanding(companyId, invoiceId) {
    // TODO(accounting-refactor): legacy invoices only expose `client_name`, so
    // this result is inherently legacy-derived until the old invoice table is retired.
    const rows = await this.q(
      `SELECT
          i.id,
          i.invoice_no,
          i.client_name,
          i.invoice_date,
          i.due_date,
          i.total_amount,
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount,
          (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) AS outstanding_amount,
          GREATEST(DATEDIFF(CURDATE(), i.due_date), 0) AS days_overdue
       FROM invoices i
       LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE i.user_id = ?
         AND i.status != 'cancelled'
         AND i.id = ?
       GROUP BY i.id, i.invoice_no, i.client_name, i.invoice_date, i.due_date, i.total_amount`,
      [companyId, invoiceId]
    );

    return rows[0] || null;
  }

  async getPurchaseOutstanding(companyId, purchaseId) {
    // TODO(accounting-refactor): legacy purchases only expose `vendor_name`, so
    // this result is inherently legacy-derived until the old purchase table is retired.
    const rows = await this.q(
      `SELECT
          pu.id,
          pu.vendor_name,
          pu.purchase_date,
          pu.amount,
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount,
          (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0)) AS outstanding_amount,
          GREATEST(DATEDIFF(CURDATE(), pu.purchase_date), 0) AS days_overdue
       FROM purchases pu
       LEFT JOIN payment_allocations pa ON pa.purchase_id = pu.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pu.user_id = ?
         AND COALESCE(pu.status,'posted') != 'void'
         AND pu.id = ?
       GROUP BY pu.id, pu.vendor_name, pu.purchase_date, pu.amount`,
      [companyId, purchaseId]
    );

    return rows[0] || null;
  }

  async applyPayment({ paymentId, companyId, type, amount, paymentDate, method, reference, notes, allocations }) {
    if (!companyId) throw new Error("companyId is required");
    if (!["incoming", "outgoing"].includes(type)) throw new Error("type must be incoming or outgoing");
    if (!isPositiveNumber(amount)) throw new Error("amount must be a positive number");
    if (!paymentDate) throw new Error("paymentDate is required");
    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error("allocations array is required");
    }

    let allocatedTotal = 0;

    for (const alloc of allocations) {
      if (!isPositiveNumber(alloc.allocated_amount)) {
        throw new Error("Each allocation amount must be positive");
      }
      if (!["invoice", "purchase"].includes(alloc.target_type)) {
        throw new Error("Allocation target_type must be invoice or purchase");
      }
      if (!alloc.target_id) {
        throw new Error("Each allocation must include target_id");
      }
      allocatedTotal += Number(alloc.allocated_amount);
    }

    allocatedTotal = Number(allocatedTotal.toFixed(2));
    const paymentAmount = Number(Number(amount).toFixed(2));

    if (allocatedTotal > paymentAmount) {
      throw new Error("Allocated total cannot exceed payment amount");
    }

    await this.begin();
    try {
      const id = paymentId;
      await this.q(
        `INSERT INTO payments (id, company_id, type, amount, payment_date, method, reference, notes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'posted')`,
        [id, companyId, type, paymentAmount, paymentDate, method || "bank_transfer", reference || null, notes || null]
      );

      for (const alloc of allocations) {
        const allocAmount = Number(Number(alloc.allocated_amount).toFixed(2));

        if (alloc.target_type === "invoice") {
          if (type !== "incoming") {
            throw new Error("Invoice allocations require incoming payment type");
          }

          const invoiceOutstanding = await this.getInvoiceOutstanding(companyId, alloc.target_id);
          if (!invoiceOutstanding) {
            throw new Error(`Invoice not found: ${alloc.target_id}`);
          }
          if (allocAmount > Number(invoiceOutstanding.outstanding_amount)) {
            throw new Error(`Allocation exceeds invoice outstanding for ${invoiceOutstanding.invoice_no}`);
          }

          await this.q(
            `INSERT INTO payment_allocations (id, payment_id, invoice_id, purchase_id, allocated_amount)
             VALUES (?, ?, ?, NULL, ?)`,
            [alloc.id, id, alloc.target_id, allocAmount]
          );
        }

        if (alloc.target_type === "purchase") {
          if (type !== "outgoing") {
            throw new Error("Purchase allocations require outgoing payment type");
          }

          const purchaseOutstanding = await this.getPurchaseOutstanding(companyId, alloc.target_id);
          if (!purchaseOutstanding) {
            throw new Error(`Purchase not found: ${alloc.target_id}`);
          }
          if (allocAmount > Number(purchaseOutstanding.outstanding_amount)) {
            throw new Error(`Allocation exceeds purchase outstanding for ${purchaseOutstanding.id}`);
          }

          await this.q(
            `INSERT INTO payment_allocations (id, payment_id, invoice_id, purchase_id, allocated_amount)
             VALUES (?, ?, NULL, ?, ?)`,
            [alloc.id, id, alloc.target_id, allocAmount]
          );
        }
      }

      await this.commit();

      return {
        id,
        company_id: companyId,
        type,
        amount: paymentAmount,
        allocated_amount: allocatedTotal,
        overpayment_amount: Number((paymentAmount - allocatedTotal).toFixed(2)),
        status: "posted"
      };
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }

  async getOutstandingReceivables(companyId) {
    return this.q(
      `SELECT
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
       WHERE i.user_id = ?
         AND i.status != 'cancelled'
       GROUP BY i.id, i.invoice_no, i.client_name, i.invoice_date, i.due_date, i.total_amount
       HAVING outstanding_amount > 0
       ORDER BY i.due_date ASC`,
      [companyId]
    );
  }

  async getOutstandingPayables(companyId) {
    return this.q(
      `SELECT
          pu.id AS purchase_id,
          pu.vendor_name,
          pu.purchase_date AS due_date,
          pu.amount AS total_amount,
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
       WHERE pu.user_id = ?
         AND COALESCE(pu.status,'posted') != 'void'
       GROUP BY pu.id, pu.vendor_name, pu.purchase_date, pu.amount
       HAVING outstanding_amount > 0
       ORDER BY pu.purchase_date ASC`,
      [companyId]
    );
  }

  async getAging(companyId, type) {
    const rows = type === "receivable"
      ? await this.getOutstandingReceivables(companyId)
      : await this.getOutstandingPayables(companyId);

    const bucket = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_91_plus: 0,
      total: 0
    };

    for (const row of rows) {
      const amt = Number(row.outstanding_amount || 0);
      const days = Number(row.days_overdue || 0);
      bucket.total += amt;

      if (days <= 0) bucket.current += amt;
      else if (days <= 30) bucket.days_1_30 += amt;
      else if (days <= 60) bucket.days_31_60 += amt;
      else if (days <= 90) bucket.days_61_90 += amt;
      else bucket.days_91_plus += amt;
    }

    return {
      type,
      company_id: companyId,
      bucket: {
        current: Number(bucket.current.toFixed(2)),
        days_1_30: Number(bucket.days_1_30.toFixed(2)),
        days_31_60: Number(bucket.days_31_60.toFixed(2)),
        days_61_90: Number(bucket.days_61_90.toFixed(2)),
        days_91_plus: Number(bucket.days_91_plus.toFixed(2)),
        total: Number(bucket.total.toFixed(2))
      },
      lines: rows
    };
  }
}

module.exports = {
  PaymentAllocationService
};
