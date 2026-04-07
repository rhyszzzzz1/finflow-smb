"use strict";

const crypto = require("crypto");
const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

class PurchaseDebitNoteService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("PurchaseDebitNoteService requires a mysql2/promise pool");
    if (!options.journalService) throw new Error("PurchaseDebitNoteService requires a journalService");
    if (!options.taxService) throw new Error("PurchaseDebitNoteService requires a taxService");
    if (!options.accountingControlService) throw new Error("PurchaseDebitNoteService requires an accountingControlService");
    if (!options.counterpartyService) throw new Error("PurchaseDebitNoteService requires a counterpartyService");
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
      `CREATE TABLE IF NOT EXISTS purchase_debit_note_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        debit_note_number VARCHAR(50) NOT NULL,
        related_purchase_bill_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        vendor_name VARCHAR(255) NULL,
        vendor_legal_name VARCHAR(255) NULL,
        vendor_pan_vat_number VARCHAR(100) NULL,
        vendor_email VARCHAR(255) NULL,
        vendor_phone VARCHAR(50) NULL,
        vendor_address TEXT NULL,
        debit_note_date DATE NOT NULL,
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
        UNIQUE KEY uq_purchase_debit_note_headers_company_debit_note_no (company_id, debit_note_number)
      )`,
      `CREATE TABLE IF NOT EXISTS purchase_debit_note_lines (
        id VARCHAR(36) PRIMARY KEY,
        purchase_debit_note_id VARCHAR(36) NOT NULL,
        related_purchase_bill_line_id VARCHAR(36) NULL,
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
        return_to_vendor TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_debit_note_lines_header_line (purchase_debit_note_id, line_no)
      )`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS related_purchase_bill_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS vendor_address TEXT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS reason TEXT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS notes TEXT NULL`,
      `ALTER TABLE purchase_debit_note_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_headers MODIFY COLUMN status ENUM('draft','approved','posted','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS related_purchase_bill_line_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS discount_value DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS expense_account_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS inventory_account_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_debit_note_lines ADD COLUMN IF NOT EXISTS return_to_vendor TINYINT(1) NOT NULL DEFAULT 0`,
    ];
    for (const sql of statements) {
      try { await this.pool.execute(sql); } catch (_error) {}
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getVendorSnapshot(conn, actorUserId, companyId, vendorId, input = {}) {
    const snapshot = await this.counterpartyService.resolveVendorSnapshot(conn, actorUserId, companyId, vendorId, { ...input, vendor_id: vendorId });
    return {
      id: snapshot.id,
      counterparty_id: snapshot.id,
      vendor_name: snapshot.display_name,
      vendor_legal_name: snapshot.legal_name,
      vendor_pan_vat_number: snapshot.pan_vat_number,
      vendor_email: snapshot.email,
      vendor_phone: snapshot.phone,
      vendor_address: snapshot.address,
    };
  }

  async fetchOriginalBill(conn, actorUserId, relatedBillId) {
    if (!relatedBillId) return null;
    const bill = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ? LIMIT 1`, [relatedBillId, actorUserId]);
    if (!bill) throw new Error("Related purchase bill not found");
    return bill;
  }

  async fetchOriginalBillLine(conn, relatedBillId, relatedBillLineId) {
    if (!relatedBillLineId) return null;
    const line = await this.queryOne(conn, `SELECT * FROM purchase_bill_lines WHERE id = ? AND purchase_bill_id = ? LIMIT 1`, [relatedBillLineId, relatedBillId]);
    if (!line) throw new Error("Related purchase bill line not found");
    return line;
  }

  async calculateLine(conn, actorUserId, rawLine, relatedBillId = null) {
    const quantity = this.qty(rawLine.quantity);
    const unitCost = this.qty(rawLine.unit_cost);
    const description = String(rawLine.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each debit note line requires description");
    if (quantity <= 0) throw new Error("Debit note line quantity must be greater than 0");
    if (unitCost < 0) throw new Error("Debit note line unit_cost must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) throw new Error("discount_type must be one of none, percentage, fixed");
    const originalLine = await this.fetchOriginalBillLine(conn, relatedBillId, rawLine.related_purchase_bill_line_id || null);
    if (originalLine?.item_id && rawLine.item_id && String(originalLine.item_id) !== String(rawLine.item_id)) throw new Error("Debit note item must match the original purchase bill line item");
    const itemId = rawLine.item_id || originalLine?.item_id || null;
    const inventoryAccountId = rawLine.inventory_account_id || originalLine?.inventory_account_id || null;
    const expenseAccountId = rawLine.expense_account_id || originalLine?.expense_account_id || null;
    const hasInventoryTarget = !!(itemId || inventoryAccountId);
    const hasExpenseTarget = !!expenseAccountId;
    if (!hasInventoryTarget && !hasExpenseTarget) throw new Error("Each purchase debit note line must target inventory or an expense account");
    if (hasInventoryTarget && hasExpenseTarget) throw new Error("A purchase debit note line cannot target both inventory and expense");
    if (rawLine.return_to_vendor && !itemId) throw new Error("Stock return debit note lines require item_id");
    const lineSubtotal = this.money(quantity * unitCost);
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
      related_purchase_bill_line_id: rawLine.related_purchase_bill_line_id || null,
      item_id: itemId,
      description,
      quantity,
      unit_cost: unitCost,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      tax_code_id: taxCalc.tax_code_id,
      tax_rate: Number(taxCalc.tax_rate || 0),
      line_subtotal: lineSubtotal,
      line_tax_amount: this.money(taxCalc.tax_amount),
      line_total: this.money(taxableBase + Number(taxCalc.tax_amount || 0)),
      taxable_amount: taxableBase,
      expense_account_id: expenseAccountId,
      inventory_account_id: inventoryAccountId,
      return_to_vendor: rawLine.return_to_vendor ? 1 : 0,
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

  async normalizeDebitNoteLines(conn, actorUserId, debitNoteId, relatedBillId, lines) {
    const normalizedLines = [];
    for (const line of lines) normalizedLines.push(await this.calculateLine(conn, actorUserId, line, relatedBillId));
    if (!normalizedLines.length) throw new Error("At least one debit note line is required");
    return { lines: normalizedLines, totals: this.deriveHeaderTotals(normalizedLines) };
  }

  async persistDebitNoteLines(conn, debitNoteId, normalizedLines) {
    await conn.execute(`DELETE FROM purchase_debit_note_lines WHERE purchase_debit_note_id = ?`, [debitNoteId]);
    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      await conn.execute(
        `INSERT INTO purchase_debit_note_lines
          (id, purchase_debit_note_id, related_purchase_bill_line_id, line_no, item_id, description, quantity, unit_cost, discount_type, discount_value,
           discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total, expense_account_id, inventory_account_id, return_to_vendor)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [this.idFactory(), debitNoteId, line.related_purchase_bill_line_id, i + 1, line.item_id, line.description, line.quantity, line.unit_cost, line.discount_type, line.discount_value, line.discount_amount, line.tax_code_id, line.tax_rate, line.line_subtotal, line.line_tax_amount, line.line_total, line.expense_account_id, line.inventory_account_id, line.return_to_vendor]
      );
    }
  }

  async replaceLines(conn, actorUserId, debitNoteId, relatedBillId, lines) {
    const { lines: normalizedLines, totals } = await this.normalizeDebitNoteLines(conn, actorUserId, debitNoteId, relatedBillId, lines);
    await this.persistDebitNoteLines(conn, debitNoteId, normalizedLines);
    return { lines: normalizedLines, totals };
  }

  async hydrateDebitNote(conn, header) {
    const lines = await this.queryAll(conn, `SELECT * FROM purchase_debit_note_lines WHERE purchase_debit_note_id = ? ORDER BY line_no ASC`, [header.id]);
    return { ...header, base_status: header.status, lines };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const originalBill = await this.fetchOriginalBill(conn, actorUserId, payload.related_purchase_bill_id || null);
      const vendorRef = payload.counterparty_id || payload.vendor_id || originalBill?.counterparty_id || originalBill?.vendor_id || null;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, { ...payload, vendor_name: payload.vendor_name || originalBill?.vendor_name || null });
      const debitNoteDate = payload.debit_note_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, { companyId, documentType: "purchase_debit_note", entryDate: debitNoteDate });
      const debitNoteId = this.idFactory();
      const { totals, lines } = await this.normalizeDebitNoteLines(conn, actorUserId, debitNoteId, originalBill?.id || null, payload.lines || []);
      await conn.execute(
        `INSERT INTO purchase_debit_note_headers
          (id, company_id, user_id, debit_note_number, related_purchase_bill_id, business_relationship_id, counterparty_id, vendor_id, vendor_name,
           vendor_legal_name, vendor_pan_vat_number, vendor_email, vendor_phone, vendor_address, debit_note_date, status, subtotal_amount, discount_amount,
           taxable_amount, tax_amount, total_amount, reason, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [debitNoteId, companyId, actorUserId, numberInfo.documentNumber, originalBill?.id || payload.related_purchase_bill_id || null, payload.business_relationship_id || originalBill?.business_relationship_id || null, vendor.counterparty_id, vendor.id, vendor.vendor_name, vendor.vendor_legal_name, vendor.vendor_pan_vat_number, vendor.vendor_email, vendor.vendor_phone, vendor.vendor_address, debitNoteDate, totals.subtotal_amount, totals.discount_amount, totals.taxable_amount, totals.tax_amount, totals.total_amount, payload.reason || null, payload.notes || null, numberInfo.sequenceId, actorUserId]
      );
      await this.persistDebitNoteLines(conn, debitNoteId, lines);
      const header = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ?`, [debitNoteId]);
      const hydrated = await this.hydrateDebitNote(conn, header);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "purchase_debit_note", entityId: debitNoteId, actionType: "create", newValues: { debit_note_number: header.debit_note_number, related_purchase_bill_id: header.related_purchase_bill_id, counterparty_id: header.counterparty_id, total_amount: header.total_amount, line_count: lines.length }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async updateDraft(actorUserId, debitNoteId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [debitNoteId, actorUserId]);
      if (!existing) throw new Error("Purchase debit note not found");
      if (existing.status !== "draft") throw new Error("Only draft debit notes can be edited");
      const beforeState = await this.hydrateDebitNote(conn, existing);
      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const originalBill = await this.fetchOriginalBill(conn, actorUserId, payload.related_purchase_bill_id !== undefined ? payload.related_purchase_bill_id : existing.related_purchase_bill_id);
      const vendorRef = payload.counterparty_id || payload.vendor_id || existing.counterparty_id || existing.vendor_id;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, { ...payload, vendor_name: payload.vendor_name || existing.vendor_name });
      const { totals } = await this.replaceLines(conn, actorUserId, debitNoteId, originalBill?.id || null, payload.lines || []);
      await conn.execute(
        `UPDATE purchase_debit_note_headers
            SET related_purchase_bill_id = ?, business_relationship_id = ?, counterparty_id = ?, vendor_id = ?, vendor_name = ?, vendor_legal_name = ?,
                vendor_pan_vat_number = ?, vendor_email = ?, vendor_phone = ?, vendor_address = ?, debit_note_date = ?, subtotal_amount = ?, discount_amount = ?,
                taxable_amount = ?, tax_amount = ?, total_amount = ?, reason = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [originalBill?.id || existing.related_purchase_bill_id, payload.business_relationship_id !== undefined ? payload.business_relationship_id : existing.business_relationship_id, vendor.counterparty_id, vendor.id, vendor.vendor_name, vendor.vendor_legal_name, vendor.vendor_pan_vat_number, vendor.vendor_email, vendor.vendor_phone, vendor.vendor_address, payload.debit_note_date || existing.debit_note_date, totals.subtotal_amount, totals.discount_amount, totals.taxable_amount, totals.tax_amount, totals.total_amount, payload.reason !== undefined ? payload.reason : existing.reason, payload.notes !== undefined ? payload.notes : existing.notes, debitNoteId]
      );
      const updated = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ?`, [debitNoteId]);
      const hydrated = await this.hydrateDebitNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "purchase_debit_note", entityId: debitNoteId, actionType: "update", oldValues: beforeState, newValues: hydrated, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async approve(actorUserId, debitNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [debitNoteId, actorUserId]);
      if (!header) throw new Error("Purchase debit note not found");
      if (header.status !== "draft") throw new Error("Only draft debit notes can be approved");
      await conn.execute(`UPDATE purchase_debit_note_headers SET status = 'approved', approved_by_user_id = ?, approved_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [actorUserId, debitNoteId]);
      const updated = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ?`, [debitNoteId]);
      const hydrated = await this.hydrateDebitNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId), entityType: "purchase_debit_note", entityId: debitNoteId, actionType: "approve", oldValues: { status: header.status }, newValues: { status: updated.status, approved_at: updated.approved_at }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async post(actorUserId, debitNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [debitNoteId, actorUserId]);
      if (!header) throw new Error("Purchase debit note not found");
      if (!["draft", "approved"].includes(header.status)) throw new Error("Only draft or approved debit notes can be posted");
      if (header.posted_journal_entry_id) throw new Error("Debit note has already been posted");
      const lines = await this.queryAll(conn, `SELECT * FROM purchase_debit_note_lines WHERE purchase_debit_note_id = ? ORDER BY line_no ASC`, [debitNoteId]);
      if (!lines.length) throw new Error("Debit note requires at least one line before posting");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      await this.accountingControlService.validatePostingDate(conn, companyId, header.debit_note_date);
      const journalLines = [{
        accountCode: DEFAULT_ACCOUNT_CODES.accountsPayable,
        debit: this.money(header.total_amount),
        credit: 0,
        vendorId: header.counterparty_id || header.vendor_id || null,
        description: `Accounts payable reversal for ${header.debit_note_number}`,
      }];
      for (const line of lines) {
        const taxableAmount = this.money(line.taxable_amount || (Number(line.line_subtotal || 0) - Number(line.discount_amount || 0)));
        if (taxableAmount > 0) {
          journalLines.push({
            accountId: line.inventory_account_id || line.expense_account_id || null,
            accountCode: !line.inventory_account_id && !line.expense_account_id ? (line.item_id ? DEFAULT_ACCOUNT_CODES.inventory : DEFAULT_ACCOUNT_CODES.purchases) : undefined,
            debit: 0,
            credit: taxableAmount,
            vendorId: header.counterparty_id || header.vendor_id || null,
            itemId: line.item_id || null,
            description: `Purchase reversal for ${header.debit_note_number}`,
          });
        }
      }
      const inputTaxPostings = await this.taxService.buildInputTaxPostings(conn, actorUserId, lines);
      for (const posting of inputTaxPostings) {
        journalLines.push({
          accountId: posting.accountId || null,
          accountCode: posting.accountCode,
          debit: 0,
          credit: posting.amount,
          vendorId: header.counterparty_id || header.vendor_id || null,
          description: `Input tax reversal for ${header.debit_note_number}`,
        });
      }
      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "purchase_debit_note",
        sourceId: debitNoteId,
        entryDate: header.debit_note_date,
        memo: `Post purchase debit note ${header.debit_note_number}`,
        createdByUserId: actorUserId,
        requestMeta,
        conn,
        lines: journalLines,
      });
      const inventoryHooks = [];
      if (this.inventoryLedgerService) {
        for (const line of lines.filter((entry) => entry.item_id && Number(entry.return_to_vendor || 0) === 1)) {
          const unitCost = Number(line.quantity || 0) > 0 ? this.money(Number(line.taxable_amount || (Number(line.line_subtotal || 0) - Number(line.discount_amount || 0))) / Number(line.quantity)) : 0;
          const applied = await this.inventoryLedgerService.applyPurchaseReturn({ companyId, itemId: line.item_id, quantity: line.quantity, purchaseId: debitNoteId, createdByUserId: actorUserId, newId: this.idFactory, unitCost, conn });
          inventoryHooks.push({ ...applied, item_id: line.item_id, line_no: line.line_no });
        }
      }
      const postedJournal = await this.journalService.postJournalEntry({ companyId, journalEntryId: journalEntry.id, actorUserId, requestMeta, conn });
      await conn.execute(`UPDATE purchase_debit_note_headers SET status = 'posted', posted_journal_entry_id = ?, posted_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [postedJournal.id, debitNoteId]);
      await this.taxService.recordTaxTransactionsForPurchaseDebitNote(conn, actorUserId, { companyId, header, lines, postedJournalEntryId: postedJournal.id });
      const updated = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ?`, [debitNoteId]);
      const hydrated = await this.hydrateDebitNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId, entityType: "purchase_debit_note", entityId: debitNoteId, actionType: "post", oldValues: { status: header.status, posted_journal_entry_id: header.posted_journal_entry_id }, newValues: { status: updated.status, posted_journal_entry_id: updated.posted_journal_entry_id }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return { ...hydrated, inventory_hooks: inventoryHooks };
    });
  }

  async void(actorUserId, debitNoteId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [debitNoteId, actorUserId]);
      if (!header) throw new Error("Purchase debit note not found");
      if (header.posted_journal_entry_id) throw new Error("Posted debit notes cannot be voided directly; use reversal");
      if (header.status === "void") return this.hydrateDebitNote(conn, header);
      await conn.execute(`UPDATE purchase_debit_note_headers SET status = 'void', voided_at = NOW(), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [debitNoteId]);
      const updated = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ?`, [debitNoteId]);
      const hydrated = await this.hydrateDebitNote(conn, updated);
      await this.writeAudit(conn, { actorUserId, companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId), entityType: "purchase_debit_note", entityId: debitNoteId, actionType: "void", oldValues: { status: header.status }, newValues: { status: updated.status, voided_at: updated.voided_at }, ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null });
      return hydrated;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(conn, `SELECT * FROM purchase_debit_note_headers WHERE user_id = ? ORDER BY created_at DESC`, [actorUserId]);
      const hydrated = [];
      for (const row of rows) hydrated.push(await this.hydrateDebitNote(conn, row));
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, debitNoteId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(conn, `SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ?`, [debitNoteId, actorUserId]);
      if (!row) return null;
      return this.hydrateDebitNote(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  PurchaseDebitNoteService,
};
