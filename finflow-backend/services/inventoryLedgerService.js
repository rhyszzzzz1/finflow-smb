"use strict";

const { sqlParams } = require("../utils/sqlParams");

// TODO(accounting-refactor): this is the modern inventory authority, but it
// still anchors `company_id` and `created_by_user_id` to legacy `profiles`.
// Keep behavior stable for now; later prompts should migrate these FKs once the
// tenancy model is separated cleanly from profile/auth concerns.
class InventoryLedgerService {
  constructor(db, options = {}) {
    if (!db) throw new Error("InventoryLedgerService requires a mysql connection");
    this.db = db;
    this.accountingEngine = options.accountingEngine || null;
  }

  q(sql, params = [], conn = null) {
    if (conn) {
      return conn.execute(sql, sqlParams(params)).then(([rows]) => rows);
    }
    return new Promise((resolve, reject) => {
      this.db.query(sql, sqlParams(params), (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
      });
    });
  }

  begin() {
    return new Promise((resolve, reject) => {
      this.db.beginTransaction((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  commit() {
    return new Promise((resolve, reject) => {
      this.db.commit((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  rollback() {
    return new Promise((resolve) => {
      this.db.rollback(() => resolve());
    });
  }

  money(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  qty(value) {
    return Number(Number(value || 0).toFixed(4));
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        sku VARCHAR(100) NULL,
        description TEXT NULL,
        unit_of_measure VARCHAR(20) DEFAULT 'pcs',
        default_purchase_price DECIMAL(14,2) DEFAULT 0,
        default_selling_price DECIMAL(14,2) DEFAULT 0,
        costing_method_hint ENUM('weighted_average','fifo') NOT NULL DEFAULT 'weighted_average',
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_item_company_sku (company_id, sku),
        KEY idx_item_company_name (company_id, name)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS warehouses (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        name VARCHAR(120) NOT NULL,
        code VARCHAR(30) NOT NULL,
        is_default TINYINT(1) DEFAULT 0,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_warehouse_company_code (company_id, code)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS stock_movements (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        warehouse_id VARCHAR(36) NOT NULL,
        movement_type ENUM(
          'opening',
          'purchase_receipt',
          'sale_issue',
          'sales_return',
          'purchase_return',
          'adjustment_in',
          'adjustment_out',
          'transfer_in',
          'transfer_out'
        ) NOT NULL,
        quantity_delta DECIMAL(14,4) NOT NULL,
        unit_cost DECIMAL(14,4) DEFAULT NULL,
        total_cost DECIMAL(14,2) DEFAULT NULL,
        reference_type ENUM(
          'opening_balance',
          'purchase_bill',
          'goods_receipt',
          'sales_invoice',
          'sales_credit_note',
          'purchase_debit_note',
          'inventory_adjustment',
          'transfer',
          'manual'
        ) NOT NULL,
        reference_id VARCHAR(36) DEFAULT NULL,
        reason VARCHAR(255) DEFAULT NULL,
        cost_layer_ref VARCHAR(36) DEFAULT NULL,
        created_by_user_id VARCHAR(36) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (company_id) REFERENCES profiles(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES profiles(id) ON DELETE RESTRICT,
        KEY idx_stock_item_warehouse (company_id, item_id, warehouse_id, created_at),
        KEY idx_stock_reference (company_id, reference_type, reference_id),
        KEY idx_stock_ledger (company_id, item_id, created_at, id)
      )
      `,
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS costing_method_hint ENUM('weighted_average','fifo') NOT NULL DEFAULT 'weighted_average'`,
      `ALTER TABLE items ADD COLUMN IF NOT EXISTS is_active TINYINT(1) DEFAULT 1`,
      `ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS cost_layer_ref VARCHAR(36) DEFAULT NULL`,
      `
      ALTER TABLE stock_movements
      MODIFY COLUMN movement_type ENUM(
        'opening',
        'purchase_receipt',
        'sale_issue',
        'sales_return',
        'purchase_return',
        'adjustment_in',
        'adjustment_out',
        'transfer_in',
        'transfer_out'
      ) NOT NULL
      `,
      `
      ALTER TABLE stock_movements
      MODIFY COLUMN reference_type ENUM(
        'opening_balance',
        'purchase_bill',
        'goods_receipt',
        'sales_invoice',
        'sales_credit_note',
        'purchase_debit_note',
        'inventory_adjustment',
        'transfer',
        'manual'
      ) NOT NULL
      `,
      `
      CREATE OR REPLACE VIEW v_item_stock_balances AS
      SELECT
        sm.company_id,
        sm.item_id,
        sm.warehouse_id,
        COALESCE(SUM(sm.quantity_delta), 0) AS current_stock,
        COALESCE(SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.total_cost ELSE 0 END), 0) AS total_in_cost
      FROM stock_movements sm
      GROUP BY sm.company_id, sm.item_id, sm.warehouse_id
      `,
    ];

    for (const sql of statements) {
      try {
        await this.q(sql);
      } catch (_error) {
        // Mixed environments may already have a divergent transitional schema.
      }
    }
  }

  async ensureDefaultWarehouse(companyId, newId, conn = null) {
    const existing = await this.q(
      `SELECT id FROM warehouses WHERE company_id=? AND is_default=1 LIMIT 1`,
      [companyId],
      conn
    );
    if (existing.length) return existing[0].id;

    const warehouseId = newId();
    await this.q(
      `INSERT INTO warehouses (id, company_id, name, code, is_default, is_active)
       VALUES (?, ?, 'Main Warehouse', 'MAIN', 1, 1)`,
      [warehouseId, companyId],
      conn
    );
    return warehouseId;
  }

  async findOrCreateItem({ companyId, name, sku = null, description = null, defaultPurchasePrice = 0, defaultSellingPrice = 0, newId, conn = null }) {
    if (!name) throw new Error("Item name is required");

    const bySku = sku
      ? await this.q(`SELECT * FROM items WHERE company_id=? AND sku=? LIMIT 1`, [companyId, sku], conn)
      : [];
    if (bySku.length) return bySku[0];

    const byName = await this.q(`SELECT * FROM items WHERE company_id=? AND name=? LIMIT 1`, [companyId, name], conn);
    if (byName.length) return byName[0];

    const itemId = newId();
    await this.q(
      `INSERT INTO items
       (id, company_id, name, sku, description, default_purchase_price, default_selling_price, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [itemId, companyId, name, sku, description, Number(defaultPurchasePrice || 0), Number(defaultSellingPrice || 0)],
      conn
    );

    const created = await this.q(`SELECT * FROM items WHERE id=? LIMIT 1`, [itemId], conn);
    return created[0];
  }

  async getCurrentStock(companyId, itemId, warehouseId = null, conn = null) {
    const whereWarehouse = warehouseId ? "AND warehouse_id = ?" : "";
    const params = warehouseId ? [companyId, itemId, warehouseId] : [companyId, itemId];
    const rows = await this.q(
      `SELECT COALESCE(SUM(quantity_delta), 0) AS qty
         FROM stock_movements
        WHERE company_id = ?
          AND item_id = ?
          ${whereWarehouse}`,
      params,
      conn
    );
    return this.qty(rows[0]?.qty || 0);
  }

  async getStock(companyId, itemId, warehouseId = null, conn = null) {
    return this.getCurrentStock(companyId, itemId, warehouseId, conn);
  }

  async getStockLedger(companyId, itemId, warehouseId = null) {
    const whereWarehouse = warehouseId ? "AND sm.warehouse_id = ?" : "";
    const params = warehouseId ? [companyId, itemId, warehouseId] : [companyId, itemId];
    const rows = await this.q(
      `SELECT
          sm.*,
          i.name AS item_name,
          i.sku,
          w.name AS warehouse_name,
          w.code AS warehouse_code
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE sm.company_id = ?
         AND sm.item_id = ?
         ${whereWarehouse}
       ORDER BY sm.created_at ASC, sm.id ASC`,
      params
    );

    let runningQty = 0;
    return rows.map((row) => {
      runningQty = this.qty(runningQty + Number(row.quantity_delta || 0));
      return {
        ...row,
        running_quantity: runningQty,
      };
    });
  }

  async getWeightedAverageCost(companyId, itemId, warehouseId = null, conn = null) {
    const whereWarehouse = warehouseId ? "AND warehouse_id = ?" : "";
    const params = warehouseId ? [companyId, itemId, warehouseId] : [companyId, itemId];

    const rows = await this.q(
      `SELECT
          COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0) AS qty_in,
          COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN COALESCE(total_cost, unit_cost * quantity_delta, 0) ELSE 0 END), 0) AS cost_in
       FROM stock_movements
       WHERE company_id = ?
         AND item_id = ?
         ${whereWarehouse}`,
      params,
      conn
    );

    const qtyIn = Number(rows[0]?.qty_in || 0);
    const costIn = Number(rows[0]?.cost_in || 0);
    if (qtyIn <= 0) return 0;
    return Number((costIn / qtyIn).toFixed(4));
  }

  async getIssueUnitCost(companyId, itemId, warehouseId = null, costingMethod = "weighted_average", conn = null) {
    if (costingMethod === "fifo") {
      const fifoRows = await this.q(
        `SELECT unit_cost
           FROM stock_movements
          WHERE company_id = ?
            AND item_id = ?
            ${warehouseId ? "AND warehouse_id = ?" : ""}
            AND quantity_delta > 0
          ORDER BY created_at ASC, id ASC
          LIMIT 1`,
        warehouseId ? [companyId, itemId, warehouseId] : [companyId, itemId],
        conn
      );
      return Number(fifoRows[0]?.unit_cost || 0);
    }

    return this.getWeightedAverageCost(companyId, itemId, warehouseId, conn);
  }

  async createMovement({
    id,
    companyId,
    itemId,
    warehouseId,
    movementType,
    quantityDelta,
    unitCost = null,
    referenceType,
    referenceId = null,
    reason = null,
    costLayerRef = null,
    createdByUserId,
    postAccounting = true,
    conn = null,
  }) {
    const qty = Number(quantityDelta);
    if (!Number.isFinite(qty) || qty === 0) throw new Error("quantityDelta must be non-zero");

    const cost = unitCost === null || unitCost === undefined ? null : Number(unitCost);
    const totalCost = cost === null ? null : this.money(Math.abs(qty) * cost);

    await this.q(
      `INSERT INTO stock_movements
       (id, company_id, item_id, warehouse_id, movement_type, quantity_delta, unit_cost, total_cost,
        reference_type, reference_id, reason, cost_layer_ref, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        companyId,
        itemId,
        warehouseId,
        movementType,
        qty,
        cost,
        totalCost,
        referenceType,
        referenceId,
        reason,
        costLayerRef,
        createdByUserId,
      ],
      conn
    );

    if (postAccounting && this.accountingEngine && ["sale_issue", "sales_return", "adjustment_in", "adjustment_out"].includes(movementType)) {
      try {
        await this.accountingEngine.postInventoryMovement({
          companyId,
          stockMovementId: id,
          actorUserId: createdByUserId,
          memo: reason || `Inventory movement ${movementType}`,
        });
      } catch (err) {
        console.warn("[INVENTORY_ACCOUNTING_POST_WARN]", err.message);
      }
    }
  }

  async recordMovement(args) {
    return this.createMovement(args);
  }

  async previewSaleIssue({ companyId, lines, warehouseId = null, newId, costingMethod = "weighted_average", conn = null }) {
    if (!Array.isArray(lines) || !lines.length) return { applied: false, reason: "no-lines", movements: [], total_cost: 0 };

    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId, conn);
    const results = [];
    let totalCost = 0;

    for (const line of lines) {
      const qty = Number(line.quantity || 0);
      if (qty <= 0 || !line.item_id) continue;

      const lookup = await this.q(`SELECT * FROM items WHERE id=? AND company_id=? LIMIT 1`, [line.item_id, companyId], conn);
      if (!lookup.length) {
        throw new Error(`Sale issue item not found for line: ${line.product_name || line.name || line.sku || line.item_id}`);
      }

      const item = lookup[0];
      const currentStock = await this.getCurrentStock(companyId, item.id, resolvedWarehouseId, conn);
      if (currentStock < qty) {
        throw new Error(`Insufficient stock for item ${item.name}. Available=${currentStock}, requested=${qty}`);
      }

      const unitCost = await this.getIssueUnitCost(companyId, item.id, resolvedWarehouseId, costingMethod, conn);
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error(`Unable to resolve issue cost for item ${item.name}`);
      }

      const lineTotalCost = this.money(qty * unitCost);
      totalCost = this.money(totalCost + lineTotalCost);
      results.push({
        item_id: item.id,
        item_name: item.name,
        warehouse_id: resolvedWarehouseId,
        quantity: this.qty(qty),
        quantity_delta: this.qty(-qty),
        unit_cost: this.qty(unitCost),
        total_cost: lineTotalCost,
        line_no: line.line_no || null,
      });
    }

    return {
      applied: results.length > 0,
      warehouse_id: resolvedWarehouseId,
      movements: results,
      total_cost: totalCost,
    };
  }

  async createOpeningBalance({ companyId, itemId, quantity, unitCost = 0, warehouseId = null, createdByUserId, newId }) {
    const qty = Number(quantity || 0);
    if (qty <= 0) throw new Error("Opening quantity must be greater than 0");
    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId);

    await this.createMovement({
      id: newId(),
      companyId,
      itemId,
      warehouseId: resolvedWarehouseId,
      movementType: "opening",
      quantityDelta: qty,
      unitCost,
      referenceType: "opening_balance",
      reason: "Opening stock balance",
      createdByUserId,
    });

    return { applied: true, warehouse_id: resolvedWarehouseId, quantity_delta: qty, unit_cost: unitCost };
  }

  async applyPurchaseReceipt({
    companyId,
    itemId = null,
    productName,
    sku,
    quantity,
    totalAmount,
    purchaseId,
    referenceType = "purchase_bill",
    referenceId = null,
    warehouseId = null,
    createdByUserId,
    newId,
    conn = null,
  }) {
    const qty = Number(quantity || 0);
    if (qty <= 0) return { applied: false, reason: "no-positive-quantity" };

    let item = null;
    if (itemId) {
      const lookup = await this.q(`SELECT * FROM items WHERE id=? AND company_id=? LIMIT 1`, [itemId, companyId], conn);
      item = lookup[0] || null;
      if (!item) {
        throw new Error("Referenced inventory item was not found for purchase receipt");
      }
    } else {
      item = await this.findOrCreateItem({
        companyId,
        name: productName,
        sku: sku || null,
        defaultPurchasePrice: qty > 0 ? Number(totalAmount || 0) / qty : 0,
        newId,
        conn,
      });
    }

    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId, conn);
    const unitCost = qty > 0 ? Number(Number(totalAmount || 0) / qty) : 0;

    await this.createMovement({
      id: newId(),
      companyId,
      itemId: item.id,
      warehouseId: resolvedWarehouseId,
      movementType: "purchase_receipt",
      quantityDelta: qty,
      unitCost,
      referenceType,
      referenceId: referenceId || purchaseId,
      reason: `Purchase receipt ${referenceId || purchaseId}`,
      createdByUserId,
      conn,
    });

    return { applied: true, item_id: item.id, warehouse_id: resolvedWarehouseId, quantity_delta: qty, unit_cost: unitCost };
  }

  async applyPurchaseReturn({
    companyId,
    itemId,
    quantity,
    purchaseId,
    warehouseId = null,
    createdByUserId,
    newId,
    costingMethod = "weighted_average",
    unitCost = null,
    conn = null,
  }) {
    const qty = Number(quantity || 0);
    if (qty <= 0) throw new Error("Purchase return quantity must be greater than 0");
    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId);
    const available = await this.getCurrentStock(companyId, itemId, resolvedWarehouseId, conn);
    if (available < qty) throw new Error(`Insufficient stock for purchase return. Available=${available}, requested=${qty}`);
    const resolvedUnitCost = unitCost === null || unitCost === undefined
      ? await this.getIssueUnitCost(companyId, itemId, resolvedWarehouseId, costingMethod, conn)
      : Number(unitCost);

    await this.createMovement({
      id: newId(),
      companyId,
      itemId,
      warehouseId: resolvedWarehouseId,
      movementType: "purchase_return",
      quantityDelta: -qty,
      unitCost: resolvedUnitCost,
      referenceType: "purchase_debit_note",
      referenceId: purchaseId,
      reason: `Purchase return ${purchaseId}`,
      createdByUserId,
      conn,
    });

    return { applied: true, warehouse_id: resolvedWarehouseId, quantity_delta: -qty, unit_cost: resolvedUnitCost };
  }

  async applySaleIssue({ companyId, invoiceId, lines, warehouseId = null, createdByUserId, newId, costingMethod = "weighted_average", postAccounting = true, conn = null }) {
    const plan = await this.previewSaleIssue({ companyId, lines, warehouseId, newId, costingMethod, conn });
    if (!plan.applied) {
      return { applied: false, reason: plan.reason || "no-stock-lines", movements: [], total_cost: 0 };
    }

    for (const movement of plan.movements) {
      await this.createMovement({
        id: newId(),
        companyId,
        itemId: movement.item_id,
        warehouseId: movement.warehouse_id,
        movementType: "sale_issue",
        quantityDelta: movement.quantity_delta,
        unitCost: movement.unit_cost,
        referenceType: "sales_invoice",
        referenceId: invoiceId,
        reason: `Sales issue ${invoiceId}`,
        createdByUserId,
        postAccounting,
        conn,
      });
    }

    return {
      applied: true,
      warehouse_id: plan.warehouse_id,
      movements: plan.movements,
      total_cost: plan.total_cost,
    };
  }

  async applySalesReturn({ companyId, itemId, quantity, referenceId, warehouseId = null, createdByUserId, newId, unitCost = null, conn = null }) {
    const qty = Number(quantity || 0);
    if (qty <= 0) throw new Error("Sales return quantity must be greater than 0");
    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId);
    const derivedCost = unitCost === null || unitCost === undefined
      ? await this.getIssueUnitCost(companyId, itemId, resolvedWarehouseId, "weighted_average", conn)
      : Number(unitCost);

    await this.createMovement({
      id: newId(),
      companyId,
      itemId,
      warehouseId: resolvedWarehouseId,
      movementType: "sales_return",
      quantityDelta: qty,
      unitCost: derivedCost,
      referenceType: "sales_credit_note",
      referenceId,
      reason: `Sales return ${referenceId}`,
      createdByUserId,
      conn,
    });

    return { applied: true, quantity_delta: qty, unit_cost: derivedCost };
  }

  async applyAdjustment({ companyId, itemId, quantityDelta, reason, unitCost = null, warehouseId = null, createdByUserId, newId }) {
    const qty = Number(quantityDelta || 0);
    if (qty === 0) throw new Error("Adjustment quantity must be non-zero");
    const resolvedWarehouseId = warehouseId || await this.ensureDefaultWarehouse(companyId, newId);
    if (qty < 0) {
      const available = await this.getCurrentStock(companyId, itemId, resolvedWarehouseId);
      if (available < Math.abs(qty)) {
        throw new Error(`Insufficient stock for adjustment. Available=${available}, requested=${Math.abs(qty)}`);
      }
    }

    const movementType = qty > 0 ? "adjustment_in" : "adjustment_out";
    const derivedCost = unitCost === null || unitCost === undefined
      ? await this.getIssueUnitCost(companyId, itemId, resolvedWarehouseId, "weighted_average")
      : Number(unitCost);

    await this.createMovement({
      id: newId(),
      companyId,
      itemId,
      warehouseId: resolvedWarehouseId,
      movementType,
      quantityDelta: qty,
      unitCost: derivedCost,
      referenceType: "inventory_adjustment",
      reason: reason || "Inventory adjustment",
      createdByUserId,
    });

    return { applied: true, movement_type: movementType };
  }

  async applyTransfer({ companyId, itemId, fromWarehouseId, toWarehouseId, quantity, unitCost = null, reason, createdByUserId, newId, costingMethod = "weighted_average" }) {
    const qty = Number(quantity || 0);
    if (qty <= 0) throw new Error("Transfer quantity must be > 0");
    if (fromWarehouseId === toWarehouseId) throw new Error("Transfer requires two distinct warehouses");

    await this.begin();
    try {
      const available = await this.getCurrentStock(companyId, itemId, fromWarehouseId);
      if (available < qty) {
        throw new Error(`Insufficient stock to transfer. Available=${available}, requested=${qty}`);
      }

      const derivedCost = unitCost === null || unitCost === undefined
        ? await this.getIssueUnitCost(companyId, itemId, fromWarehouseId, costingMethod)
        : Number(unitCost);

      const transferRef = newId();
      await this.createMovement({
        id: newId(),
        companyId,
        itemId,
        warehouseId: fromWarehouseId,
        movementType: "transfer_out",
        quantityDelta: -qty,
        unitCost: derivedCost,
        referenceType: "transfer",
        referenceId: transferRef,
        reason: reason || "Stock transfer out",
        createdByUserId,
      });

      await this.createMovement({
        id: newId(),
        companyId,
        itemId,
        warehouseId: toWarehouseId,
        movementType: "transfer_in",
        quantityDelta: qty,
        unitCost: derivedCost,
        referenceType: "transfer",
        referenceId: transferRef,
        reason: reason || "Stock transfer in",
        createdByUserId,
      });

      await this.commit();
      return { applied: true, transfer_reference: transferRef };
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async getStockBalances(companyId) {
    const rows = await this.q(
      `SELECT
          i.id AS item_id,
          i.name AS item_name,
          i.sku,
          w.id AS warehouse_id,
          w.name AS warehouse_name,
          COALESCE(SUM(sm.quantity_delta), 0) AS current_stock,
          COALESCE(
            CASE
              WHEN SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END) > 0
              THEN SUM(CASE WHEN sm.quantity_delta > 0 THEN COALESCE(sm.total_cost, sm.unit_cost * sm.quantity_delta, 0) ELSE 0 END)
                   / SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END)
              ELSE 0
            END,
            0
          ) AS weighted_avg_cost
       FROM items i
       LEFT JOIN stock_movements sm ON sm.item_id = i.id AND sm.company_id = i.company_id
       LEFT JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE i.company_id = ?
       GROUP BY i.id, i.name, i.sku, w.id, w.name
       ORDER BY i.name ASC`,
      [companyId]
    );
    return rows.map((row) => {
      const qty = Number(row.current_stock) || 0;
      const unitCost = Number(row.weighted_avg_cost) || 0;
      return {
        ...row,
        quantity_on_hand: qty,
        on_hand_value: this.money(qty * unitCost),
      };
    });
  }
}

module.exports = {
  InventoryLedgerService,
};
