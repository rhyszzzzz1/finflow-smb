"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { AccountingReportsService } = require("../services/accountingReportsService");

function createService() {
  return new AccountingReportsService({
    query(_sql, _params, cb) {
      cb(null, []);
    },
  });
}

test("AR reconciliation compares AR aging total to AR control account", async () => {
  const service = createService();
  service.arAging = async () => ({
    buckets: { total: 1200, current: 1200, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
    lines: [{ document_id: "si-1", outstanding_amount: 1200 }],
  });
  service.getControlAccountBalance = async () => ({
    account_code: "1100-AR",
    account_name: "Accounts Receivable",
    gl_balance: 1200,
  });

  const report = await service.arControlReconciliation("company-1", "2026-04-05");
  assert.equal(report.is_reconciled, true);
  assert.equal(report.variance, 0);
  assert.equal(report.subledger_balance, 1200);
});

test("AP reconciliation exposes variance when AP control and subledger differ", async () => {
  const service = createService();
  service.apAging = async () => ({
    buckets: { total: 800, current: 800, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_91_plus: 0 },
    lines: [{ document_id: "pb-1", outstanding_amount: 800 }],
  });
  service.getControlAccountBalance = async () => ({
    account_code: "2100-AP",
    account_name: "Accounts Payable",
    gl_balance: 900,
  });

  const report = await service.apControlReconciliation("company-1", "2026-04-05");
  assert.equal(report.is_reconciled, false);
  assert.equal(report.variance, 100);
});

test("inventory reconciliation compares stock valuation to inventory asset account", async () => {
  const service = createService();
  service.stockSummary = async () => ({
    lines: [{ item_id: "item-1", on_hand_value: 500 }],
    totals: { total_on_hand_value: 500, total_on_hand_qty: 10, total_items: 1 },
    validation: { negative_stock_lines: [] },
  });
  service.getControlAccountBalance = async () => ({
    account_code: "1200-INVENTORY",
    account_name: "Inventory",
    gl_balance: 500,
  });

  const report = await service.inventoryControlReconciliation("company-1", "2026-04-05");
  assert.equal(report.is_reconciled, true);
  assert.equal(report.details.stock_summary_totals.total_on_hand_value, 500);
});

test("tax reconciliation compares tax transactions to tax control accounts", async () => {
  const service = createService();
  service.getTaxSubledgerTotals = async () => ({
    output_total: 130,
    input_total: 65,
    output_lines: [{ tax_code_id: "tax-out", tax_amount: 130 }],
    input_lines: [{ tax_code_id: "tax-in", tax_amount: 65 }],
  });
  service.getControlAccountBalance = async (_userId, accountCode) => ({
    account_code: accountCode,
    account_name: accountCode,
    gl_balance: accountCode === "2200-TAX-OUT" ? 130 : 65,
  });

  const report = await service.taxControlReconciliation("company-1", "2026-04-05");
  assert.equal(report.validation.fully_reconciled, true);
  assert.equal(report.output_tax.variance, 0);
  assert.equal(report.input_tax.variance, 0);
});

test("advances reconciliation compares unapplied payments to advance control accounts", async () => {
  const service = createService();
  service.getAdvanceSubledgerTotals = async () => ({
    customer_total: 250,
    vendor_total: 300,
    customer_advances: [{ counterparty_id: "c1", unapplied_amount: 250 }],
    vendor_prepayments: [{ counterparty_id: "v1", unapplied_amount: 300 }],
  });
  service.getControlAccountBalance = async (_userId, accountCode) => ({
    account_code: accountCode,
    account_name: accountCode,
    gl_balance: accountCode === "2300-CUST-ADV" ? 250 : 300,
  });

  const report = await service.advancesReconciliation("company-1", "2026-04-05");
  assert.equal(report.validation.fully_reconciled, true);
  assert.equal(report.customer_advances.subledger_balance, 250);
  assert.equal(report.vendor_prepayments.subledger_balance, 300);
});

test("GRNI reconciliation compares received-not-billed subledger to GRNI control account", async () => {
  const service = createService();
  service.getGrniSubledgerTotals = async () => ({
    total: 420,
    lines: [{ goods_receipt_line_id: "grl-1", outstanding_amount: 420 }],
  });
  service.getControlAccountBalance = async (_userId, accountCode) => ({
    account_code: accountCode,
    account_name: accountCode,
    gl_balance: 420,
  });

  const report = await service.grniControlReconciliation("company-1", "2026-04-05");
  assert.equal(report.is_reconciled, true);
  assert.equal(report.subledger_balance, 420);
  assert.equal(report.gl_account.account_code, "2150-GRNI");
});

test("reconciliation summary includes GRNI report in overall validation", async () => {
  const service = createService();
  service.arControlReconciliation = async () => ({ is_reconciled: true });
  service.apControlReconciliation = async () => ({ is_reconciled: true });
  service.inventoryControlReconciliation = async () => ({ is_reconciled: true });
  service.grniControlReconciliation = async () => ({ is_reconciled: true });
  service.taxControlReconciliation = async () => ({ validation: { fully_reconciled: true } });
  service.advancesReconciliation = async () => ({ validation: { fully_reconciled: true } });

  const report = await service.reconciliationSummary("company-1", "2026-04-05");
  assert.equal(report.validation.fully_reconciled, true);
  assert.ok(report.reports.grni);
});
