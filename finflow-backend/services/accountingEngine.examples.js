"use strict";

const { AccountingEngine } = require("./accountingEngine");

/**
 * Wiring example only. This file is intentionally not auto-executed.
 * Provide mysql2/promise pool from your runtime and call posting methods
 * from service/application layer after business document validation.
 */
async function runExamples(pool) {
  const engine = new AccountingEngine(pool);

  // 1) Sales invoice posting
  await engine.postSalesInvoice({
    companyId: 1,
    salesInvoiceId: 1001,
    actorUserId: 5,
    requestMeta: {
      ipAddress: "127.0.0.1",
      userAgent: "internal-service"
    }
  });

  // 2) Purchase bill posting
  await engine.postPurchaseBill({
    companyId: 1,
    purchaseBillId: 2001,
    actorUserId: 5
  });

  // 3) Payment received posting
  await engine.postPaymentReceived({
    companyId: 1,
    paymentId: 3001,
    actorUserId: 5
  });

  // 4) Payment made posting
  await engine.postPaymentMade({
    companyId: 1,
    paymentId: 3002,
    actorUserId: 5
  });

  // 5) Inventory COGS / adjustment posting
  await engine.postInventoryMovement({
    companyId: 1,
    stockMovementId: 4001,
    actorUserId: 5
  });

  // Reversal example
  await engine.reverseJournalEntry({
    companyId: 1,
    journalEntryId: 9001,
    actorUserId: 5,
    reason: "Erroneous posting: wrong tax code"
  });
}

module.exports = {
  runExamples
};
