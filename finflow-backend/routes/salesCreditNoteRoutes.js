"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateSalesCreditNotePayload } = require("../validators/salesCreditNoteValidator");

function createSalesCreditNoteRoutes({ authenticate, salesCreditNoteController }) {
  const router = express.Router();
  router.get("/sales-credit-notes", authenticate, asyncHandler(salesCreditNoteController.list));
  router.get("/sales-credit-notes/:id", authenticate, asyncHandler(salesCreditNoteController.getById));
  router.post("/sales-credit-notes", authenticate, validateRequest({ customBodyValidator: validateSalesCreditNotePayload }), asyncHandler(salesCreditNoteController.createDraft));
  router.put("/sales-credit-notes/:id", authenticate, validateRequest({ customBodyValidator: validateSalesCreditNotePayload }), asyncHandler(salesCreditNoteController.updateDraft));
  router.post("/sales-credit-notes/:id/approve", authenticate, asyncHandler(salesCreditNoteController.approve));
  router.post("/sales-credit-notes/:id/post", authenticate, asyncHandler(salesCreditNoteController.post));
  router.post("/sales-credit-notes/:id/void", authenticate, asyncHandler(salesCreditNoteController.void));
  return router;
}

module.exports = {
  createSalesCreditNoteRoutes,
};
