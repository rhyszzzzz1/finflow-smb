"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SettlementService } = require("../services/settlementService");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createTransactionalPool() {
  const state = {
    payments: [],
  };
  let txSnapshot = null;

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("INSERT INTO payments")) {
      state.payments.push({
        id: params[0],
        company_id: params[1],
        payment_number: params[2],
        bank_account_id: params[3],
        counterparty_id: params[4],
        counterparty_role: params[5],
        counterparty_name: params[6],
        customer_id: params[7],
        vendor_id: params[8],
        type: params[9],
        amount: Number(params[10]),
        allocated_amount: 0,
        unapplied_amount: Number(params[11]),
        payment_date: params[12],
        method: params[13],
        reference: params[14],
        notes: params[15],
        status: "draft",
        created_by_user_id: params[16],
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("UPDATE payments SET allocated_amount = ?")) {
      const row = state.payments.find((payment) => payment.id === params[3]);
      if (row) {
        row.allocated_amount = Number(params[0]);
        row.unapplied_amount = Number(params[1]);
        row.posted_journal_entry_id = params[2];
        row.status = "posted";
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    throw new Error(`Unhandled SQL in settlement advance accounting test fake: ${q}`);
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

function createService({ allocatedTotal, type }) {
  const pool = createTransactionalPool();
  const journalCalls = [];
  const service = new SettlementService(pool, {
    journalService: {
      async createJournalEntry(payload) {
        assert.ok(payload.conn, "payment journal creation should use the settlement transaction");
        journalCalls.push(payload);
        return { id: "je-1" };
      },
      async postJournalEntry(payload) {
        assert.ok(payload.conn, "payment journal posting should use the settlement transaction");
        return { id: payload.journalEntryId };
      },
    },
    accountingControlService: {
      async validatePostingDate() {
        return { id: "period-1" };
      },
      async nextDocumentNumber(_conn, { documentType }) {
        return { documentNumber: documentType === "payment" ? "PAY-0001" : "DOC-0001" };
      },
    },
    counterpartyService: {
      async resolveCustomerSnapshot() {
        return {
          counterparty_id: "cp-customer-1",
          display_name: "Customer A",
          snapshot_name: "Customer A",
        };
      },
      async resolveVendorSnapshot() {
        return {
          counterparty_id: "cp-vendor-1",
          display_name: "Vendor A",
          snapshot_name: "Vendor A",
        };
      },
    },
    auditService: {
      async logAction() {},
    },
    idFactory: (() => {
      let seq = 0;
      return () => `id-${++seq}`;
    })(),
  });

  service.resolveCompanyId = async () => "company-1";
  service.resolveBankAccount = async () => ({
    bankAccountId: type === "incoming" ? "bank-1" : "bank-2",
    glAccountCode: "1020-BANK",
  });
  service.allocatePayment = async () => ({
    allocated_total: allocatedTotal,
    allocations: allocatedTotal > 0 ? [{ target_type: type === "incoming" ? "sales_invoice" : "purchase_bill", target_id: "doc-1", allocated_amount: allocatedTotal }] : [],
  });

  return { pool, service, journalCalls };
}

test("fully allocated customer payment clears accounts receivable only", async () => {
  const { pool, service, journalCalls } = createService({ allocatedTotal: 1000, type: "incoming" });

  const result = await service.applyPayment("user-1", {
    type: "incoming",
    amount: 1000,
    date: "2026-04-04",
    method: "bank_transfer",
    customer_id: "cp-customer-1",
    allocations: [{ target_type: "sales_invoice", target_id: "si-1", allocated_amount: 1000 }],
  });

  assert.equal(result.overpayment_amount, 0);
  assert.equal(pool.state.payments[0].allocated_amount, 1000);
  assert.equal(pool.state.payments[0].unapplied_amount, 0);

  const lines = journalCalls[0].lines;
  assert.equal(lines.length, 2);
  assert.deepEqual(
    lines.map((line) => [line.accountCode, Number(line.debit || 0), Number(line.credit || 0)]),
    [
      ["1020-BANK", 1000, 0],
      ["1100-AR", 0, 1000],
    ]
  );
});

test("customer overpayment posts unapplied balance to customer advances liability", async () => {
  const { pool, service, journalCalls } = createService({ allocatedTotal: 1000, type: "incoming" });

  const result = await service.applyPayment("user-1", {
    type: "incoming",
    amount: 1250,
    date: "2026-04-04",
    method: "bank_transfer",
    customer_id: "cp-customer-1",
    allocations: [{ target_type: "sales_invoice", target_id: "si-1", allocated_amount: 1000 }],
  });

  assert.equal(result.overpayment_amount, 250);
  assert.equal(pool.state.payments[0].allocated_amount, 1000);
  assert.equal(pool.state.payments[0].unapplied_amount, 250);

  const lines = journalCalls[0].lines;
  assert.deepEqual(
    lines.map((line) => [line.accountCode, Number(line.debit || 0), Number(line.credit || 0)]),
    [
      ["1020-BANK", 1250, 0],
      ["1100-AR", 0, 1000],
      ["2300-CUST-ADV", 0, 250],
    ]
  );
});

test("fully allocated vendor payment clears accounts payable only", async () => {
  const { pool, service, journalCalls } = createService({ allocatedTotal: 800, type: "outgoing" });

  const result = await service.applyPayment("user-1", {
    type: "outgoing",
    amount: 800,
    date: "2026-04-04",
    method: "bank_transfer",
    vendor_id: "cp-vendor-1",
    allocations: [{ target_type: "purchase_bill", target_id: "pb-1", allocated_amount: 800 }],
  });

  assert.equal(result.overpayment_amount, 0);
  assert.equal(pool.state.payments[0].allocated_amount, 800);
  assert.equal(pool.state.payments[0].unapplied_amount, 0);

  const lines = journalCalls[0].lines;
  assert.deepEqual(
    lines.map((line) => [line.accountCode, Number(line.debit || 0), Number(line.credit || 0)]),
    [
      ["1020-BANK", 0, 800],
      ["2100-AP", 800, 0],
    ]
  );
});

test("supplier advance posts unapplied outgoing balance to vendor prepayments asset", async () => {
  const { pool, service, journalCalls } = createService({ allocatedTotal: 800, type: "outgoing" });

  const result = await service.applyPayment("user-1", {
    type: "outgoing",
    amount: 1100,
    date: "2026-04-04",
    method: "bank_transfer",
    vendor_id: "cp-vendor-1",
    allocations: [{ target_type: "purchase_bill", target_id: "pb-1", allocated_amount: 800 }],
  });

  assert.equal(result.overpayment_amount, 300);
  assert.equal(pool.state.payments[0].allocated_amount, 800);
  assert.equal(pool.state.payments[0].unapplied_amount, 300);

  const lines = journalCalls[0].lines;
  assert.deepEqual(
    lines.map((line) => [line.accountCode, Number(line.debit || 0), Number(line.credit || 0)]),
    [
      ["1020-BANK", 0, 1100],
      ["2100-AP", 800, 0],
      ["1400-VENDOR-ADV", 300, 0],
    ]
  );
});
