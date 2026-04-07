"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateSalesOrderPayload } = require("../validators/salesOrderValidator");

function createSalesOrderRoutes({ authenticate, salesOrderController }) {
  const router = express.Router();

  router.get("/sales-orders", authenticate, asyncHandler(salesOrderController.list));
  router.get("/sales-orders/:id", authenticate, asyncHandler(salesOrderController.getById));
  router.post("/sales-orders", authenticate, validateRequest({ customBodyValidator: validateSalesOrderPayload }), asyncHandler(salesOrderController.createDraft));
  router.post("/sales-orders/:id/accept", authenticate, asyncHandler(salesOrderController.accept));
  router.post("/sales-orders/:id/convert-to-invoice", authenticate, asyncHandler(salesOrderController.convertToInvoice));
  router.post("/sales-orders/:id/void", authenticate, asyncHandler(salesOrderController.void));

  return router;
}

module.exports = {
  createSalesOrderRoutes,
};
