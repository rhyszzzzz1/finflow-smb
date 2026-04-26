"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { PurchaseOrderService } = require("../services/purchaseOrderService");
const { GoodsReceiptService } = require("../services/goodsReceiptService");
const { PurchaseBillService } = require("../services/purchaseBillService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createProcurementPool(initialState = {}) {
  const state = {
    purchaseOrderHeaders: initialState.purchaseOrderHeaders || [],
    purchaseOrderLines: initialState.purchaseOrderLines || [],
    goodsReceiptHeaders: initialState.goodsReceiptHeaders || [],
    goodsReceiptLines: initialState.goodsReceiptLines || [],
    purchaseBillHeaders: initialState.purchaseBillHeaders || [],
    purchaseBillLines: initialState.purchaseBillLines || [],
    stockMovements: initialState.stockMovements || [],
  };

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT id FROM companies")) {
      const companyId = params[0];
      const knownCompanyIds = new Set([
        ...state.purchaseOrderHeaders.map((row) => row.company_id),
        ...state.goodsReceiptHeaders.map((row) => row.company_id),
        ...state.purchaseBillHeaders.map((row) => row.company_id),
      ].filter(Boolean));
      return [[knownCompanyIds.has(companyId) ? { id: companyId } : null].filter(Boolean)];
    }

    if (q.startsWith("DELETE FROM purchase_order_lines WHERE purchase_order_id = ?")) {
      state.purchaseOrderLines = state.purchaseOrderLines.filter((line) => line.purchase_order_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO purchase_order_lines")) {
      state.purchaseOrderLines.push({
        id: params[0],
        purchase_order_id: params[1],
        line_no: params[2],
        item_id: params[3],
        description: params[4],
        ordered_quantity: params[5],
        unit_cost: params[6],
        line_total: params[7],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO purchase_order_headers")) {
      state.purchaseOrderHeaders.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        order_no: params[3],
        business_relationship_id: params[4],
        counterparty_id: params[5],
        vendor_id: params[6],
        vendor_name: params[7],
        vendor_legal_name: params[8],
        vendor_pan_vat_number: params[9],
        vendor_email: params[10],
        vendor_phone: params[11],
        vendor_address: params[12],
        order_date: params[13],
        expected_date: params[14],
        status: "draft",
        subtotal_amount: params[15],
        total_amount: params[16],
        notes: params[17],
        sequence_id: params[18],
        created_by_user_id: params[19],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM purchase_order_headers WHERE id = ? AND user_id = ? LIMIT 1")
      || q.startsWith("SELECT * FROM purchase_order_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM purchase_order_headers WHERE id = ? AND user_id = ?")) {
      const row = state.purchaseOrderHeaders.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM purchase_order_headers WHERE id = ?")) {
      const row = state.purchaseOrderHeaders.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM purchase_order_headers WHERE user_id = ?")) {
      return [state.purchaseOrderHeaders.filter((header) => header.user_id === params[0])];
    }
    if (q.startsWith("SELECT * FROM purchase_order_lines WHERE purchase_order_id = ?")) {
      return [state.purchaseOrderLines.filter((line) => line.purchase_order_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(grl.received_quantity), 0) AS received_quantity")) {
      const purchaseOrderLineId = params[0];
      const relevant = state.goodsReceiptLines.filter((line) => line.purchase_order_line_id === purchaseOrderLineId)
        .filter((line) => {
          const header = state.goodsReceiptHeaders.find((entry) => entry.id === line.goods_receipt_id);
          return header?.status === "posted";
        });
      return [[{ received_quantity: relevant.reduce((sum, line) => sum + Number(line.received_quantity || 0), 0) }]];
    }
    if (q.startsWith("SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity FROM purchase_bill_lines pbl JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id WHERE pbl.purchase_order_line_id = ?")) {
      const purchaseOrderLineId = params[0];
      const relevant = state.purchaseBillLines.filter((line) => line.purchase_order_line_id === purchaseOrderLineId)
        .filter((line) => {
          const header = state.purchaseBillHeaders.find((entry) => entry.id === line.purchase_bill_id);
          return ["approved", "posted", "partially_paid", "paid", "overdue"].includes(header?.status);
        });
      return [[{ billed_quantity: relevant.reduce((sum, line) => sum + Number(line.quantity || 0), 0) }]];
    }

    if (q.startsWith("SELECT pol.*, poh.user_id FROM purchase_order_lines pol JOIN purchase_order_headers poh ON poh.id = pol.purchase_order_id WHERE pol.id = ?")) {
      const line = state.purchaseOrderLines.find((entry) => entry.id === params[0]);
      if (!line) return [[]];
      const header = state.purchaseOrderHeaders.find((entry) => entry.id === line.purchase_order_id);
      return [[{ ...line, user_id: header?.user_id || null }]];
    }

    if (q.startsWith("DELETE FROM goods_receipt_lines WHERE goods_receipt_id = ?")) {
      state.goodsReceiptLines = state.goodsReceiptLines.filter((line) => line.goods_receipt_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO goods_receipt_lines")) {
      state.goodsReceiptLines.push({
        id: params[0],
        goods_receipt_id: params[1],
        line_no: params[2],
        purchase_order_line_id: params[3],
        item_id: params[4],
        description: params[5],
        ordered_quantity_snapshot: params[6],
        received_quantity: params[7],
        unit_cost: params[8],
        line_total: params[9],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("UPDATE goods_receipt_lines SET item_id = ? WHERE id = ?")) {
      const line = state.goodsReceiptLines.find((entry) => entry.id === params[1]);
      if (line) line.item_id = params[0];
      return [{ affectedRows: line ? 1 : 0 }];
    }
    if (q.startsWith("INSERT INTO goods_receipt_headers")) {
      state.goodsReceiptHeaders.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        receipt_no: params[3],
        purchase_order_id: params[4],
        business_relationship_id: params[5],
        counterparty_id: params[6],
        vendor_id: params[7],
        vendor_name: params[8],
        vendor_legal_name: params[9],
        vendor_pan_vat_number: params[10],
        vendor_email: params[11],
        vendor_phone: params[12],
        vendor_address: params[13],
        receipt_date: params[14],
        status: "draft",
        notes: params[15],
        sequence_id: params[16],
        created_by_user_id: params[17],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM goods_receipt_headers WHERE id = ? AND user_id = ? LIMIT 1")
      || q.startsWith("SELECT * FROM goods_receipt_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM goods_receipt_headers WHERE id = ? AND user_id = ?")) {
      const row = state.goodsReceiptHeaders.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM goods_receipt_headers WHERE id = ?")) {
      const row = state.goodsReceiptHeaders.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM goods_receipt_lines WHERE goods_receipt_id = ?")) {
      return [state.goodsReceiptLines.filter((line) => line.goods_receipt_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity FROM purchase_bill_lines pbl JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id WHERE pbl.goods_receipt_line_id = ?")) {
      const goodsReceiptLineId = params[0];
      const relevant = state.purchaseBillLines.filter((line) => line.goods_receipt_line_id === goodsReceiptLineId)
        .filter((line) => {
          const header = state.purchaseBillHeaders.find((entry) => entry.id === line.purchase_bill_id);
          return ["approved", "posted", "partially_paid", "paid", "overdue"].includes(header?.status);
        });
      return [[{ billed_quantity: relevant.reduce((sum, line) => sum + Number(line.quantity || 0), 0) }]];
    }
    if (q.startsWith("UPDATE goods_receipt_headers SET status = 'posted'")) {
      const row = state.goodsReceiptHeaders.find((entry) => entry.id === params[1]);
      if (row) row.status = "posted";
      if (row) row.posted_journal_entry_id = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT grl.*, grh.user_id FROM goods_receipt_lines grl JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id WHERE grl.id = ?")) {
      const line = state.goodsReceiptLines.find((entry) => entry.id === params[0]);
      if (!line) return [[]];
      const header = state.goodsReceiptHeaders.find((entry) => entry.id === line.goods_receipt_id);
      return [[{ ...line, user_id: header?.user_id || null }]];
    }
    if (q.startsWith("SELECT grl.*, grh.company_id, grh.user_id, grh.status AS goods_receipt_status, grh.receipt_no FROM goods_receipt_lines grl JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id WHERE grl.id = ? AND grh.company_id = ?")) {
      const line = state.goodsReceiptLines.find((entry) => entry.id === params[0]);
      if (!line) return [[]];
      const header = state.goodsReceiptHeaders.find((entry) => entry.id === line.goods_receipt_id && entry.company_id === params[1]);
      return [[header ? { ...line, company_id: header.company_id, user_id: header.user_id, goods_receipt_status: header.status, receipt_no: header.receipt_no } : null].filter(Boolean)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(pbl.quantity), 0) AS billed_quantity FROM purchase_bill_lines pbl JOIN purchase_bill_headers pbh ON pbh.id = pbl.purchase_bill_id WHERE pbl.goods_receipt_line_id = ? AND pbh.id <> ?")) {
      const goodsReceiptLineId = params[0];
      const currentBillId = params[1];
      const relevant = state.purchaseBillLines.filter((line) => line.goods_receipt_line_id === goodsReceiptLineId && line.purchase_bill_id !== currentBillId);
      return [[{ billed_quantity: relevant.reduce((sum, line) => sum + Number(line.quantity || 0), 0) }]];
    }
    if (q.startsWith("DELETE FROM purchase_bill_lines WHERE purchase_bill_id = ?")) {
      state.purchaseBillLines = state.purchaseBillLines.filter((line) => line.purchase_bill_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO purchase_bill_lines")) {
      state.purchaseBillLines.push({
        id: params[0],
        purchase_bill_id: params[1],
        line_no: params[2],
        purchase_order_line_id: params[3],
        goods_receipt_line_id: params[4],
        item_id: params[5],
        description: params[6],
        quantity: params[7],
        unit_cost: params[8],
        discount_type: params[9],
        discount_value: params[10],
        discount_amount: params[11],
        tax_code_id: params[12],
        tax_rate: params[13],
        line_subtotal: params[14],
        line_tax_amount: params[15],
        line_total: params[16],
        expense_account_id: params[17],
        inventory_account_id: params[18],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO purchase_bill_headers")) {
      state.purchaseBillHeaders.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        bill_no: params[3],
        purchase_order_id: params[4],
        goods_receipt_id: params[5],
        business_relationship_id: params[6],
        counterparty_id: params[7],
        vendor_id: params[8],
        vendor_name: params[9],
        vendor_legal_name: params[10],
        vendor_pan_vat_number: params[11],
        vendor_email: params[12],
        vendor_phone: params[13],
        vendor_address: params[14],
        bill_date: params[15],
        due_date: params[16],
        status: "draft",
        subtotal_amount: params[17],
        discount_amount: params[18],
        taxable_amount: params[19],
        tax_amount: params[20],
        total_amount: params[21],
        notes: params[22],
        sequence_id: params[23],
        created_by_user_id: params[24],
        posted_journal_entry_id: null,
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ?")) {
      const row = state.purchaseBillHeaders.find((entry) => entry.id === params[0] && entry.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ?")) {
      const row = state.purchaseBillHeaders.find((entry) => entry.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM purchase_bill_lines WHERE purchase_bill_id = ?")) {
      return [state.purchaseBillLines.filter((line) => line.purchase_bill_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='outgoing'")) {
      return [[{ allocated_amount: 0 }]];
    }
    if (q.startsWith("UPDATE purchase_bill_headers SET status = 'posted'")) {
      const row = state.purchaseBillHeaders.find((entry) => entry.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT COALESCE(SUM(received_quantity), 0) AS expected_qty,")) {
      const goodsReceiptId = params[0];
      const itemId = params[1];
      const relevant = state.goodsReceiptLines.filter(
        (line) => line.goods_receipt_id === goodsReceiptId && line.item_id === itemId
      );
      const expected_qty = relevant.reduce((sum, line) => sum + Number(line.received_quantity || 0), 0);
      const expected_cost = relevant.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
      return [[{ expected_qty, expected_cost }]];
    }

    if (q.startsWith("SELECT COALESCE(SUM(quantity_delta), 0) AS moved_qty")) {
      const [companyId, itemId, referenceType, referenceId] = params;
      const moved_qty = state.stockMovements
        .filter(
          (m) =>
            m.company_id === companyId &&
            m.item_id === itemId &&
            m.reference_type === referenceType &&
            m.reference_id === referenceId
        )
        .reduce((sum, m) => sum + Number(m.quantity_delta || 0), 0);
      return [[{ moved_qty }]];
    }

    throw new Error(`Unhandled SQL in procurement test fake: ${q}`);
  };

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    execute,
  };

  return {
    state,
    async getConnection() {
      return conn;
    },
    async execute(sql, params = []) {
      return execute(sql, params);
    },
  };
}

function createCounterpartyStub(companyId = null) {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      return companyId || actorUserId;
    },
    async resolveVendorSnapshot(_conn, _actorUserId, _companyId, vendorId) {
      return {
        id: vendorId || "vendor-1",
        display_name: "Vendor A",
        legal_name: "Vendor A Pvt Ltd",
        pan_vat_number: "VAT-123",
        email: "vendor@example.com",
        phone: "9800000000",
        address: "Kathmandu",
      };
    },
  };
}

function createControlStub(prefix) {
  let count = 1;
  return {
    async nextDocumentNumber() {
      return {
        documentNumber: `${prefix}-${String(count++).padStart(4, "0")}`,
        sequenceId: `seq-${prefix}-${count}`,
      };
    },
    async validatePostingDate() {
      return { id: "period-1" };
    },
  };
}

test("create PO stores operational quantities without stock side effects", async () => {
  const pool = createProcurementPool();
  const service = new PurchaseOrderService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PO"),
    idFactory: (() => {
      let i = 1;
      return () => `po-id-${i++}`;
    })(),
  });

  const created = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    order_date: "2026-04-05",
    expected_date: "2026-04-10",
    lines: [
      { item_id: "item-1", description: "Widget", ordered_quantity: 10, unit_cost: 50 },
    ],
  });

  assert.equal(created.order_no, "PO-0001");
  assert.equal(created.lines.length, 1);
  assert.equal(created.lines[0].ordered_quantity, 10);
  assert.equal(created.lines[0].received_quantity, 0);
  assert.equal(created.lines[0].billed_quantity, 0);
});

test("partial goods receipt posts stock and PO quantities stay coherent", async () => {
  const pool = createProcurementPool({
    purchaseOrderHeaders: [{
      id: "po-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      order_no: "PO-1001",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      order_date: "2026-04-05",
      expected_date: "2026-04-10",
      status: "approved",
      subtotal_amount: 500,
      total_amount: 500,
    }],
    purchaseOrderLines: [{
      id: "po-line-1",
      purchase_order_id: "po-1",
      line_no: 1,
      item_id: "item-1",
      description: "Widget",
      ordered_quantity: 10,
      unit_cost: 50,
      line_total: 500,
    }],
  });

  const inventoryCalls = [];
  const journalCalls = [];
  const receiptService = new GoodsReceiptService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("GR"),
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-gr-1" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    inventoryLedgerService: {
      async applyPurchaseReceipt(args) {
        inventoryCalls.push(args);
        return { applied: true, item_id: args.itemId };
      },
    },
    idFactory: (() => {
      let i = 1;
      return () => `gr-id-${i++}`;
    })(),
  });
  const poService = new PurchaseOrderService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PO"),
    idFactory: (() => {
      let i = 50;
      return () => `po-id-${i++}`;
    })(),
  });

  const draftReceipt = await receiptService.createDraft("buyer-1", {
    purchase_order_id: "po-1",
    lines: [
      { purchase_order_line_id: "po-line-1", received_quantity: 4, unit_cost: 50 },
    ],
  });
  const postedReceipt = await receiptService.post("buyer-1", draftReceipt.id, {});
  const po = await poService.getById("buyer-1", "po-1");

  assert.equal(postedReceipt.base_status, "posted");
  assert.equal(inventoryCalls.length, 1);
  assert.equal(inventoryCalls[0].referenceType, "goods_receipt");
  assert.equal(journalCalls.length, 2);
  assert.equal(journalCalls[0].args.lines[0].accountCode, "1200-INVENTORY");
  assert.equal(journalCalls[0].args.lines[1].accountCode, "2150-GRNI");
  assert.equal(po.lines[0].received_quantity, 4);
  assert.equal(po.lines[0].outstanding_receive_quantity, 6);
  assert.equal(po.status, "partially_received");
});

test("goods receipt allows PO lines without item_id and persists resolved item on post", async () => {
  const pool = createProcurementPool({
    purchaseOrderHeaders: [{
      id: "po-no-item",
      company_id: "buyer-1",
      user_id: "buyer-1",
      order_no: "PO-NOITEM",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      order_date: "2026-04-05",
      expected_date: "2026-04-10",
      status: "approved",
      subtotal_amount: 100,
      total_amount: 100,
    }],
    purchaseOrderLines: [{
      id: "po-line-no-item",
      purchase_order_id: "po-no-item",
      line_no: 1,
      item_id: null,
      description: "Description-only line",
      ordered_quantity: 5,
      unit_cost: 20,
      line_total: 100,
    }],
  });

  const inventoryCalls = [];
  const journalCalls = [];
  const receiptService = new GoodsReceiptService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("GR"),
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-gr-no-item" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    inventoryLedgerService: {
      async applyPurchaseReceipt(args) {
        inventoryCalls.push(args);
        return { applied: true, item_id: args.itemId || "resolved-item-xyz" };
      },
    },
    idFactory: (() => {
      let i = 300;
      return () => `gr-no-item-${i++}`;
    })(),
  });

  const draft = await receiptService.createDraft("buyer-1", {
    purchase_order_id: "po-no-item",
    lines: [
      { purchase_order_line_id: "po-line-no-item", received_quantity: 2, unit_cost: 20 },
    ],
  });

  assert.equal(draft.lines[0].item_id, null);
  assert.equal(draft.lines[0].description, "Description-only line");

  await receiptService.post("buyer-1", draft.id, {});

  assert.equal(inventoryCalls.length, 1);
  assert.equal(inventoryCalls[0].itemId, null);
  assert.equal(inventoryCalls[0].productName, "Description-only line");

  const grLine = pool.state.goodsReceiptLines.find((l) => l.goods_receipt_id === draft.id);
  assert.ok(grLine);
  assert.equal(grLine.item_id, "resolved-item-xyz");
});

