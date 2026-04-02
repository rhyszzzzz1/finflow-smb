"use strict";

const crypto = require("crypto");

class SettlementService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("SettlementService requires a mysql2/promise pool");
    }
    if (!options.journalService) {
      throw new Error("SettlementService requires a journalService");
    }
    if (!options.accountingControlService) {
      throw new Error("SettlementService requires an accountingControlService");
    }

    this.pool = pool;
    this.journalService = options.journalService;
    this.accountingControlService = options.accountingControlService;
    this.auditService = options.auditService || null;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
  }

  async withTransaction(work) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_rollbackError) {
        // preserve original error
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  async queryAll(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  money(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  async writeAudit(conn, payload) {
    if (!this.auditService) return;
    await this.auditService.logAction(payload, conn);
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        gl_account_id VARCHAR(36) NULL,
        account_name VARCHAR(150) NOT NULL,
        bank_name VARCHAR(150) NULL,
        account_number VARCHAR(100) NULL,
        branch_name VARCHAR(150) NULL,
        currency_code CHAR(3) NOT NULL DEFAULT 'NPR',
        is_default TINYINT(1) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_bank_accounts_company_number (company_id, account_number)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS payments (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        payment_number VARCHAR(50) NULL,
        bank_account_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        type ENUM('incoming','outgoing') NOT NULL,
        amount DECIMAL(14,2) NOT NULL,
        allocated_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        unapplied_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        payment_date DATE NOT NULL,
        method ENUM('cash','bank_transfer','cheque','card','wallet','other') DEFAULT 'bank_transfer',
        reference VARCHAR(120) NULL,
        notes TEXT NULL,
        status ENUM('draft','posted','voided') NOT NULL DEFAULT 'posted',
        posted_journal_entry_id VARCHAR(36) NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_company_date (company_id, payment_date),
        INDEX idx_payment_company_type (company_id, type)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS payment_allocations (
        id VARCHAR(36) PRIMARY KEY,
        payment_id VARCHAR(36) NOT NULL,
        invoice_id VARCHAR(36) NULL,
        purchase_id VARCHAR(36) NULL,
        sales_invoice_id VARCHAR(36) NULL,
        purchase_bill_id VARCHAR(36) NULL,
        allocated_amount DECIMAL(14,2) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_alloc_payment (payment_id),
        INDEX idx_alloc_invoice (invoice_id),
        INDEX idx_alloc_purchase (purchase_id),
        INDEX idx_alloc_sales_invoice (sales_invoice_id),
        INDEX idx_alloc_purchase_bill (purchase_bill_id)
      )
      `,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_number VARCHAR(50) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS bank_account_id VARCHAR(36) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS allocated_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS unapplied_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS posted_journal_entry_id VARCHAR(36) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE payments MODIFY COLUMN status ENUM('draft','posted','voided') NOT NULL DEFAULT 'posted'`,
      `ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS sales_invoice_id VARCHAR(36) NULL`,
      `ALTER TABLE payment_allocations ADD COLUMN IF NOT EXISTS purchase_bill_id VARCHAR(36) NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // mixed environments may already differ
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    const company = await this.queryOne(
      conn,
      `SELECT id
         FROM companies
        WHERE legacy_profile_id = ?
           OR owner_profile_id = ?
        LIMIT 1`,
      [actorUserId, actorUserId]
    ).catch(() => null);
    return company?.id || actorUserId;
  }

  async resolveBankAccount(conn, companyId, payload) {
    if (payload.method === "cash") {
      return {
        bankAccountId: null,
        glAccountCode: "1010-CASH",
      };
    }

    if (payload.bank_account_id) {
      const bankAccount = await this.queryOne(
        conn,
        `SELECT id, gl_account_id
           FROM bank_accounts
          WHERE id = ?
            AND company_id = ?
            AND is_active = 1
          LIMIT 1`,
        [payload.bank_account_id, companyId]
      );
      if (!bankAccount) {
        throw new Error("Bank account not found");
      }
      return {
        bankAccountId: bankAccount.id,
        glAccountId: bankAccount.gl_account_id || null,
        glAccountCode: bankAccount.gl_account_id ? undefined : "1020-BANK",
      };
    }

    const defaultBank = await this.queryOne(
      conn,
      `SELECT id, gl_account_id
         FROM bank_accounts
        WHERE company_id = ?
          AND is_default = 1
          AND is_active = 1
        LIMIT 1`,
      [companyId]
    ).catch(() => null);

    if (defaultBank) {
      return {
        bankAccountId: defaultBank.id,
        glAccountId: defaultBank.gl_account_id || null,
        glAccountCode: defaultBank.gl_account_id ? undefined : "1020-BANK",
      };
    }

    return {
      bankAccountId: null,
      glAccountCode: "1020-BANK",
    };
  }

  async getSalesInvoiceOutstanding(conn, actorUserId, invoiceId) {
    const modern = await this.queryOne(
      conn,
      `SELECT
          si.id,
          si.invoice_no,
          si.customer_id,
          si.customer_name,
          si.invoice_date,
          si.due_date,
          si.total_amount,
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM sales_invoice_headers si
       LEFT JOIN payment_allocations pa ON pa.sales_invoice_id = si.id OR pa.invoice_id = si.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE si.user_id = ?
         AND si.id = ?
         AND si.status != 'void'
       GROUP BY si.id, si.invoice_no, si.customer_id, si.customer_name, si.invoice_date, si.due_date, si.total_amount`,
      [actorUserId, invoiceId]
    ).catch(() => null);

    if (modern) {
      const allocated = this.money(modern.allocated_amount);
      return {
        document_type: "sales_invoice",
        id: modern.id,
        document_no: modern.invoice_no,
        counterparty_id: modern.customer_id || null,
        counterparty_name: modern.customer_name || null,
        document_date: modern.invoice_date,
        due_date: modern.due_date,
        total_amount: this.money(modern.total_amount),
        allocated_amount: allocated,
        outstanding_amount: this.money(modern.total_amount - allocated),
      };
    }

    const legacy = await this.queryOne(
      conn,
      `SELECT
          i.id,
          i.invoice_no,
          i.client_name AS customer_name,
          i.invoice_date,
          i.due_date,
          i.total_amount,
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM invoices i
       LEFT JOIN payment_allocations pa ON pa.invoice_id = i.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE i.user_id = ?
         AND i.id = ?
         AND i.status != 'cancelled'
       GROUP BY i.id, i.invoice_no, i.client_name, i.invoice_date, i.due_date, i.total_amount`,
      [actorUserId, invoiceId]
    );

    if (!legacy) return null;
    const allocated = this.money(legacy.allocated_amount);
    return {
      document_type: "sales_invoice",
      id: legacy.id,
      document_no: legacy.invoice_no,
      counterparty_id: null,
      counterparty_name: legacy.customer_name,
      document_date: legacy.invoice_date,
      due_date: legacy.due_date,
      total_amount: this.money(legacy.total_amount),
      allocated_amount: allocated,
      outstanding_amount: this.money(legacy.total_amount - allocated),
    };
  }

  async getPurchaseBillOutstanding(conn, actorUserId, billId) {
    const modern = await this.queryOne(
      conn,
      `SELECT
          pb.id,
          pb.bill_no,
          pb.vendor_id,
          pb.vendor_name,
          pb.bill_date,
          pb.due_date,
          pb.total_amount,
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM purchase_bill_headers pb
       LEFT JOIN payment_allocations pa ON pa.purchase_bill_id = pb.id OR pa.purchase_id = pb.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pb.user_id = ?
         AND pb.id = ?
         AND pb.status != 'void'
       GROUP BY pb.id, pb.bill_no, pb.vendor_id, pb.vendor_name, pb.bill_date, pb.due_date, pb.total_amount`,
      [actorUserId, billId]
    ).catch(() => null);

    if (modern) {
      const allocated = this.money(modern.allocated_amount);
      return {
        document_type: "purchase_bill",
        id: modern.id,
        document_no: modern.bill_no,
        counterparty_id: modern.vendor_id || null,
        counterparty_name: modern.vendor_name || null,
        document_date: modern.bill_date,
        due_date: modern.due_date,
        total_amount: this.money(modern.total_amount),
        allocated_amount: allocated,
        outstanding_amount: this.money(modern.total_amount - allocated),
      };
    }

    const legacy = await this.queryOne(
      conn,
      `SELECT
          pu.id,
          pu.purchase_id AS bill_no,
          pu.vendor_name,
          pu.purchase_date AS bill_date,
          pu.due_date,
          pu.total_amount,
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM purchases pu
       LEFT JOIN payment_allocations pa ON pa.purchase_id = pu.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pu.user_id = ?
         AND pu.id = ?
         AND COALESCE(pu.status, 'posted') != 'void'
       GROUP BY pu.id, pu.purchase_id, pu.vendor_name, pu.purchase_date, pu.due_date, pu.total_amount`,
      [actorUserId, billId]
    );

    if (!legacy) return null;
    const allocated = this.money(legacy.allocated_amount);
    return {
      document_type: "purchase_bill",
      id: legacy.id,
      document_no: legacy.bill_no,
      counterparty_id: null,
      counterparty_name: legacy.vendor_name,
      document_date: legacy.bill_date,
      due_date: legacy.due_date,
      total_amount: this.money(legacy.total_amount),
      allocated_amount: allocated,
      outstanding_amount: this.money(legacy.total_amount - allocated),
    };
  }

  async calculateDocumentOutstanding(actorUserId, targetType, targetId) {
    const conn = await this.pool.getConnection();
    try {
      if (targetType === "sales_invoice" || targetType === "invoice") {
        return this.getSalesInvoiceOutstanding(conn, actorUserId, targetId);
      }
      if (targetType === "purchase_bill" || targetType === "purchase") {
        return this.getPurchaseBillOutstanding(conn, actorUserId, targetId);
      }
      throw new Error("Unsupported targetType");
    } finally {
      conn.release();
    }
  }

  async allocatePayment(conn, actorUserId, paymentId, paymentType, allocations) {
    let allocatedTotal = 0;
    const normalized = [];

    for (const alloc of allocations || []) {
      const targetType = alloc.target_type;
      const targetId = alloc.target_id;
      const amount = this.money(alloc.allocated_amount);

      if (!amount || amount <= 0) {
        throw new Error("Each allocation amount must be positive");
      }
      if (!targetId) {
        throw new Error("Each allocation requires target_id");
      }

      if (["invoice", "sales_invoice"].includes(targetType)) {
        if (paymentType !== "incoming") {
          throw new Error("Sales invoice allocations require incoming payments");
        }
        const outstanding = await this.getSalesInvoiceOutstanding(conn, actorUserId, targetId);
        if (!outstanding) throw new Error(`Sales invoice not found: ${targetId}`);
        if (amount > outstanding.outstanding_amount) {
          throw new Error(`Allocation exceeds outstanding amount for ${outstanding.document_no}`);
        }
        await conn.execute(
          `INSERT INTO payment_allocations
            (id, payment_id, invoice_id, sales_invoice_id, allocated_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [this.idFactory(), paymentId, targetId, targetId, amount]
        );
        normalized.push({ target_type: "sales_invoice", target_id: targetId, allocated_amount: amount });
      } else if (["purchase", "purchase_bill"].includes(targetType)) {
        if (paymentType !== "outgoing") {
          throw new Error("Purchase bill allocations require outgoing payments");
        }
        const outstanding = await this.getPurchaseBillOutstanding(conn, actorUserId, targetId);
        if (!outstanding) throw new Error(`Purchase bill not found: ${targetId}`);
        if (amount > outstanding.outstanding_amount) {
          throw new Error(`Allocation exceeds outstanding amount for ${outstanding.document_no}`);
        }
        await conn.execute(
          `INSERT INTO payment_allocations
            (id, payment_id, purchase_id, purchase_bill_id, allocated_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [this.idFactory(), paymentId, targetId, targetId, amount]
        );
        normalized.push({ target_type: "purchase_bill", target_id: targetId, allocated_amount: amount });
      } else {
        throw new Error("Allocation target_type must be sales_invoice/invoice or purchase_bill/purchase");
      }

      allocatedTotal = this.money(allocatedTotal + amount);
    }

    return {
      allocated_total: allocatedTotal,
      allocations: normalized,
    };
  }

  async applyPayment(actorUserId, payload, requestMeta = {}) {
    const {
      type,
      amount,
      date,
      method = "bank_transfer",
      bank_account_id = null,
      customer_id = null,
      vendor_id = null,
      reference = null,
      notes = null,
      allocations = [],
    } = payload;

    if (!["incoming", "outgoing"].includes(type)) {
      throw new Error("type must be incoming or outgoing");
    }

    const paymentAmount = this.money(amount);
    if (paymentAmount <= 0) {
      throw new Error("amount must be a positive number");
    }
    if (!date) {
      throw new Error("date is required");
    }

    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const paymentId = this.idFactory();
      await this.accountingControlService.validatePostingDate(conn, companyId, date);
      const paymentNumberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "payment",
        entryDate: date,
        prefix: `${type === "incoming" ? "RCPT" : "PMT"}-${String(date).slice(0, 4)}-`,
      });
      const paymentNumber = paymentNumberInfo.documentNumber;
      const bankInfo = await this.resolveBankAccount(conn, companyId, { method, bank_account_id });

      if (type === "incoming" && vendor_id) {
        throw new Error("Incoming payments cannot target vendors");
      }
      if (type === "outgoing" && customer_id) {
        throw new Error("Outgoing payments cannot target customers");
      }

      await conn.execute(
        `INSERT INTO payments
          (id, company_id, payment_number, bank_account_id, customer_id, vendor_id, type, amount, allocated_amount, unapplied_amount,
           payment_date, method, reference, notes, status, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          paymentId,
          companyId,
          paymentNumber,
          bankInfo.bankAccountId,
          customer_id,
          vendor_id,
          type,
          paymentAmount,
          paymentAmount,
          date,
          method,
          reference,
          notes,
          actorUserId,
        ]
      );

      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "payment",
        entityId: paymentId,
        actionType: "create",
        newValues: {
          payment_number: paymentNumber,
          type,
          amount: paymentAmount,
          status: "draft",
          customer_id,
          vendor_id,
        },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });

      const allocationResult = await this.allocatePayment(conn, actorUserId, paymentId, type, allocations);
      const unappliedAmount = this.money(paymentAmount - allocationResult.allocated_total);

      const journalLines = [];
      const cashSide = {
        accountId: bankInfo.glAccountId || null,
        accountCode: bankInfo.glAccountId ? undefined : bankInfo.glAccountCode,
        debit: type === "incoming" ? paymentAmount : 0,
        credit: type === "outgoing" ? paymentAmount : 0,
        customerId: customer_id || null,
        vendorId: vendor_id || null,
        description: `${type === "incoming" ? "Receipt" : "Payment"} ${paymentNumber}`,
      };
      journalLines.push(cashSide);

      if (allocationResult.allocated_total > 0) {
        journalLines.push({
          accountCode: type === "incoming" ? "1100-AR" : "2100-AP",
          debit: type === "outgoing" ? allocationResult.allocated_total : 0,
          credit: type === "incoming" ? allocationResult.allocated_total : 0,
          customerId: customer_id || null,
          vendorId: vendor_id || null,
          description: `${type === "incoming" ? "Settle receivable" : "Settle payable"} ${paymentNumber}`,
        });
      }

      if (unappliedAmount > 0) {
        journalLines.push({
          accountCode: type === "incoming" ? "2100-AP" : "1100-AR",
          debit: type === "incoming" ? 0 : unappliedAmount,
          credit: type === "incoming" ? unappliedAmount : 0,
          customerId: customer_id || null,
          vendorId: vendor_id || null,
          description: `${type === "incoming" ? "Customer overpayment liability" : "Vendor advance asset"} ${paymentNumber}`,
        });
      }

      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "payment",
        sourceId: paymentId,
        entryDate: date,
        memo: `${type === "incoming" ? "Customer receipt" : "Vendor payment"} ${paymentNumber}`,
        createdByUserId: actorUserId,
        requestMeta,
        lines: journalLines,
      });

      const postedJournal = await this.journalService.postJournalEntry({
        companyId,
        journalEntryId: journalEntry.id,
        actorUserId,
        requestMeta,
      });

      await conn.execute(
        `UPDATE payments
            SET allocated_amount = ?,
                unapplied_amount = ?,
                posted_journal_entry_id = ?,
                status = 'posted',
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [allocationResult.allocated_total, unappliedAmount, postedJournal.id, paymentId]
      );

      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "payment",
        entityId: paymentId,
        actionType: "post",
        oldValues: { status: "draft", allocated_amount: 0, unapplied_amount: paymentAmount },
        newValues: {
          status: "posted",
          allocated_amount: allocationResult.allocated_total,
          unapplied_amount: unappliedAmount,
          posted_journal_entry_id: postedJournal.id,
        },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });

      return {
        id: paymentId,
        payment_number: paymentNumber,
        company_id: companyId,
        type,
        amount: paymentAmount,
        allocated_amount: allocationResult.allocated_total,
        overpayment_amount: unappliedAmount,
        method,
        bank_account_id: bankInfo.bankAccountId,
        status: "posted",
        allocations: allocationResult.allocations,
      };
    });
  }

  async calculateCustomerBalance(actorUserId, customerId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT
            si.id,
            si.invoice_no,
            si.total_amount,
            COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
         FROM sales_invoice_headers si
         LEFT JOIN payment_allocations pa ON pa.sales_invoice_id = si.id OR pa.invoice_id = si.id
         LEFT JOIN payments p ON p.id = pa.payment_id
         WHERE si.user_id = ?
           AND si.customer_id = ?
           AND si.status != 'void'
         GROUP BY si.id, si.invoice_no, si.total_amount`,
        [actorUserId, customerId]
      ).catch(() => []);

      return rows.reduce((sum, row) => {
        const outstanding = this.money(Number(row.total_amount || 0) - Number(row.allocated_amount || 0));
        return this.money(sum + outstanding);
      }, 0);
    } finally {
      conn.release();
    }
  }

  async calculateVendorBalance(actorUserId, vendorId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT
            pb.id,
            pb.bill_no,
            pb.total_amount,
            COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
         FROM purchase_bill_headers pb
         LEFT JOIN payment_allocations pa ON pa.purchase_bill_id = pb.id OR pa.purchase_id = pb.id
         LEFT JOIN payments p ON p.id = pa.payment_id
         WHERE pb.user_id = ?
           AND pb.vendor_id = ?
           AND pb.status != 'void'
         GROUP BY pb.id, pb.bill_no, pb.total_amount`,
        [actorUserId, vendorId]
      ).catch(() => []);

      return rows.reduce((sum, row) => {
        const outstanding = this.money(Number(row.total_amount || 0) - Number(row.allocated_amount || 0));
        return this.money(sum + outstanding);
      }, 0);
    } finally {
      conn.release();
    }
  }

  async getOutstandingReceivables(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT
            si.id AS document_id,
            si.invoice_no AS document_no,
            si.customer_id,
            si.customer_name,
            si.invoice_date AS document_date,
            si.due_date,
            si.total_amount,
            COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
         FROM sales_invoice_headers si
         LEFT JOIN payment_allocations pa ON pa.sales_invoice_id = si.id OR pa.invoice_id = si.id
         LEFT JOIN payments p ON p.id = pa.payment_id
         WHERE si.user_id = ?
           AND si.status != 'void'
         GROUP BY si.id, si.invoice_no, si.customer_id, si.customer_name, si.invoice_date, si.due_date, si.total_amount
         HAVING total_amount - allocated_amount > 0
         ORDER BY si.due_date ASC`
      , [actorUserId]).catch(() => []);

      return rows.map((row) => ({
        ...row,
        allocated_amount: this.money(row.allocated_amount),
        outstanding_amount: this.money(Number(row.total_amount || 0) - Number(row.allocated_amount || 0)),
        days_overdue: Math.max(0, Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86400000)),
      }));
    } finally {
      conn.release();
    }
  }

  async getOutstandingPayables(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT
            pb.id AS document_id,
            pb.bill_no AS document_no,
            pb.vendor_id,
            pb.vendor_name,
            pb.bill_date AS document_date,
            pb.due_date,
            pb.total_amount,
            COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
         FROM purchase_bill_headers pb
         LEFT JOIN payment_allocations pa ON pa.purchase_bill_id = pb.id OR pa.purchase_id = pb.id
         LEFT JOIN payments p ON p.id = pa.payment_id
         WHERE pb.user_id = ?
           AND pb.status != 'void'
         GROUP BY pb.id, pb.bill_no, pb.vendor_id, pb.vendor_name, pb.bill_date, pb.due_date, pb.total_amount
         HAVING total_amount - allocated_amount > 0
         ORDER BY pb.due_date ASC`,
        [actorUserId]
      ).catch(() => []);

      return rows.map((row) => ({
        ...row,
        allocated_amount: this.money(row.allocated_amount),
        outstanding_amount: this.money(Number(row.total_amount || 0) - Number(row.allocated_amount || 0)),
        days_overdue: Math.max(0, Math.floor((Date.now() - new Date(row.due_date).getTime()) / 86400000)),
      }));
    } finally {
      conn.release();
    }
  }

  bucketAging(lines) {
    const bucket = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_91_plus: 0,
      total: 0,
    };

    for (const line of lines) {
      const amount = this.money(line.outstanding_amount);
      const days = Number(line.days_overdue || 0);
      bucket.total = this.money(bucket.total + amount);
      if (days <= 0) bucket.current = this.money(bucket.current + amount);
      else if (days <= 30) bucket.days_1_30 = this.money(bucket.days_1_30 + amount);
      else if (days <= 60) bucket.days_31_60 = this.money(bucket.days_31_60 + amount);
      else if (days <= 90) bucket.days_61_90 = this.money(bucket.days_61_90 + amount);
      else bucket.days_91_plus = this.money(bucket.days_91_plus + amount);
    }

    return bucket;
  }

  async calculateARAging(actorUserId) {
    const lines = await this.getOutstandingReceivables(actorUserId);
    return {
      type: "receivable",
      bucket: this.bucketAging(lines),
      lines,
    };
  }

  async calculateAPAging(actorUserId) {
    const lines = await this.getOutstandingPayables(actorUserId);
    return {
      type: "payable",
      bucket: this.bucketAging(lines),
      lines,
    };
  }

  async listBankAccounts(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      return this.queryAll(
        conn,
        `SELECT *
           FROM bank_accounts
          WHERE company_id = ?
            AND is_active = 1
          ORDER BY is_default DESC, account_name ASC`,
        [companyId]
      );
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SettlementService,
};
