"use strict";

const crypto = require("crypto");
const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

class SalesCreditNoteService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("SalesCreditNoteService requires a mysql2/promise pool");
    if (!options.journalService) throw new Error("SalesCreditNoteService requires a journalService");
    if (!options.taxService) throw new Error("SalesCreditNoteService requires a taxService");
    if (!options.accountingControlService) throw new Error("SalesCreditNoteService requires an accountingControlService");
    if (!options.counterpartyService) throw new Error("SalesCreditNoteService requires a counterpartyService");
    this.pool = pool;
    this.journalService = options.journalService;
    this.taxService = options.taxService;
    this.accountingControlService = options.accountingControlService;
    this.counterpartyService = options.counterpartyService;
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
      try { await conn.rollback(); } catch (_rollbackError) {}
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

  money(value) { return Number(Number(value || 0).toFixed(2)); }
  qty(value) { return Number(Number(value || 0).toFixed(4)); }

  async writeAudit(conn, payload) {
    if (!this.auditService) return;
    await this.auditService.logAction(payload, conn);
  }

  async ensureSchema() {
    const statements = [
      `CREATE TABLE IF NOT EXISTS sales_credit_note_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        credit_note_number VARCHAR(50) NOT NULL,
        related_sales_invoice_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255) NULL,
        customer_legal_name VARCHAR(255) NULL,
        customer_pan_vat_number VARCHAR(100) NULL,
        customer_email VARCHAR(255) NULL,
        customer_phone VARCHAR(50) NULL,
        customer_address TEXT NULL,
        credit_note_date DATE NOT NULL,
        status ENUM('draft','approved','posted','void') NOT NULL DEFAULT 'draft',
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
        reason TEXT NULL,
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_credit_note_headers_company_credit_note_no (company_id, credit_note_number)
      )`,
      `CREATE TABLE IF NOT EXISTS sales_credit_note_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_credit_note_id VARCHAR(36) NOT NULL,
        related_sales_invoice_line_id VARCHAR(36) NULL,
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
        return_to_stock TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_credit_note_lines_header_line (sales_credit_note_id, line_no)
      )`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS related_sales_invoice_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS customer_address TEXT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS reason TEXT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS notes TEXT NULL`,
      `ALTER TABLE sales_credit_note_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_headers MODIFY COLUMN status ENUM('draft','approved','posted','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS related_sales_invoice_line_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS discount_value DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_credit_note_lines ADD COLUMN IF NOT EXISTS return_to_stock TINYINT(1) NOT NULL DEFAULT 0`,
    ];
    for (const sql of statements) {
      try { await this.pool.execute(sql); } catch (_error) {}
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getCustomerSnapshot(conn, actorUserId, companyId, customerId, input = {}) {
    const snapshot = await this.counterpartyService.resolveCustomerSnapshot(conn, actorUserId, companyId, customerId, { ...input, customer_id: customerId });
    return {
      id: snapshot.id,
      counterparty_id: snapshot.id,
      customer_name: snapshot.display_name,
      customer_legal_name: snapshot.legal_name,
      customer_pan_vat_number: snapshot.pan_vat_number,
      customer_email: snapshot.email,
      customer_phone: snapshot.phone,
      customer_address: snapshot.address,
    };
  }

  async fetchOriginalInvoice(conn, actorUserId, relatedInvoiceId) {
    if (!relatedInvoiceId) return null;
    const invoice = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? LIMIT 1`, [relatedInvoiceId, actorUserId]);
    if (!invoice) throw new Error("Related sales invoice not found");
    return invoice;
  }

  async fetchOriginalInvoiceLine(conn, relatedInvoiceId, relatedInvoiceLineId) {
    if (!relatedInvoiceLineId) return null;
    const line = await this.queryOne(conn, `SELECT * FROM sales_invoice_lines WHERE id = ? AND sales_invoice_id = ? LIMIT 1`, [relatedInvoiceLineId, relatedInvoiceId]);
    if (!line) throw new Error("Related sales invoice line not found");
    return line;
  }

  async calculateLine(conn, actorUserId, rawLine, relatedInvoiceId = null) {
    const quantity = this.qty(rawLine.quantity);
    const unitPrice = this.qty(rawLine.unit_price);
    const description = String(rawLine.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each credit note line requires description");
    if (quantity <= 0) throw new Error("Credit note line quantity must be greater than 0");
    if (unitPrice < 0) throw new Error("Credit note line unit_price must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) throw new Error("discount_type must be one of none, percentage, fixed");
    const originalLine = await this.fetchOriginalInvoiceLine(conn, relatedInvoiceId, rawLine.related_sales_invoice_line_id || null);
    if (originalLine?.item_id && rawLine.item_id && String(originalLine.item_id) !== String(rawLine.item_id)) throw new Error("Credit note item must match the original sales invoice line item");
    const lineSubtotal = this.money(quantity * unitPrice);
    let discountAmount = 0;
    if (discountType === "percentage") {
      if (discountValue < 0 || discountValue > 100) throw new Error("Percentage discount_value must be between 0 and 100");
      discountAmount = this.money((lineSubtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      if (discountValue < 0) throw new Error("Fixed discount_value cannot be negative");
      discountAmount = this.money(Math.min(lineSubtotal, discountValue));
    }
    const taxableBase = this.money(Math.max(lineSubtotal - discountAmount, 0));
    const taxCalc = await this.taxService.calculateLineTax(conn, actorUserId, {
      tax_code_id: rawLine.tax_code_id || originalLine?.tax_code_id || null,
      tax_rate: rawLine.tax_rate !== undefined ? rawLine.tax_rate : originalLine?.tax_rate,
      taxable_amount: taxableBase,
    });
    return {
      related_sales_invoice_line_id: rawLine.related_sales_invoice_line_id || null,
      item_id: rawLine.item_id || originalLine?.item_id || null,
      description,
      quantity,
      unit_price: unitPrice,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      tax_code_id: taxCalc.tax_code_id,
      tax_rate: Number(taxCalc.tax_rate || 0),
      line_subtotal: lineSubtotal,
      line_tax_amount: this.money(taxCalc.tax_amount),
      line_total: this.money(taxableBase + Number(taxCalc.tax_amount || 0)),
      taxable_amount: taxableBase,
      return_to_stock: rawLine.return_to_stock ? 1 : 0,
    };
  }

  deriveHeaderTotals(lines) {
    return lines.reduce((acc, line) => {
      acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_subtotal);
      acc.discount_amount = this.money(acc.discount_amount + line.discount_amount);
      acc.taxable_amount = this.money(acc.taxable_amount + line.taxable_amount);
      acc.tax_amount = this.money(acc.tax_amount + line.line_tax_amount);
      acc.total_amount = this.money(acc.total_amount + line.line_total);
      return acc;
    }, { subtotal_amount: 0, discount_amount: 0, taxable_amount: 0, tax_amount: 0, total_amount: 0 });
  }

  async normalizeCreditNoteLines(conn, actorUserId, creditNoteId, relatedInvoiceId, lines) {
    const normalizedLines = [];
    for (const line of lines) normalizedLines.push(await this.calculateLine(conn, actorUserId, line, relatedInvoiceId));
    if (!normalizedLines.length) throw new Error("At least one credit note line is required");
    return { lines: normalizedLines, totals: this.deriveHeaderTotals(normalizedLines) };
  }

  async persistCreditNoteLines(conn, creditNoteId, normalizedLines) {
    await conn.execute(`DELETE FROM sales_credit_note_lines WHERE sales_credit_note_id = ?`, [creditNoteId]);
    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      await conn.execute(
        `INSERT INTO sales_credit_note_lines
          (id, sales_credit_note_id, related_sales_invoice_line_id, line_no, item_id, description, quantity, unit_price,
           discount_type, discount_value, discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total, return_to_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [this.idFactory(), creditNoteId, line.related_sales_invoice_line_id, i + 1, line.item_id, line.description, line.quantity, line.unit_price, line.discount_type, line.discount_value, line.discount_amount, line.tax_code_id, line.tax_rate, line.line_subtotal, line.line_tax_amount, line.line_total, line.return_to_stock]
      );
    }
  }

  async replaceLines(conn, actorUserId, creditNoteId, relatedInvoiceId, lines) {
    const { lines: normalizedLines, totals } = await this.normalizeCreditNoteLines(conn, actorUserId, creditNoteId, relatedInvoiceId, lines);
    await this.persistCreditNoteLines(conn, creditNoteId, normalizedLines);
    return { lines: normalizedLines, totals };
  }

  async resolveOriginalIssueCost(conn, companyId, relatedInvoiceId, itemId, quantity) {
    if (!this.inventoryLedgerService || !itemId) return 0;
    const row = await this.queryOne(
      conn,
      `SELECT ABS(COALESCE(SUM(quantity_delta), 0)) AS issued_quantity, ABS(COALESCE(SUM(total_cost), 0)) AS issued_cost
         FROM stock_movements
        WHERE company_id = ? AND reference_type = 'sales_invoice' AND reference_id = ? AND item_id = ?`,
      [companyId, relatedInvoiceId, itemId]
    ).catch(() => null);
    const issuedQuantity = Number(row?.issued_quantity || 0);
    const issuedCost = Number(row?.issued_cost || 0);
    if (issuedQuantity > 0) return this.money((issuedCost / issuedQuantity) * Number(quantity || 0));
    const unitCost = await this.inventoryLedgerService.getIssueUnitCost(companyId, itemId, null, "weighted_average", conn);
    return this.money(Number(unitCost || 0) * Number(quantity || 0));
  }

  async buildInventoryReturnPosting(conn, companyId, header, lines) {
    if (!this.inventoryLedgerService) return { journalLines: [], inventoryPlan: [] };
    const returnLines = lines.filter((line) => line.item_id && Number(line.return_to_stock || 0) === 1);
    if (!returnLines.length) return { journalLines: [], inventoryPlan: [] };
    const inventoryPlan = [];
    let totalReturnCost = 0;
    for (const line of returnLines) {
      const totalCost = await this.resolveOriginalIssueCost(conn, companyId, header.related_sales_invoice_id, line.item_id, line.quantity);
      if (!Number.isFinite(totalCost) || totalCost < 0) throw new Error(`Unable to resolve inventory return cost for credit note ${header.credit_note_number}`);
      const unitCost = Number(line.quantity || 0) > 0 ? this.money(totalCost / Number(line.quantity)) : 0;
      inventoryPlan.push({ item_id: line.item_id, quantity: this.qty(line.quantity), unit_cost: unitCost, total_cost: totalCost, line_no: line.line_no });
      totalReturnCost = this.money(totalReturnCost + totalCost);
    }
    if (totalReturnCost === 0) return { journalLines: [], inventoryPlan };
    return {
      inventoryPlan,
      journalLines: [
        { accountCode: DEFAULT_ACCOUNT_CODES.inventory, debit: totalReturnCost, credit: 0, description: `Inventory return for ${header.credit_note_number}` },
        { accountCode: DEFAULT_ACCOUNT_CODES.costOfGoodsSold, debit: 0, credit: totalReturnCost, description: `COGS reversal for ${header.credit_note_number}` },
      ],
    };
  }

  async hydrateCreditNote(conn, header) {
    const lines = await this.queryAll(conn, `SELECT * FROM sales_credit_note_lines WHERE sales_credit_note_id = ? ORDER BY line_no ASC`, [header.id]);
    return { ...header, base_status: header.status, lines };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const originalInvoice = await this.fetchOriginalInvoice(conn, actorUserId, payload.related_sales_invoice_id || null);
      const customerRef = payload.counterparty_id || payload.customer_id || payload.client_id || originalInvoice?.counterparty_id || originalInvoice?.customer_id || null;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerRef, { ...payload, customer_name: payload.customer_name || originalInvoice?.customer_name || null });
      const creditNoteDate = payload.credit_note_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, { companyId, documentType: "sales_credit_note", entryDate: creditNoteDate });
      const creditNoteId = this.idFactory();
      const { totals, lines } = await this.normalizeCreditNoteLines(conn, actorUserId, creditNoteId, originalInvoice?.id || null, payload.lines || []);
      await conn.execute(
        `INSERT INTO sales_credit_note_headers
          (id, company_id, user_id, credit_note_number, related_sales_invoice_id, business_relationship_id, counterparty_id, customer_id, customer_name,
           customer_legal_name, customer_pan_vat_number, customer_email, customer_phone, customer_address, credit_note_date, status, subtotal_amount,
           discount_amount, taxable_amount, tax_amount, total_amount, reason, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [creditNoteId, companyId, actorUserId, numberInfo.documentNumber, originalInvoice?.id || payload.related_sales_invoice_id || null, payload.business_relationship_id || originalInvoice?.business_relationship_id || null, customer.counterparty_id, customer.id, customer.customer_name, customer.customer_legal_name, customer.customer_pan_vat_number, customer.customer_email, customer.customer_phone, customer.customer_address, creditNoteDate, totals.subtotal_amount, totals.discount_amount, totals.taxable_amount, totals.tax_amount, totals.total_amount, payload.reason || null, payload.notes || null, numberInfo.sequenceId, actorUserId]
      );
      await this.persistCreditNoteLines(conn, creditNoteId, lines);
      const header = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ?`, [creditNoteId]);
      const hydrated = await this.hydrateCreditNote(conn, header);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "sales_credit_note", entityId: creditNoteId, actionType: "create", newValues: { credit_note_number: header.credit_note_number, related_sales_invoice_id: header.related_sales_invoice_id, counterparty_id: header.counterparty_id, total_amount: header.total_amount, line_count: lines.length }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async updateDraft(actorUserId, creditNoteId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [creditNoteId, actorUserId]);
      if (!existing) throw new Error("Sales credit note not found");
      if (existing.status !== "draft") throw new Error("Only draft credit notes can be edited");
      const beforeState = await this.hydrateCreditNote(conn, existing);
      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const originalInvoice = await this.fetchOriginalInvoice(conn, actorUserId, payload.related_sales_invoice_id !== undefined ? payload.related_sales_invoice_id : existing.related_sales_invoice_id);
      const customerRef = payload.counterparty_id || payload.customer_id || payload.client_id || existing.counterparty_id || existing.customer_id;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerRef, { ...payload, customer_name: payload.customer_name || existing.customer_name });
      const { totals } = await this.replaceLines(conn, actorUserId, creditNoteId, originalInvoice?.id || null, payload.lines || []);
      await conn.execute(
        `UPDATE sales_credit_note_headers
            SET related_sales_invoice_id = ?, business_relationship_id = ?, counterparty_id = ?, customer_id = ?, customer_name = ?, customer_legal_name = ?,
                customer_pan_vat_number = ?, customer_email = ?, customer_phone = ?, customer_address = ?, credit_note_date = ?, subtotal_amount = ?,
                discount_amount = ?, taxable_amount = ?, tax_amount = ?, total_amount = ?, reason = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [originalInvoice?.id || existing.related_sales_invoice_id, payload.business_relationship_id !== undefined ? payload.business_relationship_id : existing.business_relationship_id, customer.counterparty_id, customer.id, customer.customer_name, customer.customer_legal_name, customer.customer_pan_vat_number, customer.customer_email, customer.customer_phone, customer.customer_address, payload.credit_note_date || existing.credit_note_date, totals.subtotal_amount, totals.discount_amount, totals.taxable_amount, totals.tax_amount, totals.total_amount, payload.reason !== undefined ? payload.reason : existing.reason, payload.notes !== undefined ? payload.notes : existing.notes, creditNoteId]
      );
      const updated = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ?`, [creditNoteId]);
      const hydrated = await this.hydrateCreditNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "sales_credit_note", entityId: creditNoteId, actionType: "update", oldValues: beforeState, newValues: hydrated, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async approve(actorUserId, creditNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [creditNoteId, actorUserId]);
      if (!header) throw new Error("Sales credit note not found");
      if (header.status !== "draft") throw new Error("Only draft credit notes can be approved");
      await conn.execute(`UPDATE sales_credit_note_headers SET status = 'approved', approved_by_user_id = ?, approved_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [actorUserId, creditNoteId]);
      const updated = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ?`, [creditNoteId]);
      const hydrated = await this.hydrateCreditNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId), entityType: "sales_credit_note", entityId: creditNoteId, actionType: "approve", oldValues: { status: header.status }, newValues: { status: updated.status, approved_at: updated.approved_at }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async post(actorUserId, creditNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [creditNoteId, actorUserId]);
      if (!header) throw new Error("Sales credit note not found");
      if (!["draft", "approved"].includes(header.status)) throw new Error("Only draft or approved credit notes can be posted");
      if (header.posted_journal_entry_id) throw new Error("Credit note has already been posted");
      const lines = await this.queryAll(conn, `SELECT * FROM sales_credit_note_lines WHERE sales_credit_note_id = ? ORDER BY line_no ASC`, [creditNoteId]);
      if (!lines.length) throw new Error("Credit note requires at least one line before posting");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      await this.accountingControlService.validatePostingDate(conn, companyId, header.credit_note_date);
      const outputTaxPostings = await this.taxService.buildOutputTaxPostings(conn, actorUserId, lines);
      const { journalLines: inventoryJournalLines, inventoryPlan } = await this.buildInventoryReturnPosting(conn, companyId, header, lines);
      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "sales_credit_note",
        sourceId: creditNoteId,
        entryDate: header.credit_note_date,
        memo: `Post sales credit note ${header.credit_note_number}`,
        createdByUserId: actorUserId,
        requestMeta,
        conn,
        lines: [
          { accountCode: DEFAULT_ACCOUNT_CODES.salesRevenue, debit: this.money(header.taxable_amount), credit: 0, customerId: header.counterparty_id || header.customer_id || null, description: `Revenue reversal for ${header.credit_note_number}` },
          ...outputTaxPostings.map((posting) => ({ accountId: posting.accountId || null, accountCode: posting.accountCode, debit: posting.amount, credit: 0, customerId: header.counterparty_id || header.customer_id || null, description: `Output tax reversal for ${header.credit_note_number}` })),
          { accountCode: DEFAULT_ACCOUNT_CODES.accountsReceivable, debit: 0, credit: this.money(header.total_amount), customerId: header.counterparty_id || header.customer_id || null, description: `Accounts receivable reversal for ${header.credit_note_number}` },
          ...inventoryJournalLines,
        ],
      });
      const inventoryHooks = [];
      if (this.inventoryLedgerService) {
        for (const movement of inventoryPlan.filter((entry) => entry.item_id && entry.quantity > 0)) {
          const applied = await this.inventoryLedgerService.applySalesReturn({ companyId, itemId: movement.item_id, quantity: movement.quantity, referenceId: creditNoteId, createdByUserId: actorUserId, newId: this.idFactory, unitCost: movement.unit_cost, conn });
          inventoryHooks.push({ ...applied, item_id: movement.item_id, line_no: movement.line_no });
        }
      }
      const postedJournal = await this.journalService.postJournalEntry({ companyId, journalEntryId: journalEntry.id, actorUserId, requestMeta, conn });
      await conn.execute(`UPDATE sales_credit_note_headers SET status = 'posted', posted_journal_entry_id = ?, posted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [postedJournal.id, creditNoteId]);
      await this.taxService.recordTaxTransactionsForSalesCreditNote(conn, actorUserId, { companyId, header, lines, postedJournalEntryId: postedJournal.id });
      const updated = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ?`, [creditNoteId]);
      const hydrated = await this.hydrateCreditNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "sales_credit_note", entityId: creditNoteId, actionType: "post", oldValues: { status: header.status, posted_journal_entry_id: header.posted_journal_entry_id }, newValues: { status: updated.status, posted_journal_entry_id: updated.posted_journal_entry_id }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return { ...hydrated, inventory_hooks: inventoryHooks };
    });
  }

  async void(actorUserId, creditNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [creditNoteId, actorUserId]);
      if (!header) throw new Error("Sales credit note not found");
      if (header.posted_journal_entry_id) throw new Error("Posted credit notes cannot be voided directly; use reversal");
      if (header.status === "void") return this.hydrateCreditNote(conn, header);
      await conn.execute(`UPDATE sales_credit_note_headers SET status = 'void', voided_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [creditNoteId]);
      const updated = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ?`, [creditNoteId]);
      const hydrated = await this.hydrateCreditNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId), entityType: "sales_credit_note", entityId: creditNoteId, actionType: "void", oldValues: { status: header.status }, newValues: { status: updated.status, voided_at: updated.voided_at }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(conn, `SELECT * FROM sales_credit_note_headers WHERE user_id = ? ORDER BY created_at DESC`, [actorUserId]);
      const hydrated = [];
      for (const row of rows) hydrated.push(await this.hydrateCreditNote(conn, row));
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, creditNoteId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(conn, `SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ?`, [creditNoteId, actorUserId]);
      if (!row) return null;
      return this.hydrateCreditNote(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SalesCreditNoteService,
};
