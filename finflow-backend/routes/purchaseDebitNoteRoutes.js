"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validatePurchaseDebitNotePayload } = require("../validators/purchaseDebitNoteValidator");

function createPurchaseDebitNoteRoutes({ authenticate, purchaseDebitNoteController }) {
  const router = express.Router();
  router.get("/purchase-debit-notes", authenticate, asyncHandler(purchaseDebitNoteController.list));
  router.get("/purchase-debit-notes/:id", authenticate, asyncHandler(purchaseDebitNoteController.getById));
  router.post("/purchase-debit-notes", authenticate, validateRequest({ customBodyValidator: validatePurchaseDebitNotePayload }), asyncHandler(purchaseDebitNoteController.createDraft));
  router.put("/purchase-debit-notes/:id", authenticate, validateRequest({ customBodyValidator: validatePurchaseDebitNotePayload }), asyncHandler(purchaseDebitNoteController.updateDraft));
  router.post("/purchase-debit-notes/:id/approve", authenticate, asyncHandler(purchaseDebitNoteController.approve));
  router.post("/purchase-debit-notes/:id/post", authenticate, asyncHandler(purchaseDebitNoteController.post));
  router.post("/purchase-debit-notes/:id/void", authenticate, asyncHandler(purchaseDebitNoteController.void));
  return router;
}

module.exports = {
  createPurchaseDebitNoteRoutes,
};