test("purchase bill against receipt does not create duplicate stock receipt", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      receipt_no: "GR-1001",
      purchase_order_id: "po-1",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      receipt_date: "2026-04-05",
      status: "posted",
    }],
    goodsReceiptLines: [{
      id: "gr-line-1",
      goods_receipt_id: "gr-1",
      line_no: 1,
      purchase_order_line_id: "po-line-1",
      item_id: "item-1",
      description: "Widget",
      ordered_quantity_snapshot: 10,
      received_quantity: 4,
      unit_cost: 50,
      line_total: 200,
    }],
    purchaseOrderHeaders: [{
      id: "po-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      order_no: "PO-1001",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      status: "approved",
    }],
    purchaseOrderLines: [{
      id: "po-line-1",
      purchase_order_id: "po-1",
      line_no: 1,
      item_id: "item-1",
      description: "Widget",
      ordered_quantity: 10,
      unit_cost: 50,
    }],
    stockMovements: [{
      company_id: "buyer-1",
      item_id: "item-1",
      reference_type: "goods_receipt",
      reference_id: "gr-1",
      quantity_delta: 4,
    }],
  });

  let duplicateInventoryReceipt = false;
  const journalCalls = [];
  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-1" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 200,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        duplicateInventoryReceipt = true;
        return { applied: true };
      },
    },
    idFactory: (() => {
      let i = 1;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    purchase_order_id: "po-1",
    goods_receipt_id: "gr-1",
    lines: [
      { goods_receipt_line_id: "gr-line-1", quantity: 4, unit_cost: 50, item_id: "item-1" },
    ],
  });
  const posted = await service.post("buyer-1", draft.id, {});

  assert.equal(draft.lines[0].goods_receipt_line_id, "gr-line-1");
  assert.equal(posted.base_status, "posted");
  assert.equal(duplicateInventoryReceipt, false);
  assert.equal(journalCalls[0].args.lines[0].accountCode, "2150-GRNI");
  assert.equal(journalCalls[0].args.lines[0].debit, 200);
  assert.equal(journalCalls[0].args.lines.at(-1).accountCode, "2100-AP");
});

