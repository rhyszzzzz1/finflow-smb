"use strict";

const crypto = require("crypto");

class PurchaseBillService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("PurchaseBillService requires a mysql2/promise pool");
    }
    if (!options.journalService) {
      throw new Error("PurchaseBillService requires a journalService");
    }
    if (!options.taxService) {
      throw new Error("PurchaseBillService requires a taxService");
    }
    if (!options.accountingControlService) {
      throw new Error("PurchaseBillService requires an accountingControlService");
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
      CREATE TABLE IF NOT EXISTS purchase_bill_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        bill_no VARCHAR(50) NOT NULL,
        vendor_id VARCHAR(36) NULL,
        vendor_name VARCHAR(255) NULL,
        vendor_pan_vat_number VARCHAR(100) NULL,
        vendor_email VARCHAR(255) NULL,
        bill_date DATE NOT NULL,
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
        UNIQUE KEY uq_purchase_bill_headers_company_bill_no (company_id, bill_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS purchase_bill_lines (
        id VARCHAR(36) PRIMARY KEY,
        purchase_bill_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none',
        discount_value DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_code_id VARCHAR(36) NULL,
        tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        expense_account_id VARCHAR(36) NULL,
        inventory_account_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_bill_lines_header_line (purchase_bill_id, line_no)
      )
      `,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers MODIFY COLUMN status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS discount_value DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS expense_account_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS inventory_account_id VARCHAR(36) NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // mixed environments may already diverge
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

  async getVendorSnapshot(conn, actorUserId, companyId, vendorId) {
    const vendor = await this.queryOne(
      conn,
      `SELECT id,
              COALESCE(display_name, legal_name) AS vendor_name,
              pan_vat_number,
              email
         FROM vendors
        WHERE id = ?
          AND company_id = ?
        LIMIT 1`,
      [vendorId, companyId]
    ).catch(() => null);

    if (vendor) {
      return {
        id: vendor.id,
        vendor_name: vendor.vendor_name,
        vendor_pan_vat_number: vendor.pan_vat_number || null,
        vendor_email: vendor.email || null,
      };
    }

    const legacy = await this.queryOne(
      conn,
      `SELECT v.id,
              v.vendor_name,
              COALESCE(p.gst_number, '') AS pan_vat_number,
              COALESCE(v.email, p.email, '') AS email
         FROM vendors v
         LEFT JOIN profiles p ON p.id = v.linked_profile_id
        WHERE v.id = ?
          AND v.user_id = ?
        LIMIT 1`,
      [vendorId, actorUserId]
    );

    if (!legacy) {
      throw new Error("Vendor not found");
    }

    return {
      id: legacy.id,
      vendor_name: legacy.vendor_name,
      vendor_pan_vat_number: legacy.pan_vat_number || null,
      vendor_email: legacy.email || null,
    };
  }

  async calculateLine(conn, actorUserId, rawLine) {
    const quantity = this.qty(rawLine.quantity);
    const unitCost = this.qty(rawLine.unit_cost);
    const description = String(rawLine.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each bill line requires description");
    if (quantity <= 0) throw new Error("Bill line quantity must be greater than 0");
    if (unitCost < 0) throw new Error("Bill line unit_cost must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) {
      throw new Error("discount_type must be one of none, percentage, fixed");
    }

    const hasInventoryTarget = !!(rawLine.item_id || rawLine.inventory_account_id);
    const hasExpenseTarget = !!rawLine.expense_account_id;
    if (!hasInventoryTarget && !hasExpenseTarget) {
      throw new Error("Each purchase bill line must target inventory or an expense account");
    }
    if (hasInventoryTarget && hasExpenseTarget) {
      throw new Error("A purchase bill line cannot be both inventory and expense");
    }

    const lineSubtotal = this.money(quantity * unitCost);
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
      unit_cost: unitCost,
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
      expense_account_id: rawLine.expense_account_id || null,
      inventory_account_id: rawLine.inventory_account_id || null,
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

  async replaceBillLines(conn, actorUserId, billId, lines) {
    const normalizedLines = [];
    for (const line of lines) {
      normalizedLines.push(await this.calculateLine(conn, actorUserId, line));
    }

    if (!normalizedLines.length) {
      throw new Error("At least one purchase bill line is required");
    }

    await conn.execute(`DELETE FROM purchase_bill_lines WHERE purchase_bill_id = ?`, [billId]);

    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      await conn.execute(
        `INSERT INTO purchase_bill_lines
          (id, purchase_bill_id, line_no, item_id, description, quantity, unit_cost, discount_type,
           discount_value, discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total,
           expense_account_id, inventory_account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.idFactory(),
          billId,
          i + 1,
          line.item_id,
          line.description,
          line.quantity,
          line.unit_cost,
          line.discount_type,
          line.discount_value,
          line.discount_amount,
          line.tax_code_id,
          line.tax_rate,
          line.line_subtotal,
          line.line_tax_amount,
          line.line_total,
          line.expense_account_id,
          line.inventory_account_id,
        ]
      );
    }

    return {
      lines: normalizedLines,
      totals: this.deriveHeaderTotals(normalizedLines),
    };
  }

  async syncLegacyPurchase(conn, actorUserId, header, lines) {
    const firstLine = lines[0] || {};
    await conn.execute(
      `INSERT INTO purchases
        (id, user_id, purchase_id, vendor_name, product_name, quantity, total_amount, due_date, status, purchase_date, payment_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         purchase_id = VALUES(purchase_id),
         vendor_name = VALUES(vendor_name),
         product_name = VALUES(product_name),
         quantity = VALUES(quantity),
         total_amount = VALUES(total_amount),
         due_date = VALUES(due_date),
         status = VALUES(status),
         purchase_date = VALUES(purchase_date),
         payment_type = VALUES(payment_type)`,
      [
        header.id,
        actorUserId,
        header.bill_no,
        header.vendor_name,
        firstLine.description || header.vendor_name,
        lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
        header.total_amount,
        header.due_date,
        header.status === "void" ? "cancelled" : header.status,
        header.bill_date,
        "credit",
      ]
    );
  }

  async getPaymentSnapshot(conn, billId, totalAmount) {
    const row = await this.queryOne(
      conn,
      `SELECT
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM payment_allocations pa
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pa.purchase_id = ?`,
      [billId]
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

  async hydrateBill(conn, header) {
    const lines = await this.queryAll(
      conn,
      `SELECT *
         FROM purchase_bill_lines
        WHERE purchase_bill_id = ?
        ORDER BY line_no ASC`,
      [header.id]
    );

    const paymentSnapshot = await this.getPaymentSnapshot(conn, header.id, header.total_amount);
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
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, payload.vendor_id);
      const billDate = payload.bill_date || new Date().toISOString().slice(0, 10);
      const dueDate = payload.due_date || billDate;
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "purchase_bill",
        entryDate: billDate,
      });
      const billId = this.idFactory();

      await conn.execute(`DELETE FROM purchase_bill_lines WHERE purchase_bill_id = ?`, [billId]);
      const { totals, lines } = await this.replaceBillLines(conn, actorUserId, billId, payload.lines || []);

      await conn.execute(
        `INSERT INTO purchase_bill_headers
          (id, company_id, user_id, bill_no, vendor_id, vendor_name, vendor_pan_vat_number, vendor_email,
           bill_date, due_date, status, subtotal_amount, discount_amount, taxable_amount, tax_amount, total_amount,
           notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          billDate,
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

      const header = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      await this.syncLegacyPurchase(conn, actorUserId, header, lines);
      const hydrated = await this.hydrateBill(conn, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
        actionType: "create",
        newValues: {
          bill_no: header.bill_no,
          status: header.status,
          vendor_id: header.vendor_id,
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

  async updateDraft(actorUserId, billId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_bill_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [billId, actorUserId]
      );
      if (!existing) throw new Error("Purchase bill not found");
      if (existing.status !== "draft") throw new Error("Only draft bills can be edited");
      const beforeState = await this.hydrateBill(conn, existing);

      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const vendorId = payload.vendor_id || existing.vendor_id;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorId);
      const { totals, lines } = await this.replaceBillLines(conn, actorUserId, billId, payload.lines || []);

      await conn.execute(
        `UPDATE purchase_bill_headers
            SET vendor_id = ?,
                vendor_name = ?,
                vendor_pan_vat_number = ?,
                vendor_email = ?,
                bill_date = ?,
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
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          payload.bill_date || existing.bill_date,
          payload.due_date || existing.due_date,
          totals.subtotal_amount,
          totals.discount_amount,
          totals.taxable_amount,
          totals.tax_amount,
          totals.total_amount,
          payload.notes !== undefined ? payload.notes : existing.notes,
          billId,
        ]
      );

      const header = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      await this.syncLegacyPurchase(conn, actorUserId, header, lines);
      const hydrated = await this.hydrateBill(conn, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
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

  async approve(actorUserId, billId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_bill_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [billId, actorUserId]
      );
      if (!header) throw new Error("Purchase bill not found");
      if (header.status !== "draft") throw new Error("Only draft bills can be approved");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      await conn.execute(
        `UPDATE purchase_bill_headers
            SET status = 'approved',
                approved_by_user_id = ?,
                approved_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [actorUserId, billId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      const lines = await this.queryAll(conn, `SELECT * FROM purchase_bill_lines WHERE purchase_bill_id = ? ORDER BY line_no ASC`, [billId]);
      await this.syncLegacyPurchase(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateBill(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
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

  async post(actorUserId, billId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_bill_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [billId, actorUserId]
      );
      if (!header) throw new Error("Purchase bill not found");
      if (!["approved", "draft"].includes(header.status)) {
        throw new Error("Only draft or approved bills can be posted");
      }
      if (header.posted_journal_entry_id) {
        throw new Error("Bill has already been posted");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT *
           FROM purchase_bill_lines
          WHERE purchase_bill_id = ?
          ORDER BY line_no ASC`,
        [billId]
      );
      if (!lines.length) throw new Error("Bill requires at least one line before posting");
      await this.accountingControlService.validatePostingDate(conn, header.company_id || await this.resolveCompanyId(conn, actorUserId), header.bill_date);

      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      const totalAmount = this.money(header.total_amount);
      const journalLines = [];
      for (const line of lines) {
        const taxableAmount = this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0));
        if (taxableAmount > 0) {
          journalLines.push({
            accountId: line.inventory_account_id || line.expense_account_id || null,
            accountCode: !line.inventory_account_id && !line.expense_account_id
              ? (line.item_id ? "1200-INVENTORY" : "5100-PURCHASES")
              : undefined,
            debit: taxableAmount,
            credit: 0,
            vendorId: header.vendor_id || null,
            itemId: line.item_id || null,
            description: `Purchase line for ${header.bill_no}`,
          });
        }

      }

      const inputTaxPostings = await this.taxService.buildInputTaxPostings(conn, actorUserId, lines);
      for (const posting of inputTaxPostings) {
        journalLines.push({
          accountId: posting.accountId || null,
          accountCode: posting.accountCode,
          debit: posting.amount,
          credit: 0,
          vendorId: header.vendor_id || null,
          description: `Input VAT for ${header.bill_no}`,
        });
      }

      journalLines.push({
        accountCode: "2100-AP",
        debit: 0,
        credit: totalAmount,
        vendorId: header.vendor_id || null,
        description: `Accounts payable for ${header.bill_no}`,
      });

      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "purchase_bill",
        sourceId: billId,
        entryDate: header.bill_date,
        memo: `Post purchase bill ${header.bill_no}`,
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

      const inventoryHookResults = [];
      if (this.inventoryLedgerService) {
        for (const line of lines.filter((line) => line.item_id || line.inventory_account_id)) {
          try {
            const result = await this.inventoryLedgerService.applyPurchaseReceipt({
              companyId: actorUserId,
              productName: line.description,
              sku: null,
              quantity: line.quantity,
              totalAmount: this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0)),
              purchaseId: billId,
              createdByUserId: actorUserId,
              newId: this.idFactory,
            });
            inventoryHookResults.push(result);
          } catch (error) {
            inventoryHookResults.push({ applied: false, message: error.message, line_no: line.line_no });
          }
        }
      }

      await conn.execute(
        `UPDATE purchase_bill_headers
            SET status = 'posted',
                posted_journal_entry_id = ?,
                posted_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [postedJournal.id, billId]
      );

      await this.taxService.recordTaxTransactionsForPurchaseBill(conn, actorUserId, {
        companyId,
        header,
        lines,
        postedJournalEntryId: postedJournal.id,
      });

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      await this.syncLegacyPurchase(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateBill(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
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
        inventory_hooks: inventoryHookResults,
      };
    });
  }

  async void(actorUserId, billId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_bill_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [billId, actorUserId]
      );
      if (!header) throw new Error("Purchase bill not found");
      if (header.posted_journal_entry_id) {
        throw new Error("Posted bills cannot be voided directly; use reversal/debit note");
      }
      if (header.status === "void") return this.hydrateBill(conn, header);

      await conn.execute(
        `UPDATE purchase_bill_headers
            SET status = 'void',
                voided_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [billId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      const lines = await this.queryAll(conn, `SELECT * FROM purchase_bill_lines WHERE purchase_bill_id = ? ORDER BY line_no ASC`, [billId]);
      await this.syncLegacyPurchase(conn, actorUserId, updated, lines);
      const hydrated = await this.hydrateBill(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "purchase_bill",
        entityId: billId,
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
           FROM purchase_bill_headers
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [actorUserId]
      );
      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateBill(conn, row));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, billId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_bill_headers
          WHERE id = ?
            AND user_id = ?`,
        [billId, actorUserId]
      );
      if (!row) return null;
      return this.hydrateBill(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  PurchaseBillService,
};
