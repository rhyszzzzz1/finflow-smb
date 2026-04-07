"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validatePurchaseOrderPayload } = require("../validators/purchaseOrderValidator");

function createPurchaseOrderRoutes({ authenticate, purchaseOrderController }) {
  const router = express.Router();

  router.get("/purchase-orders", authenticate, asyncHandler(purchaseOrderController.list));
  router.get("/purchase-orders/:id", authenticate, asyncHandler(purchaseOrderController.getById));

  router.post(
    "/purchase-orders",
    authenticate,
    validateRequest({ customBodyValidator: validatePurchaseOrderPayload }),
    asyncHandler(purchaseOrderController.createDraft)
  );

  router.put(
    "/purchase-orders/:id",
    authenticate,
    validateRequest({ customBodyValidator: validatePurchaseOrderPayload }),
    asyncHandler(purchaseOrderController.updateDraft)
  );

  router.post("/purchase-orders/:id/approve", authenticate, asyncHandler(purchaseOrderController.approve));
  router.post("/purchase-orders/:id/void", authenticate, asyncHandler(purchaseOrderController.void));

  return router;
}

module.exports = {
  createPurchaseOrderRoutes,
};