test("GRN-linked purchase bill backfills stock when posted receipt has no ledger movements", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-backfill-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      receipt_no: "GR-BACKFILL-1",
      purchase_order_id: "po-bf-1",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      receipt_date: "2026-04-05",
      status: "posted",
    }],
    goodsReceiptLines: [{
      id: "gr-backfill-line-1",
      goods_receipt_id: "gr-backfill-1",
      line_no: 1,
      purchase_order_line_id: "po-bf-line-1",
      item_id: "item-bf-1",
      description: "Widget",
      ordered_quantity_snapshot: 5,
      received_quantity: 5,
      unit_cost: 40,
      line_total: 200,
    }],
    stockMovements: [],
  });

  const inventoryCalls = [];
  const journalCalls = [];
  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-bf-1" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 200,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt(args) {
        inventoryCalls.push(args);
        return { applied: true, item_id: args.itemId };
      },
    },
    idFactory: (() => {
      let i = 200;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    goods_receipt_id: "gr-backfill-1",
    lines: [
      { goods_receipt_line_id: "gr-backfill-line-1", quantity: 5, unit_cost: 40, item_id: "item-bf-1" },
    ],
  });
  const posted = await service.post("buyer-1", draft.id, {});

  assert.equal(posted.base_status, "posted");
  assert.equal(inventoryCalls.length, 1);
  assert.equal(inventoryCalls[0].quantity, 5);
  assert.equal(inventoryCalls[0].referenceType, "goods_receipt");
  assert.equal(inventoryCalls[0].referenceId, "gr-backfill-1");
  assert.equal(inventoryCalls[0].itemId, "item-bf-1");
});

