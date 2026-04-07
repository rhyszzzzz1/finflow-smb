"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { AccountingReportsService } = require("../services/accountingReportsService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createReportsDb() {
  const state = {
    tables: new Set(["sales_invoice_headers", "purchase_bill_headers"]),
    salesInvoiceHeaders: [],
    purchaseBillHeaders: [],
    payments: [],
    paymentAllocations: [],
    salesCreditNotes: [],
    purchaseDebitNotes: [],
  };

  const query = (sql, params, cb) => {
    const q = normalizeSql(sql);

    if (q.includes("FROM information_schema.tables")) {
      const tableName = params[0];
      return cb(null, [{ count_rows: state.tables.has(tableName) ? 1 : 0 }]);
    }

    if (q.includes("FROM sales_invoice_headers") && q.includes("posted_journal_entry_id IS NOT NULL") && q.includes("invoice_date BETWEEN")) {
      const rows = state.salesInvoiceHeaders
        .filter((row) =>
          row.user_id === params[0]
          && String(row.counterparty_id || row.customer_id) === String(params[1])
          && row.posted_journal_entry_id
          && row.status !== "void"
          && row.invoice_date >= params[2]
          && row.invoice_date <= params[3]
        )
        .map((row) => ({
          document_id: row.id,
          document_no: row.invoice_no,
          document_date: row.invoice_date,
          due_date: row.due_date,
          amount: row.total_amount,
          notes: row.notes || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM purchase_bill_headers") && q.includes("posted_journal_entry_id IS NOT NULL") && q.includes("bill_date BETWEEN")) {
      const rows = state.purchaseBillHeaders
        .filter((row) =>
          row.user_id === params[0]
          && String(row.counterparty_id || row.vendor_id) === String(params[1])
          && row.posted_journal_entry_id
          && row.status !== "void"
          && row.bill_date >= params[2]
          && row.bill_date <= params[3]
        )
        .map((row) => ({
          document_id: row.id,
          document_no: row.bill_no,
          document_date: row.bill_date,
          due_date: row.due_date,
          amount: row.total_amount,
          notes: row.notes || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM payments p") && q.includes("p.type = 'incoming'")) {
      const rows = state.payments
        .filter((row) =>
          row.company_id === params[0]
          && String(row.counterparty_id || row.customer_id) === String(params[1])
          && row.type === "incoming"
          && row.status === "posted"
          && row.payment_date >= params[2]
          && row.payment_date <= params[3]
        )
        .map((payment) => ({
          document_id: payment.id,
          document_no: payment.payment_number,
          document_date: payment.payment_date,
          due_date: null,
          amount: state.paymentAllocations
            .filter((alloc) => alloc.payment_id === payment.id)
            .reduce((sum, alloc) => sum + Number(alloc.allocated_amount || 0), 0),
          notes: payment.notes || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM payments p") && q.includes("p.type = 'outgoing'")) {
      const rows = state.payments
        .filter((row) =>
          row.company_id === params[0]
          && String(row.counterparty_id || row.vendor_id) === String(params[1])
          && row.type === "outgoing"
          && row.status === "posted"
          && row.payment_date >= params[2]
          && row.payment_date <= params[3]
        )
        .map((payment) => ({
          document_id: payment.id,
          document_no: payment.payment_number,
          document_date: payment.payment_date,
          due_date: null,
          amount: state.paymentAllocations
            .filter((alloc) => alloc.payment_id === payment.id)
            .reduce((sum, alloc) => sum + Number(alloc.allocated_amount || 0), 0),
          notes: payment.notes || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM sales_credit_note_headers")) {
      const rows = state.salesCreditNotes
        .filter((row) =>
          row.user_id === params[0]
          && String(row.counterparty_id || row.customer_id) === String(params[1])
          && row.status === "posted"
          && row.credit_note_date >= params[2]
          && row.credit_note_date <= params[3]
        )
        .map((row) => ({
          document_id: row.id,
          document_no: row.credit_note_number,
          document_date: row.credit_note_date,
          due_date: null,
          amount: row.total_amount,
          notes: row.reason || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM purchase_debit_note_headers")) {
      const rows = state.purchaseDebitNotes
        .filter((row) =>
          row.user_id === params[0]
          && String(row.counterparty_id || row.vendor_id) === String(params[1])
          && row.status === "posted"
          && row.debit_note_date >= params[2]
          && row.debit_note_date <= params[3]
        )
        .map((row) => ({
          document_id: row.id,
          document_no: row.debit_note_number,
          document_date: row.debit_note_date,
          due_date: null,
          amount: row.total_amount,
          notes: row.reason || null,
        }));
      return cb(null, rows);
    }

    if (q.includes("FROM sales_invoice_headers si") && q.includes("GROUP BY si.id")) {
      const asOfDate = params[0];
      const userId = params[1];
      const invoiceDate = params[2];
      const rows = state.salesInvoiceHeaders
        .filter((row) =>
          row.user_id === userId
          && row.posted_journal_entry_id
          && row.status !== "void"
          && row.invoice_date <= invoiceDate
        )
        .map((row) => {
          const applied = state.paymentAllocations
            .filter((alloc) => alloc.sales_invoice_id === row.id || alloc.invoice_id === row.id)
            .reduce((sum, alloc) => {
              const payment = state.payments.find((p) => p.id === alloc.payment_id);
              if (!payment || payment.type !== "incoming" || payment.status !== "posted" || payment.payment_date > asOfDate) {
                return sum;
              }
              return sum + Number(alloc.allocated_amount || 0);
            }, 0);

          return {
            document_id: row.id,
            document_no: row.invoice_no,
            counterparty_id: row.counterparty_id || row.customer_id || null,
            customer_id: row.customer_id || null,
            customer_name: row.customer_name || null,
            document_date: row.invoice_date,
            due_date: row.due_date,
            document_amount: row.total_amount,
            applied_amount: applied,
          };
        });
      return cb(null, rows);
    }

    return cb(new Error(`Unhandled SQL in accounting reports test fake: ${q}`));
  };

  return { state, query };
}

test("customer statement uses canonical ids so similar display names do not merge", async () => {
  const db = createReportsDb();
  db.state.salesInvoiceHeaders.push(
    {
      id: "si-1",
      user_id: "user-1",
      counterparty_id: "cp-1",
      customer_id: "cp-1",
      customer_name: "Acme Traders",
      invoice_no: "SI-001",
      invoice_date: "2026-04-01",
      due_date: "2026-04-10",
      total_amount: 1000,
      posted_journal_entry_id: "je-1",
      status: "posted",
    },
    {
      id: "si-2",
      user_id: "user-1",
      counterparty_id: "cp-2",
      customer_id: "cp-2",
      customer_name: "Acme Traders",
      invoice_no: "SI-002",
      invoice_date: "2026-04-02",
      due_date: "2026-04-11",
      total_amount: 2000,
      posted_journal_entry_id: "je-2",
      status: "posted",
    }
  );

  const service = new AccountingReportsService(db);
  const report = await service.customerStatement("user-1", "cp-1", "2026-04-01", "2026-04-30");

  assert.equal(report.customer_id, "cp-1");
  assert.equal(report.counterparty_id, "cp-1");
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].document_no, "SI-001");
  assert.equal(report.closing_balance, 1000);
});

test("vendor statement uses canonical ids so similar display names do not merge", async () => {
  const db = createReportsDb();
  db.state.purchaseBillHeaders.push(
    {
      id: "pb-1",
      user_id: "user-1",
      counterparty_id: "cp-v1",
      vendor_id: "cp-v1",
      vendor_name: "Summit Supply",
      bill_no: "PB-001",
      bill_date: "2026-04-01",
      due_date: "2026-04-10",
      total_amount: 600,
      posted_journal_entry_id: "je-11",
      status: "posted",
    },
    {
      id: "pb-2",
      user_id: "user-1",
      counterparty_id: "cp-v2",
      vendor_id: "cp-v2",
      vendor_name: "Summit Supply",
      bill_no: "PB-002",
      bill_date: "2026-04-02",
      due_date: "2026-04-11",
      total_amount: 900,
      posted_journal_entry_id: "je-12",
      status: "posted",
    }
  );

  const service = new AccountingReportsService(db);
  const report = await service.vendorStatement("user-1", "cp-v2", "2026-04-01", "2026-04-30");

  assert.equal(report.vendor_id, "cp-v2");
  assert.equal(report.counterparty_id, "cp-v2");
  assert.equal(report.lines.length, 1);
  assert.equal(report.lines[0].document_no, "PB-002");
  assert.equal(report.closing_balance, 900);
});

test("customer statement grouping survives display-name changes because it keys by id", async () => {
  const db = createReportsDb();
  db.state.salesInvoiceHeaders.push({
    id: "si-legacy-name",
    user_id: "user-1",
    counterparty_id: "cp-rename",
    customer_id: "cp-rename",
    customer_name: "Old Name Traders",
    invoice_no: "SI-010",
    invoice_date: "2026-04-01",
    due_date: "2026-04-10",
    total_amount: 1200,
    posted_journal_entry_id: "je-21",
    status: "posted",
  });
  db.state.payments.push({
    id: "pay-1",
    company_id: "user-1",
    counterparty_id: "cp-rename",
    customer_id: "cp-rename",
    payment_number: "RCPT-001",
    payment_date: "2026-04-03",
    type: "incoming",
    status: "posted",
    notes: "Received after rename",
  });
  db.state.paymentAllocations.push({
    id: "alloc-1",
    payment_id: "pay-1",
    sales_invoice_id: "si-legacy-name",
    allocated_amount: 200,
  });

  const service = new AccountingReportsService(db);
  const report = await service.customerStatement("user-1", "cp-rename", "2026-04-01", "2026-04-30");

  assert.equal(report.lines.length, 2);
  assert.deepEqual(report.lines.map((line) => line.document_no), ["SI-010", "RCPT-001"]);
  assert.equal(report.closing_balance, 1000);
});

test("ar aging keeps similarly named counterparties separate by canonical id", async () => {
  const db = createReportsDb();
  db.state.salesInvoiceHeaders.push(
    {
      id: "si-a1",
      user_id: "user-1",
      counterparty_id: "cp-a",
      customer_id: "cp-a",
      customer_name: "Northwind",
      invoice_no: "SI-A1",
      invoice_date: "2026-03-01",
      due_date: "2026-03-15",
      total_amount: 500,
      posted_journal_entry_id: "je-a1",
      status: "posted",
    },
    {
      id: "si-b1",
      user_id: "user-1",
      counterparty_id: "cp-b",
      customer_id: "cp-b",
      customer_name: "Northwind",
      invoice_no: "SI-B1",
      invoice_date: "2026-03-02",
      due_date: "2026-03-16",
      total_amount: 700,
      posted_journal_entry_id: "je-b1",
      status: "posted",
    }
  );

  const service = new AccountingReportsService(db);
  const report = await service.arAging("user-1", "2026-04-30");

  assert.equal(report.lines.length, 2);
  assert.deepEqual(
    report.lines.map((line) => line.counterparty_id).sort(),
    ["cp-a", "cp-b"]
  );
});
