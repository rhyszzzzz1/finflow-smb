"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SalesInvoiceService } = require("../services/salesInvoiceService");
const { PurchaseBillService } = require("../services/purchaseBillService");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createTransactionalPool(initialState) {
  const state = clone(initialState);
  let txSnapshot = null;

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ?")) {
      const row = state.salesHeaders.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ?")) {
      const row = state.purchaseHeaders.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_lines")) {
      return [state.salesLines.filter((line) => line.sales_invoice_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_lines")) {
      return [state.purchaseLines.filter((line) => line.purchase_bill_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='incoming'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='outgoing'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET status = 'posted'")) {
      const row = state.salesHeaders.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET status = 'posted'")) {
      const row = state.purchaseHeaders.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.salesHeaders.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ?")) {
      const row = state.purchaseHeaders.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    throw new Error(`Unhandled SQL in atomic posting test fake: ${q}`);
  };

  const conn = {
    async beginTransaction() {
      txSnapshot = clone(state);
    },
    async commit() {
      txSnapshot = null;
    },
    async rollback() {
      if (txSnapshot) {
        Object.keys(state).forEach((key) => {
          state[key] = clone(txSnapshot[key]);
        });
        txSnapshot = null;
      }
    },
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

function createControlStub() {
  return {
    async validatePostingDate() {
      return { id: "period-1" };
    },
  };
}

function createTaxStub() {
  return {
    async buildOutputTaxPostings() {
      return [];
    },
    async buildInputTaxPostings() {
      return [];
    },
    async recordTaxTransactionsForSalesInvoice() {},
    async recordTaxTransactionsForPurchaseBill() {},
  };
}

function createJournalStub() {
  return {
    async createJournalEntry({ conn }) {
      assert.ok(conn, "journal creation should run inside the document transaction");
      return { id: "je-1" };
    },
    async postJournalEntry({ conn, journalEntryId }) {
      assert.ok(conn, "journal posting should run inside the document transaction");
      return { id: journalEntryId };
    },
  };
}

function createCounterpartyService(mapping = {}) {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      const companyId = mapping[actorUserId];
      if (!companyId) {
        throw new Error(`No company mapping found for actor ${actorUserId}`);
      }
      return companyId;
    },
  };
}

test("successful stock-affecting sales invoice post commits document and inventory together", async () => {
  const pool = createTransactionalPool({
    salesHeaders: [{
      id: "si-1",
      company_id: "company-1",
      user_id: "user-1",
      invoice_no: "SI-1001",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      invoice_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      taxable_amount: 1000,
      total_amount: 1000,
      posted_journal_entry_id: null,
    }],
    salesLines: [{ sales_invoice_id: "si-1", line_no: 1, item_id: "item-1", description: "Stock Item", quantity: 1 }],
    purchaseHeaders: [],
    purchaseLines: [],
  });

  let inventoryApplied = false;
  const inventoryStub = {
    async previewSaleIssue({ conn }) {
      assert.ok(conn);
      return { applied: true, total_cost: 300, movements: [{ item_id: "item-1", total_cost: 300, quantity_delta: -1, unit_cost: 300 }] };
    },
    async applySaleIssue({ conn, postAccounting }) {
      assert.ok(conn);
      assert.equal(postAccounting, false);
      inventoryApplied = true;
      return { applied: true, total_cost: 300, movements: [{ item_id: "item-1", total_cost: 300 }] };
    },
  };

  const service = new SalesInvoiceService(pool, {
    journalService: createJournalStub(),
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService({ "user-1": "company-1" }),
    inventoryLedgerService: inventoryStub,
  });

  const result = await service.post("user-1", "si-1", {});
  assert.equal(result.status, "posted");
  assert.equal(pool.state.salesHeaders[0].status, "posted");
  assert.equal(pool.state.salesHeaders[0].posted_journal_entry_id, "je-1");
  assert.equal(inventoryApplied, true);
});

test("inventory failure during sales post rolls back the whole invoice posting", async () => {
  const pool = createTransactionalPool({
    salesHeaders: [{
      id: "si-2",
      company_id: "company-1",
      user_id: "user-1",
      invoice_no: "SI-1002",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      invoice_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      taxable_amount: 1000,
      total_amount: 1000,
      posted_journal_entry_id: null,
    }],
    salesLines: [{ sales_invoice_id: "si-2", line_no: 1, item_id: "item-1", description: "Stock Item", quantity: 1 }],
    purchaseHeaders: [],
    purchaseLines: [],
  });

  const service = new SalesInvoiceService(pool, {
    journalService: createJournalStub(),
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService({ "user-1": "company-1" }),
    inventoryLedgerService: {
      async previewSaleIssue({ conn }) {
        assert.ok(conn);
        return { applied: true, total_cost: 300, movements: [{ item_id: "item-1", total_cost: 300, quantity_delta: -1, unit_cost: 300 }] };
      },
      async applySaleIssue() {
        throw new Error("Insufficient stock");
      },
    },
  });

  await assert.rejects(() => service.post("user-1", "si-2", {}), /Insufficient stock/);
  assert.equal(pool.state.salesHeaders[0].status, "approved");
  assert.equal(pool.state.salesHeaders[0].posted_journal_entry_id, null);
});

test("account resolution failure during stock-affecting sales post rolls back the whole invoice posting", async () => {
  const pool = createTransactionalPool({
    salesHeaders: [{
      id: "si-3",
      company_id: "company-1",
      user_id: "user-1",
      invoice_no: "SI-1003",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      invoice_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      taxable_amount: 1000,
      total_amount: 1000,
      posted_journal_entry_id: null,
    }],
    salesLines: [{ sales_invoice_id: "si-3", line_no: 1, item_id: "item-1", description: "Stock Item", quantity: 1 }],
    purchaseHeaders: [],
    purchaseLines: [],
  });

  let inventoryApplied = false;
  const service = new SalesInvoiceService(pool, {
    journalService: {
      async createJournalEntry() {
        throw new Error("Account not found for code: 5200-COGS");
      },
      async postJournalEntry() {
        throw new Error("Should not reach journal posting when account resolution fails");
      },
    },
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService({ "user-1": "company-1" }),
    inventoryLedgerService: {
      async previewSaleIssue({ conn }) {
        assert.ok(conn);
        return { applied: true, total_cost: 300, movements: [{ item_id: "item-1", total_cost: 300, quantity_delta: -1, unit_cost: 300 }] };
      },
      async applySaleIssue() {
        inventoryApplied = true;
      },
    },
  });

  await assert.rejects(() => service.post("user-1", "si-3", {}), /Account not found for code: 5200-COGS/);
  assert.equal(pool.state.salesHeaders[0].status, "approved");
  assert.equal(pool.state.salesHeaders[0].posted_journal_entry_id, null);
  assert.equal(inventoryApplied, false);
});

test("inventory failure during purchase bill post rolls back the whole bill posting", async () => {
  const pool = createTransactionalPool({
    salesHeaders: [],
    salesLines: [],
    purchaseHeaders: [{
      id: "pb-1",
      company_id: "company-1",
      user_id: "user-1",
      bill_no: "PB-1001",
      counterparty_id: "cp-v1",
      vendor_id: "cp-v1",
      vendor_name: "Vendor A",
      bill_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      total_amount: 500,
      posted_journal_entry_id: null,
    }],
    purchaseLines: [{
      purchase_bill_id: "pb-1",
      line_no: 1,
      item_id: "item-1",
      description: "Stock Purchase",
      quantity: 5,
      line_subtotal: 500,
      discount_amount: 0,
      inventory_account_id: "acct-inventory",
    }],
  });

  const service = new PurchaseBillService(pool, {
    journalService: createJournalStub(),
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService({ "user-1": "company-1" }),
    inventoryLedgerService: {
      async applyPurchaseReceipt({ conn }) {
        assert.ok(conn);
        throw new Error("Warehouse missing");
      },
    },
  });

  await assert.rejects(() => service.post("user-1", "pb-1", {}), /Warehouse missing/);
  assert.equal(pool.state.purchaseHeaders[0].status, "approved");
  assert.equal(pool.state.purchaseHeaders[0].posted_journal_entry_id, null);
});

test("sales posting resolves company scope from actor and does not leak stock across companies", async () => {
  const pool = createTransactionalPool({
    salesHeaders: [{
      id: "si-4",
      company_id: "company-b",
      user_id: "user-b",
      invoice_no: "SI-2001",
      counterparty_id: "cp-b",
      customer_id: "cp-b",
      customer_name: "Customer B",
      invoice_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      taxable_amount: 1000,
      total_amount: 1000,
      posted_journal_entry_id: null,
    }],
    salesLines: [{ sales_invoice_id: "si-4", line_no: 1, item_id: "item-b", description: "Scoped Item", quantity: 1 }],
    purchaseHeaders: [],
    purchaseLines: [],
  });

  const seenCompanyIds = [];
  const service = new SalesInvoiceService(pool, {
    journalService: {
      async createJournalEntry({ companyId, conn }) {
        seenCompanyIds.push(["journal.create", companyId]);
        assert.ok(conn);
        return { id: "je-4" };
      },
      async postJournalEntry({ companyId, conn, journalEntryId }) {
        seenCompanyIds.push(["journal.post", companyId]);
        assert.ok(conn);
        return { id: journalEntryId };
      },
    },
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService({ "user-b": "company-b" }),
    inventoryLedgerService: {
      async previewSaleIssue({ companyId, conn }) {
        seenCompanyIds.push(["inventory.preview", companyId]);
        assert.ok(conn);
        assert.equal(companyId, "company-b");
        return { applied: true, total_cost: 250, movements: [{ item_id: "item-b", total_cost: 250, quantity_delta: -1, unit_cost: 250 }] };
      },
      async applySaleIssue({ companyId, conn, postAccounting }) {
        seenCompanyIds.push(["inventory.apply", companyId]);
        assert.ok(conn);
        assert.equal(companyId, "company-b");
        assert.equal(postAccounting, false);
        return { applied: true, total_cost: 250, movements: [{ item_id: "item-b", total_cost: 250 }] };
      },
    },
  });

  const result = await service.post("user-b", "si-4", {});
  assert.equal(result.status, "posted");
  assert.deepEqual(seenCompanyIds, [
    ["inventory.preview", "company-b"],
    ["journal.create", "company-b"],
    ["journal.post", "company-b"],
    ["inventory.apply", "company-b"],
  ]);
});
