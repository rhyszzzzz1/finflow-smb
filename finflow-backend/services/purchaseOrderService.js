"use strict";

const crypto = require("crypto");

class PurchaseOrderService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("PurchaseOrderService requires a mysql2/promise pool");
    if (!options.counterpartyService) throw new Error("PurchaseOrderService requires a counterpartyService");
    if (!options.accountingControlService) throw new Error("PurchaseOrderService requires an accountingControlService");

    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
    this.accountingControlService = options.accountingControlService;
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
      CREATE TABLE IF NOT EXISTS purchase_order_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        order_no VARCHAR(50) NOT NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        vendor_name VARCHAR(255) NULL,
        vendor_legal_name VARCHAR(255) NULL,
        vendor_pan_vat_number VARCHAR(100) NULL,
        vendor_email VARCHAR(255) NULL,
        vendor_phone VARCHAR(50) NULL,
        vendor_address TEXT NULL,
        order_date DATE NOT NULL,
        expected_date DATE NULL,
        status ENUM('draft','approved','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        notes TEXT NULL,
        sequence_id VARCHAR(36) NULL,
        approved_by_user_id VARCHAR(36) NULL,
        approved_at TIMESTAMP NULL DEFAULT NULL,
        voided_at TIMESTAMP NULL DEFAULT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_order_headers_company_order_no (company_id, order_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS purchase_order_lines (
        id VARCHAR(36) PRIMARY KEY,
        purchase_order_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        ordered_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_order_lines_header_line (purchase_order_id, line_no)
      )
      `,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS vendor_address TEXT NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS expected_date DATE NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS total_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_order_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_order_headers MODIFY COLUMN status ENUM('draft','approved','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_order_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Transitional environments may already differ.
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getVendorSnapshot(conn, actorUserId, companyId, vendorId, input = {}) {
    const snapshot = await this.counterpartyService.resolveVendorSnapshot(conn, actorUserId, companyId, vendorId, {
      ...input,
      vendor_id: vendorId,
    });

    return {
      id: snapshot.id,
      counterparty_id: snapshot.id,
      vendor_name: snapshot.display_name,
      vendor_legal_name: snapshot.legal_name,
      vendor_pan_vat_number: snapshot.pan_vat_number,
      vendor_email: snapshot.email,
      vendor_phone: snapshot.phone,
      vendor_address: snapshot.address,
      linked_profile_id: snapshot.linked_profile_id || null,
    };
  }

  async resolveBusinessRelationship(conn, actorUserId, companyId, vendor, payload = {}) {
    if (!this.businessRelationshipService) return null;

    const relationship = await this.businessRelationshipService.resolveActiveRelationship(conn, {
      actorUserId,
      companyId,
      businessRelationshipId: payload.business_relationship_id || null,
      counterpartyLinkedProfileId: vendor.linked_profile_id || null,
      perspective: "buyer",
    });

    if (payload.business_relationship_id && !relationship) {
      throw new Error("Business relationship not found or not accepted");
    }

    return relationship;
  }

  async calculateLine(rawLine) {
    const description = String(rawLine.description || "").trim();
    const orderedQuantity = this.qty(rawLine.ordered_quantity);
    const unitCost = this.qty(rawLine.unit_cost);
    if (!description) throw new Error("Each purchase order line requires description");
    if (orderedQuantity <= 0) throw new Error("ordered_quantity must be greater than 0");
    if (unitCost < 0) throw new Error("unit_cost must be 0 or greater");

    return {
      item_id: rawLine.item_id || null,
      description,
      ordered_quantity: orderedQuantity,
      unit_cost: unitCost,
      line_total: this.money(orderedQuantity * unitCost),
    };
  }

  deriveTotals(lines) {
    return lines.reduce(
      (acc, line) => {
        acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_total);
        acc.total_amount = this.money(acc.total_amount + line.line_total);
        return acc;
      },
      { subtotal_amount: 0, total_amount: 0 }
    );
  }

  async normalizeOrderLines(lines) {
    const normalized = [];
    for (const line of lines) {
      normalized.push(await this.calculateLine(line));
    }

    if (!normalized.length) throw new Error("At least one purchase order line is required");

    return {
      lines: normalized,
      totals: this.deriveTotals(normalized),
    };
  }

  async persistOrderLines(conn, orderId, normalized) {
    await conn.execute(`DELETE FROM purchase_order_lines WHERE purchase_order_id = ?`, [orderId]);

    for (let i = 0; i < normalized.length; i += 1) {
      const line = normalized[i];
      await conn.execute(
        `INSERT INTO purchase_order_lines
          (id, purchase_order_id, line_no, item_id, description, ordered_quantity, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [this.idFactory(), orderId, i + 1, line.item_id, line.description, line.ordered_quantity, line.unit_cost, line.line_total]
      );
    }
  }

  async replaceOrderLines(conn, orderId, lines) {
    const { lines: normalized, totals } = await this.normalizeOrderLines(lines);
    await this.persistOrderLines(conn, orderId, normalized);
    return { lines: normalized, totals };
  }

  deriveDisplayStatus(baseStatus, lines) {
    if (["draft", "void"].includes(baseStatus)) return baseStatus;

    const ordered = lines.reduce((sum, line) => sum + Number(line.ordered_quantity || 0), 0);
    const received = lines.reduce((sum, line) => sum + Number(line.received_quantity || 0), 0);
    const billed = lines.reduce((sum, line) => sum + Number(line.billed_quantity || 0), 0);

    if (ordered > 0 && billed >= ordered && received >= ordered) return "billed";
    if (ordered > 0 && billed > 0) return "partially_billed";
    if (ordered > 0 && received >= ordered) return "received";
    if (received > 0) return "partially_received";
    return baseStatus;
  }

  async getReceivedQuantity(conn, purchaseOrderLineId) {
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(SUM(grl.received_quantity), 0) AS received_quantity
         FROM goods_receipt_lines grl
         JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id
        WHERE grl.purchase_order_line_id = ?
          AND grh.status = 'posted'`,
      [purchaseOrderLineId]
    ).catch(() => null);
    return this.qty(row?.received_quantity || 0);
  }

  async getBilledQuantity(conn, purchaseOrderLineId) {
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity
         FROM purchase_bill_lines pbl
         JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id
        WHERE pbl.purchase_order_line_id = ?
          AND pbh.status IN ('approved','posted','partially_paid','paid','overdue')`,
      [purchaseOrderLineId]
    ).catch(() => null);
    return this.qty(row?.billed_quantity || 0);
  }

  async hydrateOrder(conn, header) {
    const rawLines = await this.queryAll(
      conn,
      `SELECT *
         FROM purchase_order_lines
        WHERE purchase_order_id = ?
        ORDER BY line_no ASC`,
      [header.id]
    );

    const lines = [];
    for (const line of rawLines) {
      const receivedQuantity = await this.getReceivedQuantity(conn, line.id);
      const billedQuantity = await this.getBilledQuantity(conn, line.id);
      lines.push({
        ...line,
        received_quantity: receivedQuantity,
        billed_quantity: billedQuantity,
        outstanding_receive_quantity: this.qty(Number(line.ordered_quantity || 0) - receivedQuantity),
        outstanding_bill_quantity: this.qty(Number(line.ordered_quantity || 0) - billedQuantity),
      });
    }

    const vendorKey = header.counterparty_id || header.vendor_id || null;
    return {
      ...header,
      vendor_id: vendorKey != null ? String(vendorKey) : header.vendor_id,
      base_status: header.status,
      status: this.deriveDisplayStatus(header.status, lines),
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const vendorRef = payload.counterparty_id || payload.vendor_id || null;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, payload);
      const orderDate = payload.order_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "purchase_order",
        entryDate: orderDate,
      });
      const orderId = this.idFactory();
      const { totals, lines } = await this.normalizeOrderLines(payload.lines || []);

      await conn.execute(
        `INSERT INTO purchase_order_headers
          (id, company_id, user_id, order_no, business_relationship_id, counterparty_id, vendor_id, vendor_name,
           vendor_legal_name, vendor_pan_vat_number, vendor_email, vendor_phone, vendor_address, order_date, expected_date,
           status, subtotal_amount, total_amount, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
        [
          orderId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          businessRelationship?.id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
          orderDate,
          payload.expected_date || null,
          totals.subtotal_amount,
          totals.total_amount,
          payload.notes || null,
          numberInfo.sequenceId,
          actorUserId,
        ]
      );

      await this.persistOrderLines(conn, orderId, lines);

      const header = await this.queryOne(conn, `SELECT * FROM purchase_order_headers WHERE id = ?`, [orderId]);
      const hydrated = await this.hydrateOrder(conn, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_order",
        entityId: orderId,
        actionType: "create",
        newValues: {
          order_no: header.order_no,
          counterparty_id: header.counterparty_id,
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

  async updateDraft(actorUserId, orderId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_order_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [orderId, actorUserId]
      );
      if (!existing) throw new Error("Purchase order not found");
      if (existing.status !== "draft") throw new Error("Only draft purchase orders can be edited");
      const beforeState = await this.hydrateOrder(conn, existing);

      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const vendorRef = payload.counterparty_id || payload.vendor_id || existing.counterparty_id || existing.vendor_id;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, {
        ...payload,
        business_relationship_id: payload.business_relationship_id !== undefined
          ? payload.business_relationship_id
          : existing.business_relationship_id,
      });
      const { totals } = await this.replaceOrderLines(conn, orderId, payload.lines || []);

      await conn.execute(
        `UPDATE purchase_order_headers
            SET business_relationship_id = ?,
                counterparty_id = ?,
                vendor_id = ?,
                vendor_name = ?,
                vendor_legal_name = ?,
                vendor_pan_vat_number = ?,
                vendor_email = ?,
                vendor_phone = ?,
                vendor_address = ?,
                order_date = ?,
                expected_date = ?,
                subtotal_amount = ?,
                total_amount = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          businessRelationship?.id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
          payload.order_date || existing.order_date,
          payload.expected_date !== undefined ? payload.expected_date : existing.expected_date,
          totals.subtotal_amount,
          totals.total_amount,
          payload.notes !== undefined ? payload.notes : existing.notes,
          orderId,
        ]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_order_headers WHERE id = ?`, [orderId]);
      const hydrated = await this.hydrateOrder(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_order",
        entityId: orderId,
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

  async approve(actorUserId, orderId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_order_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [orderId, actorUserId]
      );
      if (!header) throw new Error("Purchase order not found");
      if (header.status === "void") throw new Error("Void purchase orders cannot be approved");
      if (header.status === "approved") return this.hydrateOrder(conn, header);

      await conn.execute(
        `UPDATE purchase_order_headers
            SET status = 'approved',
                approved_by_user_id = ?,
                approved_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [actorUserId, orderId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_order_headers WHERE id = ?`, [orderId]);
      const hydrated = await this.hydrateOrder(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "purchase_order",
        entityId: orderId,
        actionType: "approve",
        oldValues: { status: header.status },
        newValues: { status: updated.status },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async void(actorUserId, orderId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_order_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [orderId, actorUserId]
      );
      if (!header) throw new Error("Purchase order not found");
      if (header.status === "void") return this.hydrateOrder(conn, header);

      await conn.execute(
        `UPDATE purchase_order_headers
            SET status = 'void',
                voided_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [orderId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM purchase_order_headers WHERE id = ?`, [orderId]);
      const hydrated = await this.hydrateOrder(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "purchase_order",
        entityId: orderId,
        actionType: "void",
        oldValues: { status: header.status },
        newValues: { status: updated.status },
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
           FROM purchase_order_headers
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [actorUserId]
      );
      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateOrder(conn, row));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, orderId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(
        conn,
        `SELECT *
           FROM purchase_order_headers
          WHERE id = ?
            AND user_id = ?`,
        [orderId, actorUserId]
      );
      if (!row) return null;
      return this.hydrateOrder(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  PurchaseOrderService,
};