test("direct inventory bill without receipt still debits inventory", async () => {
  const pool = createProcurementPool();
  const journalCalls = [];
  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-direct-1" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 150,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        return { applied: true };
      },
    },
    idFactory: (() => {
      let i = 10;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    lines: [
      { item_id: "item-2", description: "Raw Material", quantity: 3, unit_cost: 50 },
    ],
  });
  await service.post("buyer-1", draft.id, {});

  assert.equal(journalCalls[0].args.lines[0].accountCode, "1200-INVENTORY");
  assert.equal(journalCalls[0].args.lines.at(-1).accountCode, "2100-AP");
});

test("partial billing against receipt clears only billed portion of GRNI", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-2",
      company_id: "buyer-1",
      user_id: "buyer-1",
      receipt_no: "GR-1002",
      purchase_order_id: "po-2",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      receipt_date: "2026-04-05",
      status: "posted",
    }],
    goodsReceiptLines: [{
      id: "gr-line-2",
      goods_receipt_id: "gr-2",
      line_no: 1,
      purchase_order_line_id: "po-line-2",
      item_id: "item-2",
      description: "Widget",
      ordered_quantity_snapshot: 10,
      received_quantity: 4,
      unit_cost: 50,
      line_total: 200,
    }],
    stockMovements: [{
      company_id: "buyer-1",
      item_id: "item-2",
      reference_type: "goods_receipt",
      reference_id: "gr-2",
      quantity_delta: 4,
    }],
  });

  const journalCalls = [];
  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-2" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 100,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        return { applied: true };
      },
    },
    idFactory: (() => {
      let i = 20;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    goods_receipt_id: "gr-2",
    lines: [
      { goods_receipt_line_id: "gr-line-2", quantity: 2, unit_cost: 50, item_id: "item-2" },
    ],
  });
  await service.post("buyer-1", draft.id, {});

  assert.equal(journalCalls[0].args.lines[0].accountCode, "2150-GRNI");
  assert.equal(journalCalls[0].args.lines[0].debit, 100);
});

