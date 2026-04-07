"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SalesInvoiceService } = require("../services/salesInvoiceService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createFakePool(state) {
  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ?")) {
      const row = state.headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_lines")) {
      const rows = state.lines
        .filter((line) => line.sales_invoice_id === params[0])
        .sort((a, b) => a.line_no - b.line_no);
      return [rows];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='incoming'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET status = 'posted'")) {
      const row = state.headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    throw new Error(`Unhandled SQL in sales invoice COGS test fake: ${q}`);
  };

  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute,
  };

  return {
    async getConnection() {
      return conn;
    },
    async execute(sql, params = []) {
      return execute(sql, params);
    },
  };
}

function createJournalStub() {
  const calls = [];
  return {
    calls,
    async createJournalEntry(payload) {
      calls.push(payload);
      return { id: `je-${calls.length}` };
    },
    async postJournalEntry({ journalEntryId }) {
      return { id: journalEntryId };
    },
  };
}

function createTaxStub() {
  return {
    async buildOutputTaxPostings() {
      return [];
    },
    async recordTaxTransactionsForSalesInvoice() {},
  };
}

function createControlStub() {
  return {
    async validatePostingDate() {
      return { id: "period-1" };
    },
  };
}

function createCounterpartyService() {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      return actorUserId === "user-1" ? "company-1" : `company-for-${actorUserId}`;
    },
  };
}

function createInventoryStub(plan) {
  const applyCalls = [];
  return {
    applyCalls,
    async previewSaleIssue() {
      return plan;
    },
    async applySaleIssue(payload) {
      applyCalls.push(payload);
      return plan;
    },
  };
}

function createState(lines, headerOverrides = {}) {
  return {
    headers: [{
      id: "si-1",
      company_id: "company-1",
      user_id: "user-1",
      invoice_no: "SI-0001",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      invoice_date: "2026-04-04",
      due_date: "2026-04-10",
      status: "approved",
      taxable_amount: 1000,
      total_amount: 1000,
      posted_journal_entry_id: null,
      ...headerOverrides,
    }],
    lines,
  };
}

test("posting a stock item sale adds COGS and inventory journal lines", async () => {
  const state = createState([
    { sales_invoice_id: "si-1", line_no: 1, item_id: "item-1", description: "Stock item", quantity: 2, line_total: 1000 },
  ]);
  const pool = createFakePool(state);
  const journal = createJournalStub();
  const inventory = createInventoryStub({
    applied: true,
    total_cost: 400,
    movements: [{ item_id: "item-1", quantity_delta: -2, unit_cost: 200, total_cost: 400 }],
  });

  const service = new SalesInvoiceService(pool, {
    journalService: journal,
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: inventory,
  });

  await service.post("user-1", "si-1", {});

  const lines = journal.calls[0].lines;
  const cogsLine = lines.find((line) => line.accountCode === "5200-COGS");
  const inventoryLine = lines.find((line) => line.accountCode === "1200-INVENTORY" && line.credit === 400);

  assert.equal(cogsLine.debit, 400);
  assert.equal(inventoryLine.credit, 400);
  const debits = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credits = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  assert.equal(debits, credits);
  assert.equal(inventory.applyCalls[0].postAccounting, false);
});

test("posting a service-only sale does not create false inventory journal lines", async () => {
  const state = createState([
    { sales_invoice_id: "si-1", line_no: 1, item_id: null, description: "Service line", quantity: 1, line_total: 1000 },
  ]);
  const pool = createFakePool(state);
  const journal = createJournalStub();
  const inventory = createInventoryStub({ applied: false, total_cost: 0, movements: [] });

  const service = new SalesInvoiceService(pool, {
    journalService: journal,
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: inventory,
  });

  await service.post("user-1", "si-1", {});

  const lines = journal.calls[0].lines;
  assert.equal(lines.some((line) => line.accountCode === "5200-COGS"), false);
  assert.equal(lines.some((line) => line.accountCode === "1200-INVENTORY"), false);
  assert.equal(inventory.applyCalls.length, 0);
});

test("posting a mixed invoice sale adds revenue and aggregated COGS correctly", async () => {
  const state = createState([
    { sales_invoice_id: "si-1", line_no: 1, item_id: "item-1", description: "Stock item", quantity: 1, line_total: 600 },
    { sales_invoice_id: "si-1", line_no: 2, item_id: null, description: "Service line", quantity: 1, line_total: 400 },
  ]);
  const pool = createFakePool(state);
  const journal = createJournalStub();
  const inventory = createInventoryStub({
    applied: true,
    total_cost: 250,
    movements: [{ item_id: "item-1", quantity_delta: -1, unit_cost: 250, total_cost: 250 }],
  });

  const service = new SalesInvoiceService(pool, {
    journalService: journal,
    taxService: createTaxStub(),
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: inventory,
  });

  await service.post("user-1", "si-1", {});

  const lines = journal.calls[0].lines;
  const ar = lines.find((line) => line.accountCode === "1100-AR");
  const sales = lines.find((line) => line.accountCode === "4100-SALES");
  const cogs = lines.find((line) => line.accountCode === "5200-COGS");
  const inventoryReduction = lines.find((line) => line.accountCode === "1200-INVENTORY" && line.credit === 250);

  assert.equal(ar.debit, 1000);
  assert.equal(sales.credit, 1000);
  assert.equal(cogs.debit, 250);
  assert.equal(inventoryReduction.credit, 250);
  const debits = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credits = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  assert.equal(debits, credits);
});
