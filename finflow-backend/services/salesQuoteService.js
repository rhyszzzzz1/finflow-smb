"use strict";

const crypto = require("crypto");
const { sqlParams } = require("../utils/sqlParams");

class SalesQuoteService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("SalesQuoteService requires a mysql2/promise pool");
    if (!options.counterpartyService) throw new Error("SalesQuoteService requires a counterpartyService");
    if (!options.accountingControlService) throw new Error("SalesQuoteService requires an accountingControlService");
    if (!options.salesOrderService) throw new Error("SalesQuoteService requires a salesOrderService");

    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
    this.accountingControlService = options.accountingControlService;
    this.salesOrderService = options.salesOrderService;
    this.businessRelationshipService = options.businessRelationshipService || null;
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
      try { await conn.rollback(); } catch (_e) {}
      throw error;
    } finally {
      conn.release();
    }
  }

  async queryAll(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, sqlParams(params));
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  qty(value) { return Number(Number(value || 0).toFixed(4)); }
  money(value) { return Number(Number(value || 0).toFixed(2)); }

  async writeAudit(conn, payload) {
    if (!this.auditService) return;
    await this.auditService.logAction(payload, conn);
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS sales_quote_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        quote_no VARCHAR(50) NOT NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255) NULL,
        customer_legal_name VARCHAR(255) NULL,
        customer_pan_vat_number VARCHAR(100) NULL,
        customer_email VARCHAR(255) NULL,
        customer_phone VARCHAR(50) NULL,
        customer_address TEXT NULL,
        quote_date DATE NOT NULL,
        valid_until DATE NULL,
        status ENUM('draft','sent','accepted','converted','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        converted_sales_order_id VARCHAR(36) NULL,
        sequence_id VARCHAR(36) NULL,
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_quote_headers_company_quote_no (company_id, quote_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_quote_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_quote_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_quote_lines_header_line (sales_quote_id, line_no)
      )
      `,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS customer_address TEXT NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS valid_until DATE NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS converted_sales_order_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_quote_headers MODIFY COLUMN status ENUM('draft','sent','accepted','converted','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE sales_quote_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE sales_quote_lines ADD COLUMN IF NOT EXISTS unit_price DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_quote_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
    ];
    for (const sql of statements) {
      try { await this.pool.execute(sql); } catch (_e) {}
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getCustomerSnapshot(conn, actorUserId, companyId, customerId, input = {}) {
    const snapshot = await this.counterpartyService.resolveCustomerSnapshot(conn, actorUserId, companyId, customerId, {
      ...input,
      customer_id: customerId,
    });
    const canonicalId = snapshot?.id ?? snapshot?.counterparty_id ?? null;
    return {
      id: canonicalId,
      counterparty_id: canonicalId,
      customer_name: snapshot.display_name ?? null,
      customer_legal_name: snapshot.legal_name ?? null,
      customer_pan_vat_number: snapshot.pan_vat_number ?? null,
      customer_email: snapshot.email ?? null,
      customer_phone: snapshot.phone ?? null,
      customer_address: snapshot.address ?? null,
      linked_profile_id: snapshot.linked_profile_id ?? null,
    };
  }

  async resolveBusinessRelationship(conn, actorUserId, companyId, customer, payload = {}) {
    if (!this.businessRelationshipService) return null;
    const relationship = await this.businessRelationshipService.resolveActiveRelationship(conn, {
      actorUserId,
      companyId,
      businessRelationshipId: payload.business_relationship_id || null,
      counterpartyLinkedProfileId: customer.linked_profile_id || null,
      perspective: "seller",
    });
    if (payload.business_relationship_id && !relationship) throw new Error("Business relationship not found or not accepted");
    return relationship;
  }

  async calculateLine(rawLine) {
    const description = String(rawLine.description || "").trim();
    const quantity = this.qty(rawLine.quantity);
    const unitPrice = this.qty(rawLine.unit_price);
    if (!description) throw new Error("Each sales quote line requires description");
    if (quantity <= 0) throw new Error("Quote quantity must be greater than 0");
    if (unitPrice < 0) throw new Error("Quote unit_price must be 0 or greater");
    return {
      item_id: rawLine.item_id || null,
      description,
      quantity,
      unit_price: unitPrice,
      line_total: this.money(quantity * unitPrice),
    };
  }

  deriveTotals(lines) {
    return lines.reduce((acc, line) => {
      acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_total);
      acc.tax_amount = this.money(acc.tax_amount);
      acc.total_amount = this.money(acc.total_amount + line.line_total);
      return acc;
    }, { subtotal_amount: 0, tax_amount: 0, total_amount: 0 });
  }

  async normalizeQuoteLines(lines) {
    const normalized = [];
    for (const line of lines) normalized.push(await this.calculateLine(line));
    if (!normalized.length) throw new Error("At least one sales quote line is required");
    return { lines: normalized, totals: this.deriveTotals(normalized) };
  }

  async persistQuoteLines(conn, quoteId, normalized) {
    await conn.execute(`DELETE FROM sales_quote_lines WHERE sales_quote_id = ?`, sqlParams([quoteId]));
    for (let i = 0; i < normalized.length; i += 1) {
      const line = normalized[i];
      await conn.execute(
        `INSERT INTO sales_quote_lines (id, sales_quote_id, line_no, item_id, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        sqlParams([this.idFactory(), quoteId, i + 1, line.item_id, line.description, line.quantity, line.unit_price, line.line_total])
      );
    }
  }

  async replaceQuoteLines(conn, quoteId, lines) {
    const { lines: normalized, totals } = await this.normalizeQuoteLines(lines);
    await this.persistQuoteLines(conn, quoteId, normalized);
    return { lines: normalized, totals };
  }

  async hydrateQuote(conn, header) {
    const lines = await this.queryAll(conn, `SELECT * FROM sales_quote_lines WHERE sales_quote_id = ? ORDER BY line_no ASC`, [header.id]);
    const customerKey = header.counterparty_id || header.customer_id || null;
    return {
      ...header,
      // Align with client list options (counterparty_id || legacy clients.id) so the Select shows the name.
      customer_id: customerKey != null ? String(customerKey) : header.customer_id,
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const customerRef = payload.counterparty_id || payload.customer_id || payload.client_id || null;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, customer, payload);
      const quoteDate = payload.quote_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "sales_quote",
        entryDate: quoteDate,
      });
      const quoteId = this.idFactory();
      const { totals, lines } = await this.normalizeQuoteLines(payload.lines || []);
      await conn.execute(
        `INSERT INTO sales_quote_headers
          (id, company_id, user_id, quote_no, business_relationship_id, counterparty_id, customer_id, customer_name, customer_legal_name,
           customer_pan_vat_number, customer_email, customer_phone, customer_address, quote_date, valid_until, status,
           subtotal_amount, tax_amount, total_amount, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        sqlParams([
          quoteId, companyId, actorUserId, numberInfo.documentNumber, businessRelationship?.id ?? null,
          customer.counterparty_id, customer.id, customer.customer_name, customer.customer_legal_name,
          customer.customer_pan_vat_number, customer.customer_email, customer.customer_phone, customer.customer_address,
          quoteDate, payload.valid_until ?? null, totals.subtotal_amount, totals.tax_amount, totals.total_amount,
          payload.notes ?? null, numberInfo.sequenceId, actorUserId,
        ])
      );
      await this.persistQuoteLines(conn, quoteId, lines);

      const header = await this.queryOne(conn, `SELECT * FROM sales_quote_headers WHERE id = ?`, [quoteId]);
      if (!header?.id) {
        throw new Error("Sales quote was created but could not be reloaded");
      }
      const hydrated = await this.hydrateQuote(conn, header);
      await this.writeAudit(conn, {
        actorUserId, companyId, entityType: "sales_quote", entityId: quoteId, actionType: "create",
        newValues: { quote_no: header.quote_no, counterparty_id: header.counterparty_id, total_amount: header.total_amount, line_count: lines.length },
        ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async changeStatus(actorUserId, quoteId, nextStatus) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_quote_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [quoteId, actorUserId]);
      if (!header) throw new Error("Sales quote not found");
      if (header.status === "converted" || header.status === "void") return this.hydrateQuote(conn, header);
      await conn.execute(`UPDATE sales_quote_headers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, sqlParams([nextStatus, quoteId]));
      const updated = await this.queryOne(conn, `SELECT * FROM sales_quote_headers WHERE id = ?`, [quoteId]);
      return this.hydrateQuote(conn, updated);
    });
  }

  async send(actorUserId, quoteId) { return this.changeStatus(actorUserId, quoteId, "sent"); }
  async accept(actorUserId, quoteId) { return this.changeStatus(actorUserId, quoteId, "accepted"); }
  async void(actorUserId, quoteId) { return this.changeStatus(actorUserId, quoteId, "void"); }

  async convertToOrder(actorUserId, quoteId, payload = {}, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const quote = await this.queryOne(conn, `SELECT * FROM sales_quote_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [quoteId, actorUserId]);
      if (!quote) throw new Error("Sales quote not found");
      if (quote.status === "converted") throw new Error("Sales quote has already been converted");
      if (quote.status === "void") throw new Error("Void sales quotes cannot be converted");
      const quoteLines = await this.queryAll(conn, `SELECT * FROM sales_quote_lines WHERE sales_quote_id = ? ORDER BY line_no ASC`, [quoteId]);
      const order = await this.salesOrderService.createFromQuote(conn, actorUserId, quote, quoteLines, payload, requestMeta);
      await conn.execute(
        `UPDATE sales_quote_headers
            SET status = 'converted',
                converted_sales_order_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        sqlParams([order.id, quoteId])
      );
      return order;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(conn, `SELECT * FROM sales_quote_headers WHERE user_id = ? ORDER BY created_at DESC`, [actorUserId]);
      const hydrated = [];
      for (const row of rows) hydrated.push(await this.hydrateQuote(conn, row));
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, quoteId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(conn, `SELECT * FROM sales_quote_headers WHERE id = ? AND user_id = ?`, [quoteId, actorUserId]);
      if (!row) return null;
      return this.hydrateQuote(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SalesQuoteService,
};
