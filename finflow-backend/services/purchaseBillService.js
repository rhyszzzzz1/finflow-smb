"use strict";

const crypto = require("crypto");
const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

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
    if (!options.counterpartyService) {
      throw new Error("PurchaseBillService requires a counterpartyService");
    }

    this.pool = pool;
    this.journalService = options.journalService;
    this.taxService = options.taxService;
    this.accountingControlService = options.accountingControlService;
    this.counterpartyService = options.counterpartyService;
    this.businessRelationshipService = options.businessRelationshipService || null;
    this.approvalWorkflowService = options.approvalWorkflowService || null;
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
        purchase_order_id VARCHAR(36) NULL,
        goods_receipt_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        vendor_name VARCHAR(255) NULL,
        vendor_legal_name VARCHAR(255) NULL,
        vendor_pan_vat_number VARCHAR(100) NULL,
        vendor_email VARCHAR(255) NULL,
        vendor_phone VARCHAR(50) NULL,
        vendor_address TEXT NULL,
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
        purchase_order_line_id VARCHAR(36) NULL,
        goods_receipt_line_id VARCHAR(36) NULL,
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
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS purchase_order_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS goods_receipt_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_email VARCHAR(255) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_address TEXT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers MODIFY COLUMN status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS purchase_order_line_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_lines ADD COLUMN IF NOT EXISTS goods_receipt_line_id VARCHAR(36) NULL`,
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
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getVendorSnapshot(conn, actorUserId, companyId, vendorId, input = {}) {
    // TODO(accounting-refactor): keep this legacy-compatible entry point until
    // purchase bill payloads stop sending `vendor_id` values that may still
    // refer to the legacy vendors table instead of the canonical master.
    const snapshot = await this.counterpartyService.resolveVendorSnapshot(
      conn,
      actorUserId,
      companyId,
      vendorId,
      {
        ...input,
        vendor_id: vendorId,
      }
    );

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
    if (!this.businessRelationshipService) {
      return null;
    }
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

  async calculateLine(conn, actorUserId, rawLine) {
    const procurementRefs = await this.resolveProcurementReferences(conn, actorUserId, rawLine, rawLine.current_bill_id || null);
    const quantity = this.qty(rawLine.quantity);
    const unitCost = this.qty(rawLine.unit_cost !== undefined ? rawLine.unit_cost : procurementRefs.unit_cost);
    const description = String(rawLine.description || procurementRefs.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each bill line requires description");
    if (quantity <= 0) throw new Error("Bill line quantity must be greater than 0");
    if (unitCost < 0) throw new Error("Bill line unit_cost must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) {
      throw new Error("discount_type must be one of none, percentage, fixed");
    }

    const itemId = rawLine.item_id || procurementRefs.item_id || null;
    const hasInventoryTarget = !!(itemId || rawLine.inventory_account_id);
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
      purchase_order_line_id: procurementRefs.purchase_order_line_id,
      goods_receipt_line_id: procurementRefs.goods_receipt_line_id,
      item_id: itemId,
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

  async resolveProcurementReferences(conn, actorUserId, rawLine, currentBillId = null) {
    let purchaseOrderLine = null;
    let goodsReceiptLine = null;

    if (rawLine.purchase_order_line_id) {
      purchaseOrderLine = await this.queryOne(
        conn,
        `SELECT pol.*, poh.user_id
           FROM purchase_order_lines pol
           JOIN purchase_order_headers poh ON poh.id = pol.purchase_order_id
          WHERE pol.id = ?
          LIMIT 1`,
        [rawLine.purchase_order_line_id]
      ).catch(() => null);
      if (!purchaseOrderLine || purchaseOrderLine.user_id !== actorUserId) {
        throw new Error("Referenced purchase order line not found");
      }
    }

    if (rawLine.goods_receipt_line_id) {
      goodsReceiptLine = await this.queryOne(
        conn,
        `SELECT grl.*, grh.user_id
           FROM goods_receipt_lines grl
           JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id
          WHERE grl.id = ?
          LIMIT 1`,
        [rawLine.goods_receipt_line_id]
      ).catch(() => null);
      if (!goodsReceiptLine || goodsReceiptLine.user_id !== actorUserId) {
        throw new Error("Referenced goods receipt line not found");
      }
    }

    if (goodsReceiptLine?.purchase_order_line_id) {
      if (purchaseOrderLine && purchaseOrderLine.id !== goodsReceiptLine.purchase_order_line_id) {
        throw new Error("Goods receipt line does not match the referenced purchase order line");
      }
      if (!purchaseOrderLine) {
        purchaseOrderLine = await this.queryOne(
          conn,
          `SELECT pol.*, poh.user_id
             FROM purchase_order_lines pol
             JOIN purchase_order_headers poh ON poh.id = pol.purchase_order_id
            WHERE pol.id = ?
            LIMIT 1`,
          [goodsReceiptLine.purchase_order_line_id]
        ).catch(() => null);
      }
    }

    if (goodsReceiptLine) {
      const billedRow = await this.queryOne(
        conn,
        `SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity
           FROM purchase_bill_lines pbl
           JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id
          WHERE pbl.goods_receipt_line_id = ?
            AND pbh.id <> ?`,
        [goodsReceiptLine.id, currentBillId || ""]
      ).catch(() => null);
      const remaining = this.qty(Number(goodsReceiptLine.received_quantity || 0) - Number(billedRow?.billed_quantity || 0));
      if (Number(rawLine.quantity || 0) > remaining) {
        throw new Error("Bill quantity exceeds remaining unbilled quantity on the referenced goods receipt line");
      }
    }

    return {
      purchase_order_line_id: purchaseOrderLine?.id || null,
      goods_receipt_line_id: goodsReceiptLine?.id || null,
      item_id: rawLine.item_id || goodsReceiptLine?.item_id || purchaseOrderLine?.item_id || null,
      description: goodsReceiptLine?.description || purchaseOrderLine?.description || null,
      unit_cost: goodsReceiptLine?.unit_cost || purchaseOrderLine?.unit_cost || 0,
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

  isInventoryLine(line) {
    return !!(line.item_id || line.inventory_account_id);
  }

  /**
   * GRN-linked bills intentionally skip applyPurchaseReceipt on post because stock should
   * be recorded when the goods receipt is posted. If that ledger step was missing (legacy data,
   * failed hook, etc.), backfill the shortfall here so on-hand matches the posted receipt.
   * Movements use reference_type goods_receipt + receipt id so repeated bills against the same
   * GR do not double-count.
   */
  async backfillMissingGrnInventory(conn, { companyId, billId, lines, actorUserId, inventoryHookResults }) {
    if (!this.inventoryLedgerService) return;

    const processedGrItem = new Set();
    for (const line of lines) {
      if (!line.goods_receipt_line_id || !this.isInventoryLine(line)) continue;

      const grl = await this.getGoodsReceiptLineForPosting(conn, companyId, line.goods_receipt_line_id);
      if (!grl || grl.goods_receipt_status !== "posted") continue;

      const itemId = line.item_id || grl.item_id;
      if (!itemId) continue;

      const grKey = `${grl.goods_receipt_id}:${itemId}`;
      if (processedGrItem.has(grKey)) continue;
      processedGrItem.add(grKey);

      const agg = await this.queryOne(
        conn,
        `SELECT COALESCE(SUM(received_quantity), 0) AS expected_qty,
                COALESCE(SUM(line_total), 0) AS expected_cost
           FROM goods_receipt_lines
          WHERE goods_receipt_id = ?
            AND item_id = ?`,
        [grl.goods_receipt_id, itemId]
      );
      const expectedQty = Number(agg?.expected_qty || 0);
      if (expectedQty <= 0) continue;

      const movedRow = await this.queryOne(
        conn,
        `SELECT COALESCE(SUM(quantity_delta), 0) AS moved_qty
           FROM stock_movements
          WHERE company_id = ?
            AND item_id = ?
            AND reference_type = 'goods_receipt'
            AND reference_id = ?`,
        [companyId, itemId, "goods_receipt", grl.goods_receipt_id]
      );
      const movedQty = Number(movedRow?.moved_qty || 0);
      const shortage = this.qty(expectedQty - movedQty);
      if (shortage <= 0) continue;

      const expectedCost = Number(agg?.expected_cost || 0);
      const totalAmount = expectedQty > 0 ? this.money((expectedCost / expectedQty) * shortage) : 0;

      const result = await this.inventoryLedgerService.applyPurchaseReceipt({
        companyId,
        itemId,
        productName: line.description || grl.description || "Inventory",
        sku: null,
        quantity: shortage,
        totalAmount,
        purchaseId: billId,
        referenceType: "goods_receipt",
        referenceId: grl.goods_receipt_id,
        createdByUserId: actorUserId,
        newId: this.idFactory,
        conn,
      });
      inventoryHookResults.push({
        ...result,
        line_no: line.line_no,
        gr_inventory_backfill: true,
        goods_receipt_id: grl.goods_receipt_id,
        item_id: itemId,
      });
    }
  }

  async getGoodsReceiptLineForPosting(conn, companyId, goodsReceiptLineId) {
    if (!goodsReceiptLineId) return null;

    return this.queryOne(
      conn,
      `SELECT
          grl.*,
          grh.company_id,
          grh.user_id,
          grh.status AS goods_receipt_status,
          grh.receipt_no
       FROM goods_receipt_lines grl
       JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id
      WHERE grl.id = ?
        AND grh.company_id = ?
      LIMIT 1`,
      [goodsReceiptLineId, companyId]
    ).catch(() => null);
  }

  async classifyPostingLine(conn, companyId, header, line) {
    const taxableAmount = this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0));
    if (taxableAmount <= 0) {
      return null;
    }

    if (line.goods_receipt_line_id) {
      const goodsReceiptLine = await this.getGoodsReceiptLineForPosting(conn, companyId, line.goods_receipt_line_id);
      if (!goodsReceiptLine) {
        throw new Error(`Cannot post purchase bill: referenced goods receipt line ${line.goods_receipt_line_id} was not found in this company.`);
      }
      if (goodsReceiptLine.goods_receipt_status !== "posted") {
        throw new Error(`Cannot post purchase bill: goods receipt ${goodsReceiptLine.receipt_no} must be posted before billing.`);
      }
      if (!this.isInventoryLine(line)) {
        throw new Error("Cannot post purchase bill: GRN-linked lines must be inventory lines.");
      }

      const grniAmount = this.money(Number(goodsReceiptLine.unit_cost || 0) * Number(line.quantity || 0));
      if (grniAmount !== taxableAmount) {
        throw new Error(
          `Cannot post purchase bill: GRN-linked line ${line.line_no} amount does not match received inventory value. Purchase price variance handling is not configured yet.`
        );
      }

      return {
        accountCode: DEFAULT_ACCOUNT_CODES.goodsReceivedNotInvoiced,
        debit: grniAmount,
        credit: 0,
        vendorId: header.counterparty_id || header.vendor_id || null,
        itemId: line.item_id || goodsReceiptLine.item_id || null,
        description: `GRNI clearing for ${header.bill_no}`,
      };
    }

    return {
      accountId: line.inventory_account_id || line.expense_account_id || null,
      accountCode: !line.inventory_account_id && !line.expense_account_id
        ? (this.isInventoryLine(line) ? DEFAULT_ACCOUNT_CODES.inventory : DEFAULT_ACCOUNT_CODES.purchases)
        : undefined,
      debit: taxableAmount,
      credit: 0,
      vendorId: header.counterparty_id || header.vendor_id || null,
      itemId: line.item_id || null,
      description: `Purchase line for ${header.bill_no}`,
    };
  }

  async normalizeBillLines(conn, actorUserId, billId, lines) {
    const normalizedLines = [];
    for (const line of lines) {
      normalizedLines.push(await this.calculateLine(conn, actorUserId, {
        ...line,
        current_bill_id: billId,
      }));
    }

    if (!normalizedLines.length) {
      throw new Error("At least one purchase bill line is required");
    }

    return {
      lines: normalizedLines,
      totals: this.deriveHeaderTotals(normalizedLines),
    };
  }

  async persistBillLines(conn, billId, normalizedLines) {
    await conn.execute(`DELETE FROM purchase_bill_lines WHERE purchase_bill_id = ?`, [billId]);

    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      await conn.execute(
        `INSERT INTO purchase_bill_lines
          (id, purchase_bill_id, line_no, purchase_order_line_id, goods_receipt_line_id, item_id, description, quantity, unit_cost, discount_type,
           discount_value, discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total,
           expense_account_id, inventory_account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.idFactory(),
          billId,
          i + 1,
          line.purchase_order_line_id,
          line.goods_receipt_line_id,
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
  }

  async replaceBillLines(conn, actorUserId, billId, lines) {
    const { lines: normalizedLines, totals } = await this.normalizeBillLines(conn, actorUserId, billId, lines);
    await this.persistBillLines(conn, billId, normalizedLines);
    return { lines: normalizedLines, totals };
  }

  async getPaymentSnapshot(conn, billId, totalAmount) {
    const row = await this.queryOne(
      conn,
      `SELECT
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM payment_allocations pa
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pa.purchase_bill_id = ?
          OR pa.purchase_id = ?`,
      [billId, billId]
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
    const approval = this.approvalWorkflowService
      ? await this.approvalWorkflowService.buildApprovalView(conn, {
        companyId: header.company_id || await this.resolveCompanyId(conn, header.user_id),
        documentType: "purchase_bill",
        entityId: header.id,
        header,
      })
      : {
        required: false,
        workflow_id: null,
        workflow_name: null,
        status: header.approval_status || "not_required",
        current_step_no: null,
        submitted_at: null,
        submitted_by_user_id: null,
        approved_at: header.approved_at || null,
        approved_by_user_id: header.approved_by_user_id || null,
        rejected_at: null,
        rejected_by_user_id: null,
        rejection_comment: null,
        decisions: [],
      };
    return {
      ...header,
      status: this.deriveDisplayStatus(header.status, paymentSnapshot, header.due_date),
      base_status: header.status,
      payment: paymentSnapshot,
      approval,
      procurement: {
        purchase_order_id: header.purchase_order_id || null,
        goods_receipt_id: header.goods_receipt_id || null,
      },
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const vendorRef = payload.counterparty_id || payload.vendor_id || null;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, payload);
      const billDate = payload.bill_date || new Date().toISOString().slice(0, 10);
      const dueDate = payload.due_date || billDate;
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "purchase_bill",
        entryDate: billDate,
      });
      const billId = this.idFactory();

      const { totals, lines } = await this.normalizeBillLines(conn, actorUserId, billId, payload.lines || []);

      await conn.execute(
        `INSERT INTO purchase_bill_headers
          (id, company_id, user_id, bill_no, purchase_order_id, goods_receipt_id, business_relationship_id, counterparty_id, vendor_id, vendor_name, vendor_legal_name, vendor_pan_vat_number, vendor_email,
           vendor_phone, vendor_address, bill_date, due_date, status, subtotal_amount, discount_amount, taxable_amount, tax_amount, total_amount,
           notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          payload.purchase_order_id || null,
          payload.goods_receipt_id || null,
          businessRelationship?.id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
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

      await this.persistBillLines(conn, billId, lines);

      const header = await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      if (this.approvalWorkflowService) {
        await this.approvalWorkflowService.initializeDocument(conn, {
          companyId,
          documentType: "purchase_bill",
          entityId: billId,
        });
      }
      const hydrated = await this.hydrateBill(
        conn,
        await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId])
      );
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
        actionType: "create",
        newValues: {
          bill_no: header.bill_no,
          status: header.status,
          business_relationship_id: header.business_relationship_id,
          counterparty_id: header.counterparty_id,
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
      const vendorId = payload.counterparty_id || payload.vendor_id || existing.counterparty_id || existing.vendor_id;
      const vendor = await this.getVendorSnapshot(conn, actorUserId, companyId, vendorId, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, vendor, {
        ...payload,
        business_relationship_id: payload.business_relationship_id !== undefined
          ? payload.business_relationship_id
          : existing.business_relationship_id,
      });
      const { totals, lines } = await this.replaceBillLines(conn, actorUserId, billId, payload.lines || []);

      await conn.execute(
        `UPDATE purchase_bill_headers
            SET purchase_order_id = ?,
                goods_receipt_id = ?,
                business_relationship_id = ?,
                counterparty_id = ?,
                vendor_id = ?,
                vendor_name = ?,
                vendor_legal_name = ?,
                vendor_pan_vat_number = ?,
                vendor_email = ?,
                vendor_phone = ?,
                vendor_address = ?,
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
          payload.purchase_order_id !== undefined ? payload.purchase_order_id : existing.purchase_order_id,
          payload.goods_receipt_id !== undefined ? payload.goods_receipt_id : existing.goods_receipt_id,
          businessRelationship?.id || null,
          vendor.counterparty_id,
          vendor.id,
          vendor.vendor_name,
          vendor.vendor_legal_name,
          vendor.vendor_pan_vat_number,
          vendor.vendor_email,
          vendor.vendor_phone,
          vendor.vendor_address,
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
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      if (this.approvalWorkflowService) {
        const approvalResult = await this.approvalWorkflowService.approveDocument(conn, {
          companyId,
          documentType: "purchase_bill",
          entityId: billId,
          actorUserId,
          comment: requestMeta.comment || requestMeta.reason || null,
        });
        if (approvalResult.workflowRequired) {
          const updated = approvalResult.header;
          const hydrated = await this.hydrateBill(conn, updated);
          await this.writeAudit(conn, {
            actorUserId,
            companyId,
            entityType: "purchase_bill",
            entityId: billId,
            actionType: "approve",
            oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
            newValues: {
              status: updated.status,
              approval_status: updated.approval_status,
              approved_at: updated.approved_at,
            },
            ipAddress: requestMeta.ipAddress || null,
            userAgent: requestMeta.userAgent || null,
            route: requestMeta.route || null,
            method: requestMeta.method || null,
          });
          return hydrated;
        }
      }

      if (header.status !== "draft") throw new Error("Only draft bills can be approved");

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

  async submitForApproval(actorUserId, billId, payload = {}, requestMeta = {}) {
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
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      if (!this.approvalWorkflowService) {
        return this.approve(actorUserId, billId, {
          ...requestMeta,
          comment: payload.comment || payload.reason || null,
        });
      }

      const result = await this.approvalWorkflowService.submitDocument(conn, {
        companyId,
        documentType: "purchase_bill",
        entityId: billId,
        actorUserId,
        comment: payload.comment || payload.reason || null,
      });
      const updated = result.header && result.header.id
        ? result.header
        : await this.queryOne(conn, `SELECT * FROM purchase_bill_headers WHERE id = ?`, [billId]);
      const hydrated = await this.hydrateBill(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
        actionType: result.workflowRequired ? result.decisionType : "submit_for_approval",
        oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
        newValues: { status: updated.status, approval_status: updated.approval_status || "not_required" },
        reason: payload.comment || payload.reason || null,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async reject(actorUserId, billId, payload = {}, requestMeta = {}) {
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
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      if (!this.approvalWorkflowService) {
        throw new Error("No approval workflow is configured for purchase bills");
      }

      const result = await this.approvalWorkflowService.rejectDocument(conn, {
        companyId,
        documentType: "purchase_bill",
        entityId: billId,
        actorUserId,
        comment: payload.comment || payload.reason || null,
      });
      const updated = result.header;
      const hydrated = await this.hydrateBill(conn, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "purchase_bill",
        entityId: billId,
        actionType: "reject",
        oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
        newValues: {
          status: updated.status,
          approval_status: updated.approval_status,
          rejected_at: updated.rejected_at,
          rejection_comment: updated.rejection_comment,
        },
        reason: payload.comment || payload.reason || null,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async resubmit(actorUserId, billId, payload = {}, requestMeta = {}) {
    return this.submitForApproval(actorUserId, billId, payload, requestMeta);
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
      if (header.posted_journal_entry_id) {
        throw new Error("Bill has already been posted");
      }
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      if (this.approvalWorkflowService) {
        await this.approvalWorkflowService.assertCanPost(conn, {
          companyId,
          documentType: "purchase_bill",
          header,
        });
      }
      if (!["approved", "draft"].includes(header.status)) {
        throw new Error("Only draft or approved bills can be posted");
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
      await this.accountingControlService.validatePostingDate(conn, companyId, header.bill_date);

      const totalAmount = this.money(header.total_amount);
      const journalLines = [];
      for (const line of lines) {
        const postingLine = await this.classifyPostingLine(conn, companyId, header, line);
        if (postingLine) {
          journalLines.push(postingLine);
        }
      }

      const inputTaxPostings = await this.taxService.buildInputTaxPostings(conn, actorUserId, lines);
      for (const posting of inputTaxPostings) {
        journalLines.push({
          accountId: posting.accountId || null,
          accountCode: posting.accountCode,
          debit: posting.amount,
          credit: 0,
          vendorId: header.counterparty_id || header.vendor_id || null,
          description: `Input VAT for ${header.bill_no}`,
        });
      }

      journalLines.push({
        accountCode: "2100-AP",
        debit: 0,
        credit: totalAmount,
        vendorId: header.counterparty_id || header.vendor_id || null,
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
        conn,
        lines: journalLines,
      });

      const inventoryHookResults = [];
      if (this.inventoryLedgerService) {
        await this.backfillMissingGrnInventory(conn, {
          companyId,
          billId,
          lines,
          actorUserId,
          inventoryHookResults,
        });
        for (const line of lines.filter((line) => (line.item_id || line.inventory_account_id) && !line.goods_receipt_line_id)) {
          const result = await this.inventoryLedgerService.applyPurchaseReceipt({
            companyId,
            itemId: line.item_id || null,
            productName: line.description,
            sku: null,
            quantity: line.quantity,
            totalAmount: this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0)),
            purchaseId: billId,
            createdByUserId: actorUserId,
            newId: this.idFactory,
            conn,
          });
          inventoryHookResults.push({ ...result, line_no: line.line_no });
        }
      }

      const postedJournal = await this.journalService.postJournalEntry({
        companyId,
        journalEntryId: journalEntry.id,
        actorUserId,
        requestMeta,
        conn,
      });

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
