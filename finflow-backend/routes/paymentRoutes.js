"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validatePaymentPayload } = require("../validators/paymentValidator");

function createPaymentRoutes({ authenticate, paymentController }) {
  const router = express.Router();

  // AUTHORITATIVE(accounting-refactor): settlement happens through payments and
  // payment_allocations. Receivables/payables below are read-only derived views,
  // not standalone accounting entities.
  router.post(
    "/payments/apply",
    authenticate,
    validateRequest({
      requiredBody: ["type", "amount", "date", "allocations"],
      customBodyValidator: validatePaymentPayload,
    }),
    asyncHandler(paymentController.applyPayment)
  );

  router.get("/bank-accounts", authenticate, asyncHandler(paymentController.listBankAccounts));
  router.get("/receivables", authenticate, asyncHandler(paymentController.getReceivables));
  router.get("/payables", authenticate, asyncHandler(paymentController.getPayables));
  router.get("/outstanding/invoices/:id", authenticate, asyncHandler(paymentController.getInvoiceOutstanding));
  router.get("/outstanding/purchases/:id", authenticate, asyncHandler(paymentController.getPurchaseOutstanding));
  router.get("/aging/receivables", authenticate, asyncHandler(paymentController.getReceivablesAging));
  router.get("/aging/payables", authenticate, asyncHandler(paymentController.getPayablesAging));
  router.get("/balances/customers/:id", authenticate, asyncHandler(paymentController.getCustomerBalance));
  router.get("/balances/vendors/:id", authenticate, asyncHandler(paymentController.getVendorBalance));

  // DEPRECATED(accounting-refactor): legacy frontend flows may still attempt to
  // mutate receivable/payable rows directly. Keep these endpoints only so they
  // fail loudly and intentionally during migration.
  router.post("/receivables", authenticate, asyncHandler(paymentController.blockDerivedWrite));
  router.put("/receivables/:id", authenticate, asyncHandler(paymentController.blockDerivedWrite));
  router.delete("/receivables/:id", authenticate, asyncHandler(paymentController.blockDerivedWrite));
  router.post("/payables", authenticate, asyncHandler(paymentController.blockDerivedWrite));
  router.put("/payables/:id", authenticate, asyncHandler(paymentController.blockDerivedWrite));
  router.delete("/payables/:id", authenticate, asyncHandler(paymentController.blockDerivedWrite));

  return router;
}

module.exports = {
  createPaymentRoutes,
};
