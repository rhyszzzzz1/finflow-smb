"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SalesCreditNoteService } = require("../services/salesCreditNoteService");
const { PurchaseDebitNoteService } = require("../services/purchaseDebitNoteService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createSalesCreditNotePool(state) {
  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_credit_note_headers WHERE id = ? AND user_id = ?")) {
      const row = state.headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_credit_note_lines WHERE sales_credit_note_id = ?")) {
      return [state.lines.filter((line) => line.sales_credit_note_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT ABS(COALESCE(SUM(quantity_delta), 0)) AS issued_quantity")) {
      const relevant = state.stockMovements.filter((movement) =>
        movement.company_id === params[0] && movement.reference_type === "sales_invoice" && movement.reference_id === params[1] && movement.item_id === params[2]
      );
      const issuedQuantity = Math.abs(relevant.reduce((sum, movement) => sum + Number(movement.quantity_delta || 0), 0));
      const issuedCost = Math.abs(relevant.reduce((sum, movement) => sum + Number(movement.total_cost || 0), 0));
      return [[{ issued_quantity: issuedQuantity, issued_cost: issuedCost }]];
    }

    if (q.startsWith("UPDATE sales_credit_note_headers SET status = 'posted'")) {
      const row = state.headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT * FROM sales_credit_note_headers WHERE id = ?")) {
      const row = state.headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    throw new Error(`Unhandled SQL in sales credit note test fake: ${q}`);
  };

  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute,
  };

  return {
    async getConnection() { return conn; },
    async execute(sql, params = []) { return execute(sql, params); },
  };
}