test("service bill without inventory uses expense accounting and not GRNI", async () => {
  const pool = createProcurementPool();
  const journalCalls = [];
  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry(args) {
        journalCalls.push({ type: "create", args });
        return { id: "je-exp-1" };
      },
      async postJournalEntry(args) {
        journalCalls.push({ type: "post", args });
        return { id: args.journalEntryId };
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 80,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        throw new Error("Inventory should not be touched for service bills");
      },
    },
    idFactory: (() => {
      let i = 30;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    lines: [
      { description: "Consulting", quantity: 1, unit_cost: 80, expense_account_id: "5105-SERVICES" },
    ],
  });
  await service.post("buyer-1", draft.id, {});

  assert.equal(journalCalls[0].args.lines[0].accountId, "5105-SERVICES");
  assert.equal(journalCalls[0].args.lines[0].accountCode, undefined);
});

test("goods receipt posting failure leaves receipt unposted", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-fail-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      receipt_no: "GR-FAIL-1",
      purchase_order_id: "po-1",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      receipt_date: "2026-04-05",
      status: "draft",
    }],
    goodsReceiptLines: [{
      id: "gr-fail-line-1",
      goods_receipt_id: "gr-fail-1",
      line_no: 1,
      purchase_order_line_id: "po-line-1",
      item_id: "item-1",
      description: "Widget",
      ordered_quantity_snapshot: 4,
      received_quantity: 4,
      unit_cost: 50,
      line_total: 200,
    }],
  });

  const receiptService = new GoodsReceiptService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("GR"),
    journalService: {
      async createJournalEntry() {
        return { id: "je-gr-fail-1" };
      },
      async postJournalEntry(args) {
        return { id: args.journalEntryId };
      },
    },
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        throw new Error("Cannot post goods receipt: stock application failed");
      },
    },
  });

  await assert.rejects(
    () => receiptService.post("buyer-1", "gr-fail-1", {}),
    /stock application failed/
  );
  assert.equal(pool.state.goodsReceiptHeaders[0].status, "draft");
  assert.equal(pool.state.goodsReceiptHeaders[0].posted_journal_entry_id, undefined);
});

