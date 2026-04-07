"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateSalesQuotePayload } = require("../validators/salesQuoteValidator");

function createSalesQuoteRoutes({ authenticate, salesQuoteController }) {
  const router = express.Router();

  router.get("/sales-quotes", authenticate, asyncHandler(salesQuoteController.list));
  router.get("/sales-quotes/:id", authenticate, asyncHandler(salesQuoteController.getById));
  router.post("/sales-quotes", authenticate, validateRequest({ customBodyValidator: validateSalesQuotePayload }), asyncHandler(salesQuoteController.createDraft));
  router.post("/sales-quotes/:id/send", authenticate, asyncHandler(salesQuoteController.send));
  router.post("/sales-quotes/:id/accept", authenticate, asyncHandler(salesQuoteController.accept));
  router.post("/sales-quotes/:id/convert-to-order", authenticate, asyncHandler(salesQuoteController.convertToOrder));
  router.post("/sales-quotes/:id/void", authenticate, asyncHandler(salesQuoteController.void));

  return router;
}

module.exports = {
  createSalesQuoteRoutes,
};
