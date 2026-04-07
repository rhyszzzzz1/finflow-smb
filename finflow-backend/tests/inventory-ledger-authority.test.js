"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { InventoryLedgerService } = require("../services/inventoryLedgerService");
const { InventoryService } = require("../services/inventoryService");

function createIdFactory(prefix) {
  let i = 1;
  return () => `${prefix}-${i++}`;
}

function createCounterpartyService() {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      return actorUserId === "user-1" ? "company-1" : `company-for-${actorUserId}`;
    },
  };
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createInventoryDb() {
  const state = {
    items: [],
    warehouses: [],
    stockMovements: [],
  };

  const query = (sql, params, cb) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT id FROM warehouses WHERE company_id=? AND is_default=1 LIMIT 1")) {
      const row = state.warehouses.find((w) => w.company_id === params[0] && w.is_default === 1);
      return cb(null, row ? [{ id: row.id }] : []);
    }

    if (q.startsWith("INSERT INTO warehouses")) {
      state.warehouses.push({
        id: params[0],
        company_id: params[1],
        name: q.includes("'Main Warehouse'") ? "Main Warehouse" : params[2],
        code: q.includes("'MAIN'") ? "MAIN" : params[3],
        is_default: q.includes(", 1, 1)") ? 1 : (params[4] ?? 0),
        is_active: q.includes(", 1, 1)") ? 1 : (params[5] ?? 1),
      });
      return cb(null, { affectedRows: 1 });
    }

    if (q.startsWith("SELECT * FROM items WHERE company_id=? AND sku=? LIMIT 1")) {
      const row = state.items.find((item) => item.company_id === params[0] && item.sku === params[1]);
      return cb(null, row ? [row] : []);
    }

    if (q.startsWith("SELECT * FROM items WHERE company_id=? AND name=? LIMIT 1")) {
      const row = state.items.find((item) => item.company_id === params[0] && item.name === params[1]);
      return cb(null, row ? [row] : []);
    }

    if (q.startsWith("INSERT INTO items")) {
      state.items.push({
        id: params[0],
        company_id: params[1],
        name: params[2],
        sku: params[3],
        description: params[4],
        default_purchase_price: params[5],
        default_selling_price: params[6],
        is_active: 1,
      });
      return cb(null, { affectedRows: 1 });
    }

    if (q.startsWith("SELECT * FROM items WHERE id=? LIMIT 1")) {
      const row = state.items.find((item) => item.id === params[0]);
      return cb(null, row ? [row] : []);
    }

    if (q.includes("SELECT COALESCE(SUM(quantity_delta), 0) AS qty FROM stock_movements")) {
      const companyId = params[0];
      const itemId = params[1];
      const warehouseId = params[2];
      const qty = state.stockMovements
        .filter((movement) =>
          movement.company_id === companyId
          && movement.item_id === itemId
          && (warehouseId === undefined || movement.warehouse_id === warehouseId)
        )
        .reduce((sum, movement) => sum + Number(movement.quantity_delta || 0), 0);
      return cb(null, [{ qty }]);
    }

    if (q.includes("SELECT COALESCE(SUM(CASE WHEN quantity_delta > 0 THEN quantity_delta ELSE 0 END), 0) AS qty_in")) {
      const companyId = params[0];
      const itemId = params[1];
      const warehouseId = params[2];
      const filtered = state.stockMovements.filter((movement) =>
        movement.company_id === companyId
        && movement.item_id === itemId
        && (warehouseId === undefined || movement.warehouse_id === warehouseId)
      );
      const qtyIn = filtered
        .filter((movement) => Number(movement.quantity_delta || 0) > 0)
        .reduce((sum, movement) => sum + Number(movement.quantity_delta || 0), 0);
      const costIn = filtered
        .filter((movement) => Number(movement.quantity_delta || 0) > 0)
        .reduce((sum, movement) => sum + Number(movement.total_cost || 0), 0);
      return cb(null, [{ qty_in: qtyIn, cost_in: costIn }]);
    }

    if (q.startsWith("INSERT INTO stock_movements")) {
      state.stockMovements.push({
        id: params[0],
        company_id: params[1],
        item_id: params[2],
        warehouse_id: params[3],
        movement_type: params[4],
        quantity_delta: params[5],
        unit_cost: params[6],
        total_cost: params[7],
        reference_type: params[8],
        reference_id: params[9],
        reason: params[10],
        cost_layer_ref: params[11],
        created_by_user_id: params[12],
      });
      return cb(null, { affectedRows: 1 });
    }

    if (q.includes("FROM items i LEFT JOIN stock_movements sm")) {
      const companyId = params[0];
      const rows = state.items
        .filter((item) => item.company_id === companyId)
        .flatMap((item) => {
          const itemMovements = state.stockMovements.filter((movement) => movement.company_id === companyId && movement.item_id === item.id);
          if (!itemMovements.length) {
            return [{
              item_id: item.id,
              item_name: item.name,
              sku: item.sku,
              warehouse_id: null,
              warehouse_name: null,
              current_stock: 0,
              weighted_avg_cost: 0,
            }];
          }

          const grouped = new Map();
          for (const movement of itemMovements) {
            const key = movement.warehouse_id;
            const current = grouped.get(key) || { qty: 0, qtyIn: 0, costIn: 0 };
            current.qty += Number(movement.quantity_delta || 0);
            if (Number(movement.quantity_delta || 0) > 0) {
              current.qtyIn += Number(movement.quantity_delta || 0);
              current.costIn += Number(movement.total_cost || 0);
            }
            grouped.set(key, current);
          }

          return [...grouped.entries()].map(([warehouseId, aggregate]) => {
            const warehouse = state.warehouses.find((w) => w.id === warehouseId) || {};
            return {
              item_id: item.id,
              item_name: item.name,
              sku: item.sku,
              warehouse_id: warehouseId,
              warehouse_name: warehouse.name || null,
              current_stock: aggregate.qty,
              weighted_avg_cost: aggregate.qtyIn > 0 ? aggregate.costIn / aggregate.qtyIn : 0,
            };
          });
        });
      return cb(null, rows);
    }

    return cb(new Error(`Unhandled SQL in inventory ledger test fake: ${q}`));
  };

  return {
    state,
    query,
    beginTransaction(cb) { cb(null); },
    commit(cb) { cb(null); },
    rollback(cb) { cb(); },
  };
}