test("purchase bill account resolution failure for GRNI-linked line leaves bill unposted", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-acc-1",
      company_id: "buyer-1",
      user_id: "buyer-1",
      receipt_no: "GR-ACC-1",
      purchase_order_id: "po-1",
      counterparty_id: "vendor-1",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
      receipt_date: "2026-04-05",
      status: "posted",
    }],
    goodsReceiptLines: [{
      id: "gr-acc-line-1",
      goods_receipt_id: "gr-acc-1",
      line_no: 1,
      purchase_order_line_id: "po-line-1",
      item_id: "item-1",
      description: "Widget",
      ordered_quantity_snapshot: 2,
      received_quantity: 2,
      unit_cost: 50,
      line_total: 100,
    }],
  });

  const service = new PurchaseBillService(pool, {
    journalService: {
      async createJournalEntry() {
        throw new Error("Cannot post purchase bill: required GRNI account is missing.");
      },
      async postJournalEntry() {
        throw new Error("unreachable");
      },
    },
    taxService: {
      async calculateLineTax() {
        return {
          tax_code_id: null,
          tax_rate: 0,
          taxable_amount: 100,
          tax_amount: 0,
        };
      },
      async buildInputTaxPostings() {
        return [];
      },
      async recordTaxTransactionsForPurchaseBill() {},
    },
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("PB"),
    inventoryLedgerService: {
      async applyPurchaseReceipt() {
        return { applied: true };
      },
    },
    idFactory: (() => {
      let i = 40;
      return () => `pb-id-${i++}`;
    })(),
  });

  const draft = await service.createDraft("buyer-1", {
    vendor_id: "vendor-1",
    bill_date: "2026-04-05",
    due_date: "2026-04-10",
    goods_receipt_id: "gr-acc-1",
    lines: [
      { goods_receipt_line_id: "gr-acc-line-1", quantity: 2, unit_cost: 50, item_id: "item-1" },
    ],
  });

  await assert.rejects(
    () => service.post("buyer-1", draft.id, {}),
    /GRNI account is missing/
  );
  assert.equal(pool.state.purchaseBillHeaders[0].status, "draft");
  assert.equal(pool.state.purchaseBillHeaders[0].posted_journal_entry_id, null);
});

