"use strict";

const crypto = require("crypto");
const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

class GoodsReceiptService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("GoodsReceiptService requires a mysql2/promise pool");
    if (!options.counterpartyService) throw new Error("GoodsReceiptService requires a counterpartyService");
    if (!options.accountingControlService) throw new Error("GoodsReceiptService requires an accountingControlService");
    if (!options.inventoryLedgerService) throw new Error("GoodsReceiptService requires an inventoryLedgerService");
    if (!options.journalService) throw new Error("GoodsReceiptService requires a journalService");

    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
    this.accountingControlService = options.accountingControlService;
    this.inventoryLedgerService = options.inventoryLedgerService;
    this.journalService = options.journalService;
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
      CREATE TABLE IF NOT EXISTS goods_receipt_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        receipt_no VARCHAR(50) NOT NULL,
        purchase_order_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        vendor_name VARCHAR(255) NULL,
        vendor_legal_name VARCHAR(255) NULL,
        vendor_pan_vat_number VARCHAR(100) NULL,
        vendor_email VARCHAR(255) NULL,
        vendor_phone VARCHAR(50) NULL,
        vendor_address TEXT NULL,
        receipt_date DATE NOT NULL,
        status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
        notes TEXT NULL,
        posted_journal_entry_id VARCHAR(36) NULL,
        sequence_id VARCHAR(36) NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        voided_at TIMESTAMP NULL DEFAULT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_goods_receipt_headers_company_receipt_no (company_id, receipt_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS goods_receipt_lines (
        id VARCHAR(36) PRIMARY KEY,
        goods_receipt_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        purchase_order_line_id VARCHAR(36) NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        ordered_quantity_snapshot DECIMAL(14,4) NOT NULL DEFAULT 0,
        received_quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_goods_receipt_lines_header_line (goods_receipt_id, line_no)
      )
      `,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS purchase_order_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS vendor_address TEXT NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS posted_journal_entry_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS posted_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE goods_receipt_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_headers MODIFY COLUMN status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS purchase_order_line_id VARCHAR(36) NULL`,
      `ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS ordered_quantity_snapshot DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE goods_receipt_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
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

  async getPurchaseOrderHeader(conn, actorUserId, purchaseOrderId) {
    if (!purchaseOrderId) return null;
    return this.queryOne(
      conn,
      `SELECT *
         FROM purchase_order_headers
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [purchaseOrderId, actorUserId]
    );
  }

  async getPurchaseOrderLine(conn, purchaseOrderLineId) {
    if (!purchaseOrderLineId) return null;
    return this.queryOne(
      conn,
      `SELECT pol.*, poh.user_id
         FROM purchase_order_lines pol
         JOIN purchase_order_headers poh ON poh.id = pol.purchase_order_id
        WHERE pol.id = ?
        LIMIT 1`,
      [purchaseOrderLineId]
    );
  }

  async calculateExistingReceived(conn, purchaseOrderLineId, excludeGoodsReceiptId = null) {
    if (!purchaseOrderLineId) return 0;
    const params = [purchaseOrderLineId];
    let excludeClause = "";
    if (excludeGoodsReceiptId) {
      excludeClause = "AND grl.goods_receipt_id <> ?";
      params.push(excludeGoodsReceiptId);
    }
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(SUM(grl.received_quantity), 0) AS received_quantity
         FROM goods_receipt_lines grl
         JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id
        WHERE grl.purchase_order_line_id = ?
          AND grh.status <> 'void'
          ${excludeClause}`,
      params
    ).catch(() => null);
    return this.qty(row?.received_quantity || 0);
  }

  async calculateBilledQuantity(conn, goodsReceiptLineId) {
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity
         FROM purchase_bill_lines pbl
         JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id
        WHERE pbl.goods_receipt_line_id = ?
          AND pbh.status IN ('approved','posted','partially_paid','paid','overdue')`,
      [goodsReceiptLineId]
    ).catch(() => null);
    return this.qty(row?.billed_quantity || 0);
  }

  async calculateLine(conn, actorUserId, line, goodsReceiptId = null) {
    let purchaseOrderLine = null;
    if (line.purchase_order_line_id) {
      purchaseOrderLine = await this.getPurchaseOrderLine(conn, line.purchase_order_line_id);
      if (!purchaseOrderLine || purchaseOrderLine.user_id !== actorUserId) {
        throw new Error("Referenced purchase order line not found");
      }
    }

    const itemId = line.item_id || purchaseOrderLine?.item_id || null;
    const description = String(line.description || purchaseOrderLine?.description || "").trim();
    const orderedQuantity = this.qty(line.ordered_quantity_snapshot || purchaseOrderLine?.ordered_quantity || 0);
    const receivedQuantity = this.qty(line.received_quantity);
    const unitCost = this.qty(line.unit_cost !== undefined ? line.unit_cost : purchaseOrderLine?.unit_cost);

    if (!itemId) throw new Error("Goods receipt lines require item_id or a referenced purchase order line with item_id");
    if (!description) throw new Error("Each goods receipt line requires description");
    if (receivedQuantity <= 0) throw new Error("received_quantity must be greater than 0");
    if (unitCost < 0) throw new Error("unit_cost must be 0 or greater");

    if (purchaseOrderLine) {
      const alreadyReceived = await this.calculateExistingReceived(conn, purchaseOrderLine.id, goodsReceiptId);
      const remaining = this.qty(Number(purchaseOrderLine.ordered_quantity || 0) - alreadyReceived);
      if (receivedQuantity > remaining) {
        throw new Error(`Received quantity exceeds remaining ordered quantity for PO line ${purchaseOrderLine.line_no}`);
      }
    }

    return {
      purchase_order_line_id: purchaseOrderLine?.id || line.purchase_order_line_id || null,
      item_id: itemId,
      description,
      ordered_quantity_snapshot: orderedQuantity,
      received_quantity: receivedQuantity,
      unit_cost: unitCost,
      line_total: this.money(receivedQuantity * unitCost),
    };
  }

  async normalizeReceiptLines(conn, actorUserId, goodsReceiptId, lines) {
    const normalized = [];
    for (const line of lines) {
      normalized.push(await this.calculateLine(conn, actorUserId, line, goodsReceiptId));
    }

    if (!normalized.length) throw new Error("At least one goods receipt line is required");
    return normalized;
  }

  async persistReceiptLines(conn, goodsReceiptId, normalized) {
    await conn.execute(`DELETE FROM goods_receipt_lines WHERE goods_receipt_id = ?`, [goodsReceiptId]);

    for (let i = 0; i < normalized.length; i += 1) {
      const line = normalized[i];
      await conn.execute(
        `INSERT INTO goods_receipt_lines
          (id, goods_receipt_id, line_no, purchase_order_line_id, item_id, description, ordered_quantity_snapshot, received_quantity, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.idFactory(),
          goodsReceiptId,
          i + 1,
          line.purchase_order_line_id,
          line.item_id,
          line.description,
          line.ordered_quantity_snapshot,
          line.received_quantity,
          line.unit_cost,
          line.line_total,
        ]
      );
    }
  }

  async replaceReceiptLines(conn, actorUserId, goodsReceiptId, lines) {
    const normalized = await this.normalizeReceiptLines(conn, actorUserId, goodsReceiptId, lines);
    await this.persistReceiptLines(conn, goodsReceiptId, normalized);
    return normalized;
  }

  deriveDisplayStatus(baseStatus, lines) {
    if (baseStatus === "void") return baseStatus;
    if (baseStatus === "draft") return baseStatus;
    const totalReceived = lines.reduce((sum, line) => sum + Number(line.received_quantity || 0), 0);
    const totalBilled = lines.reduce((sum, line) => sum + Number(line.billed_quantity || 0), 0);
    if (totalReceived > 0 && totalBilled >= totalReceived) return "fully_billed";
    if (totalBilled > 0) return "partially_billed";
    return baseStatus;
  }

  async hydrateReceipt(conn, header) {
    const rawLines = await this.queryAll(
      conn,
      `SELECT *
         FROM goods_receipt_lines
        WHERE goods_receipt_id = ?
        ORDER BY line_no ASC`,
      [header.id]
    );

    const lines = [];
    for (const line of rawLines) {
      const billedQuantity = await this.calculateBilledQuantity(conn, line.id);
      lines.push({
        ...line,
        billed_quantity: billedQuantity,
        outstanding_bill_quantity: this.qty(Number(line.received_quantity || 0) - billedQuantity),
      });
    }

    return {
      ...header,
      base_status: header.status,
      status: this.deriveDisplayStatus(header.status, lines),
      lines,
    };
  }

  buildInventoryReceiptJournalLines(header, lines) {
    const inventoryLines = lines.filter((line) => line.item_id);
    const inventoryAmount = this.money(
      inventoryLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0)
    );

    if (inventoryAmount <= 0) {
      throw new Error("Cannot post goods receipt: inventory value must be greater than zero");
    }

    return [
      {
        accountCode: DEFAULT_ACCOUNT_CODES.inventory,
        debit: inventoryAmount,
        credit: 0,
        vendorId: header.counterparty_id || header.vendor_id || null,
        description: `Inventory receipt for ${header.receipt_no}`,
      },
      {
        accountCode: DEFAULT_ACCOUNT_CODES.goodsReceivedNotInvoiced,
        debit: 0,
        credit: inventoryAmount,
        vendorId: header.counterparty_id || header.vendor_id || null,
        description: `GRNI for ${header.receipt_no}`,
      },
    ];
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const purchaseOrder = await this.getPurchaseOrderHeader(conn, actorUserId, payload.purchase_order_id || null);
      const vendorRef = payload.counterparty_id
        || payload.vendor_id
        || purchaseOrder?.counterparty_id
        || purchaseOrder?.vendor_id
        || null;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, payload);
      const receiptDate = payload.receipt_date || new Date().toISOString().slice(0, 10);
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "goods_receipt",
        entryDate: receiptDate,
      });
      const goodsReceiptId = this.idFactory();
      const lines = await this.normalizeReceiptLines(conn, actorUserId, goodsReceiptId, payload.lines || []);

      await conn.execute(
        `INSERT INTO goods_receipt_headers
          (id, company_id, user_id, receipt_no, purchase_order_id, business_relationship_id, counterparty_id, vendor_id,
           vendor_name, vendor_legal_name, vendor_pan_vat_number, vendor_email, vendor_phone, vendor_address, receipt_date,
           status, notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        [
          goodsReceiptId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          purchaseOrder?.id || payload.purchase_order_id || null,
          businessRelationship?.id || purchaseOrder?.business_relationship_id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
          receiptDate,
          payload.notes || null,
          numberInfo.sequenceId,
          actorUserId,
        ]
      );

      await this.persistReceiptLines(conn, goodsReceiptId, lines);

      const header = await this.queryOne(conn, `SELECT * FROM goods_receipt_headers WHERE id = ?`, [goodsReceiptId]);
      const hydrated = await this.hydrateReceipt(conn, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "goods_receipt",
        entityId: goodsReceiptId,
        actionType: "create",
        newValues: {
          receipt_no: header.receipt_no,
          purchase_order_id: header.purchase_order_id,
          counterparty_id: header.counterparty_id,
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

  async updateDraft(actorUserId, goodsReceiptId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM goods_receipt_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [goodsReceiptId, actorUserId]
      );
      if (!existing) throw new Error("Goods receipt not found");
      if (existing.status !== "draft") throw new Error("Only draft goods receipts can be edited");
      const beforeState = await this.hydrateReceipt(conn, existing);

      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const purchaseOrder = await this.getPurchaseOrderHeader(
        conn,
        actorUserId,
        payload.purchase_order_id !== undefined ? payload.purchase_order_id : existing.purchase_order_id
      );
      const vendorRef = payload.counterparty_id
        || payload.vendor_id
        || purchaseOrder?.counterparty_id
        || purchaseOrder?.vendor_id
        || existing.counterparty_id
        || existing.vendor_id
        || null;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, {
        ...payload,
        business_relationship_id: payload.business_relationship_id !== undefined
          ? payload.business_relationship_id
          : (existing.business_relationship_id || purchaseOrder?.business_relationship_id),
      });
      await this.replaceReceiptLines(conn, actorUserId, goodsReceiptId, payload.lines || []);

      await conn.execute(
        `UPDATE goods_receipt_headers
            SET purchase_order_id = ?,
                business_relationship_id = ?,
                counterparty_id = ?,
                vendor_id = ?,
                vendor_name = ?,
                vendor_legal_name = ?,
                vendor_pan_vat_number = ?,
                vendor_email = ?,
                vendor_phone = ?,
                vendor_address = ?,
                receipt_date = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          purchaseOrder?.id || existing.purchase_order_id,
          businessRelationship?.id || purchaseOrder?.business_relationship_id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
          payload.receipt_date || existing.receipt_date,
          payload.notes !== undefined ? payload.notes : existing.notes,
          goodsReceiptId,
        ]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM goods_receipt_headers WHERE id = ?`, [goodsReceiptId]);
      const hydrated = await this.hydrateReceipt(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "goods_receipt",
        entityId: goodsReceiptId,
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

  async post(actorUserId, goodsReceiptId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM goods_receipt_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [goodsReceiptId, actorUserId]
      );
      if (!header) throw new Error("Goods receipt not found");
      if (header.status === "void") throw new Error("Void goods receipts cannot be posted");
      if (header.status === "posted") return this.hydrateReceipt(conn, header);

      const lines = await this.queryAll(
        conn,
        `SELECT *
           FROM goods_receipt_lines
          WHERE goods_receipt_id = ?
          ORDER BY line_no ASC`,
        [goodsReceiptId]
      );
      if (!lines.length) throw new Error("Goods receipt requires at least one line before posting");

      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      await this.accountingControlService.validatePostingDate(conn, companyId, header.receipt_date);
      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "goods_receipt",
        sourceId: goodsReceiptId,
        entryDate: header.receipt_date,
        memo: `Post goods receipt ${header.receipt_no}`,
        createdByUserId: actorUserId,
        requestMeta,
        conn,
        lines: this.buildInventoryReceiptJournalLines(header, lines),
      });

      const inventoryResults = [];
      for (const line of lines) {
        const result = await this.inventoryLedgerService.applyPurchaseReceipt({
          companyId,
          itemId: line.item_id,
          productName: line.description,
          quantity: line.received_quantity,
          totalAmount: this.money(Number(line.line_total || 0)),
          purchaseId: goodsReceiptId,
          referenceType: "goods_receipt",
          createdByUserId: actorUserId,
          newId: this.idFactory,
          conn,
        });
        inventoryResults.push({ ...result, line_no: line.line_no });
      }

      const postedJournal = await this.journalService.postJournalEntry({
        companyId,
        journalEntryId: journalEntry.id,
        actorUserId,
        requestMeta,
        conn,
      });

      await conn.execute(
        `UPDATE goods_receipt_headers
            SET status = 'posted',
                posted_journal_entry_id = ?,
                posted_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [postedJournal.id, goodsReceiptId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM goods_receipt_headers WHERE id = ?`, [goodsReceiptId]);
      const hydrated = await this.hydrateReceipt(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "goods_receipt",
        entityId: goodsReceiptId,
        actionType: "post",
        oldValues: { status: header.status },
        newValues: { status: updated.status, posted_journal_entry_id: updated.posted_journal_entry_id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return {
        ...hydrated,
        inventory_hooks: inventoryResults,
      };
    });
  }

  async void(actorUserId, goodsReceiptId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM goods_receipt_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [goodsReceiptId, actorUserId]
      );
      if (!header) throw new Error("Goods receipt not found");
      if (header.status === "posted") {
        throw new Error("Posted goods receipts cannot be voided directly; create a purchase debit note or stock adjustment");
      }
      if (header.status === "void") return this.hydrateReceipt(conn, header);

      await conn.execute(
        `UPDATE goods_receipt_headers
            SET status = 'void',
                voided_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [goodsReceiptId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM goods_receipt_headers WHERE id = ?`, [goodsReceiptId]);
      const hydrated = await this.hydrateReceipt(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "goods_receipt",
        entityId: goodsReceiptId,
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
           FROM goods_receipt_headers
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [actorUserId]
      );
      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateReceipt(conn, row));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, goodsReceiptId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(
        conn,
        `SELECT *
           FROM goods_receipt_headers
          WHERE id = ?
            AND user_id = ?`,
        [goodsReceiptId, actorUserId]
      );
      if (!row) return null;
      return this.hydrateReceipt(conn, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  GoodsReceiptService,
};