test("creating an inventory item does not imply stock on hand", async () => {
  const inventoryRepository = {
    async findLinkedVendor() {
      return { id: "vendor-link-1", vendor_name: "Vendor A" };
    },
    async findVendorById() {
      return { id: "vendor-link-1", vendor_name: "Vendor A", linked_profile_id: "vendor-profile-1" };
    },
    async findItemById(_companyId, itemId) {
      return { id: itemId, name: "Widget" };
    },
    async clearPreferredItemVendorLinks() {},
    async createItemVendorLink(record) {
      return record;
    },
    async findVendorProduct() {
      return { id: "vp-1", product_name: "Widget", sku: "W-1", category: "Tools", description: "Widget desc", tax_rate: 13 };
    },
    async insertInventory(record) {
      return record;
    },
  };

  const inventoryLedgerService = {
    async findOrCreateItem() {
      return { id: "item-1", name: "Widget", sku: "W-1" };
    },
    async getCurrentStock() {
      return 0;
    },
  };

  const service = new InventoryService({
    inventoryRepository,
    inventoryLedgerService,
    counterpartyService: createCounterpartyService(),
    idFactory: createIdFactory("inv"),
  });

  const created = await service.createInventory("user-1", {
    linked_vendor_profile_id: "vendor-profile-1",
    vendor_product_id: "vp-1",
    stock_quantity: 99,
    purchase_price: 10,
    selling_price: 15,
  });

  assert.equal(created.item_id, "item-1");
  assert.equal(created.stock_quantity, 0);
});

test("stock adjustment changes ledger-derived balance correctly", async () => {
  const db = createInventoryDb();
  const ledger = new InventoryLedgerService(db);
  const newId = createIdFactory("x");

  const item = await ledger.findOrCreateItem({
    companyId: "company-1",
    name: "Adjustable Item",
    sku: "ADJ-1",
    newId,
  });

  await ledger.createOpeningBalance({
    companyId: "company-1",
    itemId: item.id,
    quantity: 5,
    unitCost: 20,
    createdByUserId: "user-1",
    newId,
  });

  await ledger.applyAdjustment({
    companyId: "company-1",
    itemId: item.id,
    quantityDelta: -2,
    reason: "Shrinkage",
    createdByUserId: "user-1",
    newId,
  });

  const balance = await ledger.getCurrentStock("company-1", item.id);
  assert.equal(balance, 3);
});

test("stock transfer preserves total stock across warehouses", async () => {
  const db = createInventoryDb();
  const ledger = new InventoryLedgerService(db);
  const newId = createIdFactory("t");

  const item = await ledger.findOrCreateItem({
    companyId: "company-1",
    name: "Transfer Item",
    sku: "TR-1",
    newId,
  });

  db.state.warehouses.push(
    { id: "wh-1", company_id: "company-1", name: "Main", code: "MAIN", is_default: 1, is_active: 1 },
    { id: "wh-2", company_id: "company-1", name: "Secondary", code: "SEC", is_default: 0, is_active: 1 }
  );

  await ledger.createOpeningBalance({
    companyId: "company-1",
    itemId: item.id,
    quantity: 10,
    unitCost: 5,
    warehouseId: "wh-1",
    createdByUserId: "user-1",
    newId,
  });

  await ledger.applyTransfer({
    companyId: "company-1",
    itemId: item.id,
    fromWarehouseId: "wh-1",
    toWarehouseId: "wh-2",
    quantity: 4,
    createdByUserId: "user-1",
    newId,
  });

  const mainBalance = await ledger.getCurrentStock("company-1", item.id, "wh-1");
  const secondaryBalance = await ledger.getCurrentStock("company-1", item.id, "wh-2");
  const totalBalance = await ledger.getCurrentStock("company-1", item.id);

  assert.equal(mainBalance, 6);
  assert.equal(secondaryBalance, 4);
  assert.equal(totalBalance, 10);
});

test("stock balance listing comes from stock movements", async () => {
  const db = createInventoryDb();
  const ledger = new InventoryLedgerService(db);
  const newId = createIdFactory("b");

  db.state.warehouses.push({ id: "wh-1", company_id: "company-1", name: "Main", code: "MAIN", is_default: 1, is_active: 1 });
  const item = await ledger.findOrCreateItem({
    companyId: "company-1",
    name: "Balance Item",
    sku: "BAL-1",
    newId,
  });

  await ledger.createOpeningBalance({
    companyId: "company-1",
    itemId: item.id,
    quantity: 7,
    unitCost: 9,
    warehouseId: "wh-1",
    createdByUserId: "user-1",
    newId,
  });

  const balances = await ledger.getStockBalances("company-1");
  assert.equal(balances.length, 1);
  assert.equal(Number(balances[0].current_stock), 7);
});
