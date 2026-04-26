"use strict";

const crypto = require("crypto");

class SalesOrderService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("SalesOrderService requires a mysql2/promise pool");
    if (!options.counterpartyService) throw new Error("SalesOrderService requires a counterpartyService");
    if (!options.accountingControlService) throw new Error("SalesOrderService requires an accountingControlService");
    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
    this.accountingControlService = options.accountingControlService;
    this.salesInvoiceService = options.salesInvoiceService || null;
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
    const [rows] = await conn.execute(sql, params);
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
      CREATE TABLE IF NOT EXISTS sales_order_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        order_no VARCHAR(50) NOT NULL,
        sales_quote_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255) NULL,
        customer_legal_name VARCHAR(255) NULL,
        customer_pan_vat_number VARCHAR(100) NULL,
        customer_email VARCHAR(255) NULL,
        customer_phone VARCHAR(50) NULL,
        customer_address TEXT NULL,
        order_date DATE NOT NULL,
        expected_invoice_date DATE NULL,
        status ENUM('draft','accepted','converted','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        converted_invoice_id VARCHAR(36) NULL,
        sequence_id VARCHAR(36) NULL,
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_order_headers_company_order_no (company_id, order_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_order_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_order_id VARCHAR(36) NOT NULL,
        sales_quote_line_id VARCHAR(36) NULL,
        line_no INT NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        ordered_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_order_lines_header_line (sales_order_id, line_no)
      )
      `,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS sales_quote_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS customer_address TEXT NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS expected_invoice_date DATE NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS converted_invoice_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_headers MODIFY COLUMN status ENUM('draft','accepted','converted','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS sales_quote_line_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS unit_price DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
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
    return {
      id: snapshot.id,
      counterparty_id: snapshot.id,
      customer_name: snapshot.display_name,
      customer_legal_name: snapshot.legal_name,
      customer_pan_vat_number: snapshot.pan_vat_number,
      customer_email: snapshot.email,
      customer_phone: snapshot.phone,
      customer_address: snapshot.address,
      linked_profile_id: snapshot.linked_profile_id || null,
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
    const orderedQuantity = this.qty(rawLine.ordered_quantity || rawLine.quantity);
    const unitPrice = this.qty(rawLine.unit_price);
    if (!description) throw new Error("Each sales order line requires description");
    if (orderedQuantity <= 0) throw new Error("ordered_quantity must be greater than 0");
    if (unitPrice < 0) throw new Error("unit_price must be 0 or greater");
    return {
      sales_quote_line_id: rawLine.sales_quote_line_id || null,
      item_id: rawLine.item_id || null,
      description,
      ordered_quantity: orderedQuantity,
      unit_price: unitPrice,
      line_total: this.money(orderedQuantity * unitPrice),
    };
  }

  deriveTotals(lines) {
    return lines.reduce((acc, line) => {
      acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_total);
      acc.total_amount = this.money(acc.total_amount + line.line_total);
      return acc;
    }, { subtotal_amount: 0, total_amount: 0 });
  }

  async normalizeOrderLines(lines) {
    const normalized = [];
    for (const line of lines) normalized.push(await this.calculateLine(line));
    if (!normalized.length) throw new Error("At least one sales order line is required");
    return { lines: normalized, totals: this.deriveTotals(normalized) };
  }

  async persistOrderLines(conn, orderId, normalized) {
    await conn.execute(`DELETE FROM sales_order_lines WHERE sales_order_id = ?`, [orderId]);
    for (let i = 0; i < normalized.length; i += 1) {
      const line = normalized[i];
      await conn.execute(
        `INSERT INTO sales_order_lines (id, sales_order_id, sales_quote_line_id, line_no, item_id, description, ordered_quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [this.idFactory(), orderId, line.sales_quote_line_id, i + 1, line.item_id, line.description, line.ordered_quantity, line.unit_price, line.line_total]
      );
    }
  }

  async replaceOrderLines(conn, orderId, lines) {
    const { lines: normalized, totals } = await this.normalizeOrderLines(lines);
    await this.persistOrderLines(conn, orderId, normalized);
    return { lines: normalized, totals };
  }

  async getInvoicedQuantity(conn, salesOrderLineId) {
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(SUM(sil.quantity), 0) AS invoiced_quantity
         FROM sales_invoice_lines sil
         JOIN sales_invoice_headers sih ON sih.id = sil.sales_invoice_id
        WHERE sil.sales_order_line_id = ?
          AND sih.status IN ('approved','posted','partially_paid','paid','overdue')`,
      [salesOrderLineId]
    ).catch(() => null);
    return this.qty(row?.invoiced_quantity || 0);
  }

  deriveDisplayStatus(baseStatus, lines) {
    if (["draft", "void", "converted"].includes(baseStatus)) return baseStatus;
    const ordered = lines.reduce((sum, line) => sum + Number(line.ordered_quantity || 0), 0);
    const invoiced = lines.reduce((sum, line) => sum + Number(line.invoiced_quantity || 0), 0);
    if (ordered > 0 && invoiced >= ordered) return "converted";
    if (invoiced > 0) return "partially_invoiced";
    return baseStatus;
  }

  async hydrateOrder(conn, header) {
    const rawLines = await this.queryAll(conn, `SELECT * FROM sales_order_lines WHERE sales_order_id = ? ORDER BY line_no ASC`, [header.id]);
    const lines = [];
    for (const line of rawLines) {
      const invoicedQuantity = await this.getInvoicedQuantity(conn, line.id);
      lines.push({
        ...line,
        invoiced_quantity: invoicedQuantity,
        outstanding_invoice_quantity: this.qty(Number(line.ordered_quantity || 0) - invoicedQuantity),
      });
    }
    const customerKey = header.counterparty_id || header.customer_id || null;
    return {
      ...header,
      customer_id: customerKey != null ? String(customerKey) : header.customer_id,
      base_status: header.status,
      status: this.deriveDisplayStatus(header.status, lines),
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const customerRef = payload.counterparty_id || payload.customer_id || payload.client_id || null;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, customer, payload);
      const orderDate = payload.order_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "sales_order",
        entryDate: orderDate,
      });
      const orderId = this.idFactory();
      const { totals, lines } = await this.normalizeOrderLines(payload.lines || []);
      await conn.execute(
        `INSERT INTO sales_order_headers
          (id, company_id, user_id, order_no, sales_quote_id, business_relationship_id, counterparty_id, customer_id, customer_name, customer_legal_name,
           customer_pan_vat_number, customer_email, customer_phone, customer_address, order_date, expected_invoice_date, status,
           subtotal_amount, total_amount, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [
          orderId, companyId, actorUserId, numberInfo.documentNumber, payload.sales_quote_id || null, businessRelationship?.id || null,
          customer.counterparty_id, customer.id, customer.customer_name, customer.customer_legal_name, customer.customer_pan_vat_number,
          customer.customer_email, customer.customer_phone, customer.customer_address, orderDate, payload.expected_invoice_date || null,
          totals.subtotal_amount, totals.total_amount, payload.notes || null, numberInfo.sequenceId, actorUserId,
        ]
      );
      await this.persistOrderLines(conn, orderId, lines);
      const header = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ?`, [orderId]);
      const hydrated = await this.hydrateOrder(conn, header);
      await this.writeAudit(conn, {
        actorUserId, companyId, entityType: "sales_order", entityId: orderId, actionType: "create",
        newValues: { order_no: header.order_no, counterparty_id: header.counterparty_id, total_amount: header.total_amount, line_count: lines.length },
        ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async createFromQuote(conn, actorUserId, quote, quoteLines, payload = {}, requestMeta = {}) {
    const companyId = quote.company_id || await this.resolveCompanyId(conn, actorUserId);
    const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
      companyId,
      documentType: "sales_order",
      entryDate: payload.order_date || new Date().toISOString().slice(0, 10),
    });
    const orderId = this.idFactory();
    const lines = quoteLines.map((line) => {
      const orderedQuantity = this.qty(payload.line_overrides?.[line.id]?.ordered_quantity || line.quantity);
      const unitPrice = this.qty(payload.line_overrides?.[line.id]?.unit_price || line.unit_price);
      return {
        sales_quote_line_id: line.id,
        item_id: line.item_id || null,
        description: line.description,
        ordered_quantity: orderedQuantity,
        unit_price: unitPrice,
        line_total: this.money(orderedQuantity * unitPrice),
      };
    });
    const totals = this.deriveTotals(lines);
    await conn.execute(
      `INSERT INTO sales_order_headers
        (id, company_id, user_id, order_no, sales_quote_id, business_relationship_id, counterparty_id, customer_id, customer_name, customer_legal_name,
         customer_pan_vat_number, customer_email, customer_phone, customer_address, order_date, expected_invoice_date, status,
         subtotal_amount, total_amount, notes, sequence_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)`,
      [
        orderId, companyId, actorUserId, numberInfo.documentNumber, quote.id, quote.business_relationship_id || null, quote.counterparty_id,
        quote.customer_id, quote.customer_name, quote.customer_legal_name, quote.customer_pan_vat_number, quote.customer_email,
        quote.customer_phone, quote.customer_address, payload.order_date || new Date().toISOString().slice(0, 10),
        payload.expected_invoice_date || quote.valid_until || null, totals.subtotal_amount, totals.total_amount,
        payload.notes || quote.notes || null, numberInfo.sequenceId, actorUserId,
      ]
    );
    await this.persistOrderLines(conn, orderId, lines);
    const header = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ?`, [orderId]);
    const hydrated = await this.hydrateOrder(conn, header);
    await this.writeAudit(conn, {
      actorUserId, companyId, entityType: "sales_order", entityId: orderId, actionType: "create_from_quote",
      newValues: { order_no: header.order_no, sales_quote_id: quote.id, total_amount: header.total_amount, line_count: lines.length },
      ipAddress: requestMeta.ipAddress || null, userAgent: requestMeta.userAgent || null, route: requestMeta.route || null, method: requestMeta.method || null,
    });
    return hydrated;
  }

  async accept(actorUserId, orderId) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [orderId, actorUserId]);
      if (!header) throw new Error("Sales order not found");
      if (header.status === "void") throw new Error("Void sales orders cannot be accepted");
      if (header.status === "accepted") return this.hydrateOrder(conn, header);
      await conn.execute(`UPDATE sales_order_headers SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
      const updated = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ?`, [orderId]);
      return this.hydrateOrder(conn, updated);
    });
  }

  async void(actorUserId, orderId) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [orderId, actorUserId]);
      if (!header) throw new Error("Sales order not found");
      if (header.status === "converted") throw new Error("Converted sales orders cannot be voided directly");
      if (header.status === "void") return this.hydrateOrder(conn, header);
      await conn.execute(`UPDATE sales_order_headers SET status = 'void', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [orderId]);
      const updated = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ?`, [orderId]);
      return this.hydrateOrder(conn, updated);
    });
  }

  async convertToInvoice(actorUserId, orderId, payload = {}, requestMeta = {}) {
    if (!this.salesInvoiceService) throw new Error("Sales invoice service is required for order conversion");
    return this.withTransaction(async (conn) => {
      const order = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ? FOR UPDATE`, [orderId, actorUserId]);
      if (!order) throw new Error("Sales order not found");
      if (order.status === "void") throw new Error("Void sales orders cannot be converted");
      const orderLines = await this.queryAll(conn, `SELECT * FROM sales_order_lines WHERE sales_order_id = ? ORDER BY line_no ASC`, [orderId]);
      const invoice = await this.salesInvoiceService.createDraft(actorUserId, {
        counterparty_id: order.counterparty_id,
        customer_id: order.customer_id,
        invoice_date: payload.invoice_date || new Date().toISOString().slice(0, 10),
        due_date: payload.due_date || payload.invoice_date || new Date().toISOString().slice(0, 10),
        sales_quote_id: order.sales_quote_id || null,
        sales_order_id: order.id,
        business_relationship_id: order.business_relationship_id || null,
        notes: payload.notes || order.notes || null,
        lines: orderLines.map((line) => ({
          sales_quote_line_id: line.sales_quote_line_id || null,
          sales_order_line_id: line.id,
          item_id: line.item_id || null,
          description: line.description,
          quantity: payload.line_overrides?.[line.id]?.quantity || line.ordered_quantity,
          unit_price: payload.line_overrides?.[line.id]?.unit_price || line.unit_price,
          discount_type: "none",
          discount_value: 0,
          tax_rate: 0,
        })),
      }, requestMeta, conn);
      await conn.execute(
        `UPDATE sales_order_headers
            SET status = 'converted',
                converted_invoice_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [invoice.id, orderId]
      );
      return invoice;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(conn, `SELECT * FROM sales_order_headers WHERE user_id = ? ORDER BY created_at DESC`, [actorUserId]);
      const hydrated = [];
      for (const row of rows) hydrated.push(await this.hydrateOrder(conn, row));
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, orderId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(conn, `SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ?`, [orderId, actorUserId]);
      if (!row) return null;
      return this.hydrateOrder(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SalesOrderService,
};