function createPurchaseDebitNotePool(state) {
  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM purchase_debit_note_headers WHERE id = ? AND user_id = ?")) {
      const row = state.headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM purchase_debit_note_lines WHERE purchase_debit_note_id = ?")) {
      return [state.lines.filter((line) => line.purchase_debit_note_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("UPDATE purchase_debit_note_headers SET status = 'posted'")) {
      const row = state.headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT * FROM purchase_debit_note_headers WHERE id = ?")) {
      const row = state.headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    throw new Error(`Unhandled SQL in purchase debit note test fake: ${q}`);
  };

  const conn = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute,
  };

  return {
    async getConnection() { return conn; },
    async execute(sql, params = []) { return execute(sql, params); },
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

test("simple sales credit note posts balanced revenue and receivable reversal", async () => {
  const state = {
    headers: [{
      id: "scn-1",
      company_id: "company-1",
      user_id: "user-1",
      credit_note_number: "SCN-0001",
      related_sales_invoice_id: "si-1",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      credit_note_date: "2026-04-04",
      status: "approved",
      taxable_amount: 500,
      total_amount: 500,
      posted_journal_entry_id: null,
    }],
    lines: [{
      sales_credit_note_id: "scn-1",
      line_no: 1,
      item_id: null,
      description: "Sales return allowance",
      quantity: 1,
      line_subtotal: 500,
      line_tax_amount: 0,
      line_total: 500,
      taxable_amount: 500,
      return_to_stock: 0,
    }],
    stockMovements: [],
  };

  const journal = createJournalStub();
  const service = new SalesCreditNoteService(createSalesCreditNotePool(state), {
    journalService: journal,
    taxService: {
      async buildOutputTaxPostings() { return []; },
      async recordTaxTransactionsForSalesCreditNote() {},
    },
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: null,
  });

  const result = await service.post("user-1", "scn-1", {});
  assert.equal(result.status, "posted");
  const lines = journal.calls[0].lines;
  assert.deepEqual(
    lines.map((line) => [line.accountCode, Number(line.debit || 0), Number(line.credit || 0)]),
    [
      ["4100-SALES", 500, 0],
      ["1100-AR", 0, 500],
    ]
  );
});

test("simple purchase debit note posts balanced payable and purchase reversal", async () => {
  const state = {
    headers: [{
      id: "pdn-1",
      company_id: "company-1",
      user_id: "user-1",
      debit_note_number: "PDN-0001",
      related_purchase_bill_id: "pb-1",
      counterparty_id: "cp-v1",
      vendor_id: "cp-v1",
      vendor_name: "Vendor A",
      debit_note_date: "2026-04-04",
      status: "approved",
      total_amount: 300,
      posted_journal_entry_id: null,
    }],
    lines: [{
      purchase_debit_note_id: "pdn-1",
      line_no: 1,
      item_id: null,
      description: "Purchase price correction",
      quantity: 1,
      line_subtotal: 300,
      discount_amount: 0,
      taxable_amount: 300,
      line_tax_amount: 0,
      expense_account_id: "expense-1",
      inventory_account_id: null,
      return_to_vendor: 0,
    }],
  };

  const journal = createJournalStub();
  const service = new PurchaseDebitNoteService(createPurchaseDebitNotePool(state), {
    journalService: journal,
    taxService: {
      async buildInputTaxPostings() { return []; },
      async recordTaxTransactionsForPurchaseDebitNote() {},
    },
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: null,
  });

  const result = await service.post("user-1", "pdn-1", {});
  assert.equal(result.status, "posted");
  const lines = journal.calls[0].lines;
  assert.equal(lines[0].accountCode, "2100-AP");
  const debits = lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credits = lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  assert.equal(debits, credits);
});

test("stock-return sales credit note reverses inventory and COGS and applies stock movement", async () => {
  const state = {
    headers: [{
      id: "scn-2",
      company_id: "company-1",
      user_id: "user-1",
      credit_note_number: "SCN-0002",
      related_sales_invoice_id: "si-2",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      credit_note_date: "2026-04-04",
      status: "approved",
      taxable_amount: 800,
      total_amount: 800,
      posted_journal_entry_id: null,
    }],
    lines: [{
      sales_credit_note_id: "scn-2",
      line_no: 1,
      item_id: "item-1",
      description: "Returned stock item",
      quantity: 2,
      line_subtotal: 800,
      line_tax_amount: 0,
      line_total: 800,
      taxable_amount: 800,
      return_to_stock: 1,
    }],
    stockMovements: [{
      company_id: "company-1",
      reference_type: "sales_invoice",
      reference_id: "si-2",
      item_id: "item-1",
      quantity_delta: -2,
      total_cost: 320,
    }],
  };

  const journal = createJournalStub();
  const inventoryCalls = [];
  const service = new SalesCreditNoteService(createSalesCreditNotePool(state), {
    journalService: journal,
    taxService: {
      async buildOutputTaxPostings() { return []; },
      async recordTaxTransactionsForSalesCreditNote() {},
    },
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: {
      async getIssueUnitCost() { return 160; },
      async applySalesReturn(payload) {
        inventoryCalls.push(payload);
        return { applied: true, quantity_delta: payload.quantity, unit_cost: payload.unitCost };
      },
    },
  });

  await service.post("user-1", "scn-2", {});
  const lines = journal.calls[0].lines;
  assert.equal(lines.some((line) => line.accountCode === "1200-INVENTORY" && Number(line.debit) === 320), true);
  assert.equal(lines.some((line) => line.accountCode === "5200-COGS" && Number(line.credit) === 320), true);
  assert.equal(inventoryCalls.length, 1);
  assert.equal(Number(inventoryCalls[0].unitCost), 160);
});

test("tax reversal posting includes debit-side tax line for sales credit notes", async () => {
  const state = {
    headers: [{
      id: "scn-3",
      company_id: "company-1",
      user_id: "user-1",
      credit_note_number: "SCN-0003",
      related_sales_invoice_id: "si-3",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Customer A",
      credit_note_date: "2026-04-04",
      status: "approved",
      taxable_amount: 1000,
      tax_amount: 130,
      total_amount: 1130,
      posted_journal_entry_id: null,
    }],
    lines: [{
      id: "scn-line-1",
      sales_credit_note_id: "scn-3",
      line_no: 1,
      item_id: null,
      description: "Taxed return",
      quantity: 1,
      line_subtotal: 1000,
      line_tax_amount: 130,
      line_total: 1130,
      taxable_amount: 1000,
      tax_code_id: "tax-1",
      return_to_stock: 0,
    }],
    stockMovements: [],
  };

  const journal = createJournalStub();
  let recordedTax = null;
  const service = new SalesCreditNoteService(createSalesCreditNotePool(state), {
    journalService: journal,
    taxService: {
      async buildOutputTaxPostings() { return [{ accountCode: "2200-TAX-OUT", amount: 130 }]; },
      async recordTaxTransactionsForSalesCreditNote(_conn, _actorUserId, payload) { recordedTax = payload; },
    },
    accountingControlService: createControlStub(),
    counterpartyService: createCounterpartyService(),
    inventoryLedgerService: null,
  });

  await service.post("user-1", "scn-3", {});
  const lines = journal.calls[0].lines;
  assert.equal(lines.some((line) => line.accountCode === "2200-TAX-OUT" && Number(line.debit) === 130), true);
  assert.equal(recordedTax.postedJournalEntryId, "je-1");
});