test("GRN and bill posting use resolved companyId instead of actorUserId", async () => {
  const pool = createProcurementPool({
    goodsReceiptHeaders: [{
      id: "gr-scope-1",
      company_id: "company-buyer-1",
      user_id: "user-buyer-1",
      receipt_no: "GR-SCOPE-1",
      receipt_date: "2026-04-05",
      status: "draft",
      vendor_id: "vendor-1",
      vendor_name: "Vendor A",
    }],
    goodsReceiptLines: [{
      id: "gr-scope-line-1",
      goods_receipt_id: "gr-scope-1",
      line_no: 1,
      item_id: "item-1",
      description: "Scoped Widget",
      ordered_quantity_snapshot: 1,
      received_quantity: 1,
      unit_cost: 75,
      line_total: 75,
    }],
  });

  const receiptJournalCalls = [];
  const inventoryCalls = [];
  const companyAwareCounterparty = createCounterpartyStub("company-buyer-1");
  const receiptService = new GoodsReceiptService(pool, {
    counterpartyService: companyAwareCounterparty,
    accountingControlService: createControlStub("GR"),
    journalService: {
      async createJournalEntry(args) {
        receiptJournalCalls.push(args);
        return { id: "je-gr-scope-1" };
      },
      async postJournalEntry(args) {
        receiptJournalCalls.push(args);
        return { id: args.journalEntryId };
      },
    },
    inventoryLedgerService: {
      async applyPurchaseReceipt(args) {
        inventoryCalls.push(args);
        return { applied: true };
      },
    },
  });

  await receiptService.post("user-buyer-1", "gr-scope-1", {});

  assert.equal(receiptJournalCalls[0].companyId, "company-buyer-1");
  assert.equal(inventoryCalls[0].companyId, "company-buyer-1");
});
