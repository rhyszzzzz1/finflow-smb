"use strict";

const crypto = require("crypto");

class SalesInvoiceService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("SalesInvoiceService requires a mysql2/promise pool");
    }
    if (!options.journalService) {
      throw new Error("SalesInvoiceService requires a journalService");
    }
    if (!options.taxService) {
      throw new Error("SalesInvoiceService requires a taxService");
    }
    if (!options.accountingControlService) {
      throw new Error("SalesInvoiceService requires an accountingControlService");
    }

    this.pool = pool;
    this.journalService = options.journalService;
    this.taxService = options.taxService;
    this.accountingControlService = options.accountingControlService;
    this.inventoryLedgerService = options.inventoryLedgerService || null;
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
        // Preserve original error.
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

  qty(value) {
    return Number(Number(value || 0).toFixed(4));
  }

  async writeAudit(conn, payload) {
    if (!this.auditService) return;
    await this.auditService.logAction(payload, conn);
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS document_sequences (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        fiscal_period_id VARCHAR(36) NULL,
        document_type VARCHAR(50) NOT NULL,
        prefix VARCHAR(20) NOT NULL,
        next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
        reset_rule ENUM('never','yearly','period') NOT NULL DEFAULT 'yearly',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_document_sequences_scope (company_id, fiscal_period_id, document_type, prefix)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_invoice_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        invoice_no VARCHAR(50) NOT NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255) NULL,
        customer_pan_vat_number VARCHAR(100) NULL,
        customer_email VARCHAR(255) NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_journal_entry_id VARCHAR(36) NULL,
        sequence_id VARCHAR(36) NULL,
        approved_by_user_id VARCHAR(36) NULL,
        approved_at TIMESTAMP NULL DEFAULT NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        voided_at TIMESTAMP NULL DEFAULT NULL,
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_invoice_headers_company_invoice_no (company_id, invoice_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_invoice_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_invoice_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none',
        discount_value DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_code_id VARCHAR(36) NULL,
        tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_invoice_lines_header_line (sales_invoice_id, line_no)
      )
      `,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers MODIFY COLUMN status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_value DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Existing transitional environments may already diverge. Keep startup resilient.
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

  async getCustomerSnapshot(conn, actorUserId, companyId, customerId) {
    const customer = await this.queryOne(
      conn,
      `SELECT id,
              COALESCE(display_name, legal_name) AS customer_name,
              pan_vat_number,
              email
         FROM customers
        WHERE id = ?
          AND company_id = ?
        LIMIT 1`,
      [customerId, companyId]
    ).catch(() => null);

    if (customer) {
      return {
        id: customer.id,
        customer_name: customer.customer_name,
        customer_pan_vat_number: customer.pan_vat_number || null,
        customer_email: customer.email || null,
      };
    }

    const legacy = await this.queryOne(
      conn,
      `SELECT c.id,
              c.client_name AS customer_name,
              COALESCE(p.gst_number, '') AS pan_vat_number,
              COALESCE(c.email, p.email, '') AS email
         FROM clients c
         LEFT JOIN profiles p ON p.id = c.linked_profile_id
        WHERE c.id = ?
          AND c.user_id = ?
        LIMIT 1`,
      [customerId, actorUserId]
    );

    if (!legacy) {
      throw new Error("Customer not found");
    }

    return {
      id: legacy.id,
      customer_name: legacy.customer_name,
      customer_pan_vat_number: legacy.pan_vat_number || null,
      customer_email: legacy.email || null,
    };
  }

  async calculateLine(conn, actorUserId, rawLine) {
    const quantity = this.qty(rawLine.quantity);
    const unitPrice = this.qty(rawLine.unit_price);
    const description = String(rawLine.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each invoice line requires description");
    if (quantity <= 0) throw new Error("Invoice line quantity must be greater than 0");
    if (unitPrice < 0) throw new Error("Invoice line unit_price must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) {
      throw new Error("discount_type must be one of none, percentage, fixed");
    }

    const lineSubtotal = this.money(quantity * unitPrice);
    let discountAmount = 0;
    if (discountType === "percentage") {
      if (discountValue < 0 || discountValue > 100) {
        throw new Error("Percentage discount_value must be between 0 and 100");
      }
      discountAmount = this.money((lineSubtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      if (discountValue < 0) throw new Error("Fixed discount_value cannot be negative");
      discountAmount = this.money(Math.min(lineSubtotal, discountValue));
    }

    const taxableBase = this.money(Math.max(lineSubtotal - discountAmount, 0));
    const taxCalc = await this.taxService.calculateLineTax(conn, actorUserId, {
      tax_code_id: rawLine.tax_code_id || null,
      tax_rate: rawLine.tax_rate,
      taxable_amount: taxableBase,
    });
    const lineTaxAmount = this.money(taxCalc.tax_amount);
    const lineTotal = this.money(taxableBase + lineTaxAmount);

    return {
      item_id: rawLine.item_id || null,
      description,
      quantity,
      unit_price: unitPrice,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      tax_code_id: taxCalc.tax_code_id,
      tax_rate: Number(taxCalc.tax_rate || 0),
      tax_type: taxCalc.tax_type,
      line_subtotal: lineSubtotal,
      line_tax_amount: lineTaxAmount,
      line_total: lineTotal,
      taxable_amount: taxableBase,
    };
  }

  deriveHeaderTotals(lines) {
    return lines.reduce(
      (acc, line) => {
        acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_subtotal);
        acc.discount_amount = this.money(acc.discount_amount + line.discount_amount);
        acc.taxable_amount = this.money(acc.taxable_amount + line.taxable_amount);
        acc.tax_amount = this.money(acc.tax_amount + line.line_tax_amount);
        acc.total_amount = this.money(acc.total_amount + line.line_total);
        return acc;
      },
      {
        subtotal_amount: 0,
        discount_amount: 0,
        taxable_amount: 0,
        tax_amount: 0,
        total_amount: 0,
      }
    );
  }

  async replaceInvoiceLines(conn, actorUserId, invoiceId, lines) {
    const normalizedLines = [];
    for (const line of lines) {
      normalizedLines.push(await this.calculateLine(conn, actorUserId, line));
    }

    if (!normalizedLines.length) {
      throw new Error("At least one invoice line is required");
    }

    await conn.execute(`DELETE FROM sales_invoice_lines WHERE sales_invoice_id = ?`, [invoiceId]);

    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      await conn.execute(
        `INSERT INTO sales_invoice_lines
          (id, sales_invoice_id, line_no, item_id, description, quantity, unit_price, discount_type,
           discount_value, discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.idFactory(),
          invoiceId,
          i + 1,
          line.item_id,
          line.description,
          line.quantity,
          line.unit_price,
          line.discount_type,
          line.discount_value,
          line.discount_amount,
          line.tax_code_id,
          line.tax_rate,
          line.line_subtotal,
          line.line_tax_amount,
          line.line_total,
        ]
      );
    }

    return {
      lines: normalizedLines,
      totals: this.deriveHeaderTotals(normalizedLines),
    };
  }

  async syncLegacyInvoice(conn, actorUserId, header, lines) {
    const items = (lines || []).map((line) => ({
      item_id: line.item_id || null,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      discount_type: line.discount_type,
      discount_value: line.discount_value,
      discount_amount: line.discount_amount,
      tax_code_id: line.tax_code_id || null,
      tax_rate: line.tax_rate,
      line_subtotal: line.line_subtotal,
      line_tax_amount: line.line_tax_amount,
      line_total: line.line_total,
    }));

    await conn.execute(
      `INSERT INTO invoices
        (id, user_id, invoice_no, client_name, total_amount, status, invoice_date, due_date, items, discount, tax_rate, tax_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         invoice_no = VALUES(invoice_no),
         client_name = VALUES(client_name),
         total_amount = VALUES(total_amount),
         status = VALUES(status),
         invoice_date = VALUES(invoice_date),
         due_date = VALUES(due_date),
         items = VALUES(items),
         discount = VALUES(discount),
         tax_rate = VALUES(tax_rate),
         tax_amount = VALUES(tax_amount)`,
      [
        header.id,
        actorUserId,
        header.invoice_no,
        header.customer_name,
        header.total_amount,
        header.status,
        header.invoice_date,
        header.due_date,
        JSON.stringify(items),
        header.discount_amount || 0,
        header.taxable_amount > 0 ? this.money((header.tax_amount / header.taxable_amount) * 100) : 0,
        header.tax_amount || 0,
      ]
    );
  }

  async getPaymentSnapshot(conn, actorUserId, invoiceId, totalAmount) {
    const row = await this.queryOne(
      conn,
      `SELECT
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM payment_allocations pa
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pa.invoice_id = ?`,
      [invoiceId]
    ).catch(() => null);

    const allocatedAmount = this.money(row?.allocated_amount || 0);
    const outstandingAmount = this.money(Number(totalAmount || 0) - allocatedAmount);
    return {
      allocated_amount: allocatedAmount,
      outstanding_amount: outstandingAmount < 0 ? 0 : outstandingAmount,
    };
  }

  deriveDisplayStatus(baseStatus, paymentSnapshot, dueDate) {
    if (baseStatus === "draft" || baseStatus === "approved" || baseStatus === "void") {
      return baseStatus;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (paymentSnapshot.outstanding_amount <= 0) return "paid";
    if (paymentSnapshot.allocated_amount > 0) return "partially_paid";
    if (dueDate && dueDate < today) return "overdue";
    return "posted";
  }

  async hydrateInvoice(conn, actorUserId, header) {
    const lines = await this.queryAll(
      conn,
      `SELECT *
         FROM sales_invoice_lines
        WHERE sales_invoice_id = ?
        ORDER BY line_no ASC`,
      [header.id]
    );

    const paymentSnapshot = await this.getPaymentSnapshot(conn, actorUserId, header.id, header.total_amount);
    return {
      ...header,
      status: this.deriveDisplayStatus(header.status, paymentSnapshot, header.due_date),
      base_status: header.status,
      payment: paymentSnapshot,
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, payload.customer_id);
      const invoiceDate = payload.invoice_date || new Date().toISOString().slice(0, 10);
      const dueDate = payload.due_date || invoiceDate;
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "sales_invoice",
        entryDate: invoiceDate,
      });
      const invoiceId = this.idFactory();

      const { totals, lines } = await this.replaceInvoiceLines(conn, actorUserId, invoiceId, payload.lines || []);

      await conn.execute(
        `INSERT INTO sales_invoice_headers
          (id, company_id, user_id, invoice_no, customer_id, customer_name, customer_pan_vat_number, customer_email,
           invoice_date, due_date, status, subtotal_amount, discount_amount, taxable_amount, tax_amount, total_amount,
           notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          customer.id,
          customer.customer_name,
          customer.customer_pan_vat_number,
          customer.customer_email,
          invoiceDate,
          dueDate,
          totals.subtotal_amount,
          totals.discount_amount,
          totals.taxable_amount,
          totals.tax_amount,
          totals.total_amount,
          payload.notes || null,
          numberInfo.sequenceId,
          actorUserId,
        ]
      );

      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?`,
        [invoiceId]
      );

      await this.syncLegacyInvoice(conn, actorUserId, header, lines);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "create",
        newValues: {
          invoice_no: header.invoice_no,
          status: header.status,
          customer_id: header.customer_id,
          total_amount: header.total_amount,
          line_count: lines.length,
        },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async updateDraft(actorUserId, invoiceId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );

      if (!existing) throw new Error("Sales invoice not found");
      if (existing.status !== "draft") {
        throw new Error("Only draft invoices can be edited");
      }

      const beforeState = await this.hydrateInvoice(conn, actorUserId, existing);

      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const customerId = payload.customer_id || existing.customer_id;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerId);
      const { totals, lines } = await this.replaceInvoiceLines(conn, actorUserId, invoiceId, payload.lines || []);

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET customer_id = ?,
                customer_name = ?,
                customer_pan_vat_number = ?,
                customer_email = ?,
                invoice_date = ?,
                due_date = ?,
                subtotal_amount = ?,
                discount_amount = ?,
                taxable_amount = ?,
                tax_amount = ?,
                total_amount = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          customer.id,
          customer.customer_name,
          customer.customer_pan_vat_number,
          customer.customer_email,
          payload.invoice_date || existing.invoice_date,
          payload.due_date || existing.due_date,
          totals.subtotal_amount,
          totals.discount_amount,
          totals.taxable_amount,
          totals.tax_amount,
          totals.total_amount,
          payload.notes !== undefined ? payload.notes : existing.notes,
          invoiceId,
        ]
      );

      const header = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      await this.syncLegacyInvoice(conn, actorUserId, header, lines);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "update",
        oldValues: beforeState,
        newValues: hydrated,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async approve(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      if (header.status !== "draft") throw new Error("Only draft invoices can be approved");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'approved',
                approved_by_user_id = ?,
                approved_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [actorUserId, invoiceId]
      );
      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const lines = await this.queryAll(conn, `SELECT * FROM sales_invoice_lines WHERE sales_invoice_id = ? ORDER BY line_no ASC`, [invoiceId]);
      await this.syncLegacyInvoice(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "approve",
        oldValues: { status: header.status },
        newValues: { status: updated.status, approved_at: updated.approved_at },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async post(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      if (!["approved", "draft"].includes(header.status)) {
        throw new Error("Only draft or approved invoices can be posted");
      }
      if (header.posted_journal_entry_id) {
        throw new Error("Invoice has already been posted");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT *
           FROM sales_invoice_lines
          WHERE sales_invoice_id = ?
          ORDER BY line_no ASC`,
        [invoiceId]
      );
      if (!lines.length) throw new Error("Invoice requires at least one line before posting");
      await this.accountingControlService.validatePostingDate(conn, header.company_id || await this.resolveCompanyId(conn, actorUserId), header.invoice_date);

      const revenueAmount = this.money(header.taxable_amount);
      const totalAmount = this.money(header.total_amount);
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      const outputTaxPostings = await this.taxService.buildOutputTaxPostings(conn, actorUserId, lines);

      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "sales_invoice",
        sourceId: invoiceId,
        entryDate: header.invoice_date,
        memo: `Post sales invoice ${header.invoice_no}`,
        createdByUserId: actorUserId,
        requestMeta,
        lines: [
          {
            accountCode: "1100-AR",
            debit: totalAmount,
            credit: 0,
            customerId: header.customer_id || null,
            description: `Accounts receivable for ${header.invoice_no}`,
          },
          {
            accountCode: "4100-SALES",
            debit: 0,
            credit: revenueAmount,
            customerId: header.customer_id || null,
            description: `Sales revenue for ${header.invoice_no}`,
          },
          ...outputTaxPostings.map((posting) => ({
            accountId: posting.accountId || null,
            accountCode: posting.accountCode,
            debit: 0,
            credit: posting.amount,
            customerId: header.customer_id || null,
            description: `VAT payable for ${header.invoice_no}`,
          })),
        ],
      });

      const postedJournal = await this.journalService.postJournalEntry({
        companyId,
        journalEntryId: journalEntry.id,
        actorUserId,
        requestMeta,
      });

      let inventoryHook = null;
      if (this.inventoryLedgerService && lines.some((line) => line.item_id)) {
        try {
          inventoryHook = await this.inventoryLedgerService.applySaleIssue({
            companyId: actorUserId,
            invoiceId,
            lines: lines.map((line) => ({
              item_id: line.item_id,
              quantity: line.quantity,
              product_name: line.description,
            })),
            createdByUserId: actorUserId,
            newId: this.idFactory,
          });
        } catch (error) {
          inventoryHook = {
            applied: false,
            message: error.message,
          };
        }
      }

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'posted',
                posted_journal_entry_id = ?,
                posted_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [postedJournal.id, invoiceId]
      );

      await this.taxService.recordTaxTransactionsForSalesInvoice(conn, actorUserId, {
        companyId,
        header,
        lines,
        postedJournalEntryId: postedJournal.id,
      });

      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      await this.syncLegacyInvoice(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "post",
        oldValues: { status: header.status, posted_journal_entry_id: header.posted_journal_entry_id },
        newValues: { status: updated.status, posted_journal_entry_id: updated.posted_journal_entry_id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return {
        ...hydrated,
        inventory_hook: inventoryHook,
      };
    });
  }

  async void(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      if (header.posted_journal_entry_id) {
        throw new Error("Posted invoices cannot be voided directly; use reversal/credit note");
      }
      if (header.status === "void") {
        return this.hydrateInvoice(conn, actorUserId, header);
      }

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'void',
                voided_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [invoiceId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const lines = await this.queryAll(conn, `SELECT * FROM sales_invoice_lines WHERE sales_invoice_id = ? ORDER BY line_no ASC`, [invoiceId]);
      await this.syncLegacyInvoice(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "void",
        oldValues: { status: header.status },
        newValues: { status: updated.status, voided_at: updated.voided_at },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [actorUserId]
      );

      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateInvoice(conn, actorUserId, row));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, invoiceId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?`,
        [invoiceId, actorUserId]
      );
      if (!row) return null;
      return this.hydrateInvoice(conn, actorUserId, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SalesInvoiceService,
};
