"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateSalesInvoicePayload } = require("../validators/salesInvoiceValidator");

function createSalesInvoiceRoutes({ authenticate, salesInvoiceController }) {
  const router = express.Router();

  router.get("/sales-invoices", authenticate, asyncHandler(salesInvoiceController.list));
  router.get("/sales-invoices/:id", authenticate, asyncHandler(salesInvoiceController.getById));

  router.post(
    "/sales-invoices",
    authenticate,
    validateRequest({
      customBodyValidator: validateSalesInvoicePayload,
    }),
    asyncHandler(salesInvoiceController.createDraft)
  );

  router.put(
    "/sales-invoices/:id",
    authenticate,
    validateRequest({
      customBodyValidator: validateSalesInvoicePayload,
    }),
    asyncHandler(salesInvoiceController.updateDraft)
  );

  router.post("/sales-invoices/:id/approve", authenticate, asyncHandler(salesInvoiceController.approve));
  router.post("/sales-invoices/:id/post", authenticate, asyncHandler(salesInvoiceController.post));
  router.post("/sales-invoices/:id/void", authenticate, asyncHandler(salesInvoiceController.void));

  return router;
}

module.exports = {
  createSalesInvoiceRoutes,
};
