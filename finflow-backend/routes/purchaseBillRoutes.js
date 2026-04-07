"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const {
  validatePurchaseBillPayload,
  validateApprovalDecisionPayload,
} = require("../validators/purchaseBillValidator");

function createPurchaseBillRoutes({ authenticate, purchaseBillController }) {
  const router = express.Router();

  router.get("/purchase-bills", authenticate, asyncHandler(purchaseBillController.list));
  router.get("/purchase-bills/:id", authenticate, asyncHandler(purchaseBillController.getById));

  router.post(
    "/purchase-bills",
    authenticate,
    validateRequest({
      customBodyValidator: validatePurchaseBillPayload,
    }),
    asyncHandler(purchaseBillController.createDraft)
  );

  router.put(
    "/purchase-bills/:id",
    authenticate,
    validateRequest({
      customBodyValidator: validatePurchaseBillPayload,
    }),
    asyncHandler(purchaseBillController.updateDraft)
  );

  router.post(
    "/purchase-bills/:id/submit",
    authenticate,
    validateRequest({
      customBodyValidator: (body) => validateApprovalDecisionPayload(body),
    }),
    asyncHandler(purchaseBillController.submitForApproval)
  );
  router.post("/purchase-bills/:id/approve", authenticate, asyncHandler(purchaseBillController.approve));
  router.post(
    "/purchase-bills/:id/reject",
    authenticate,
    validateRequest({
      customBodyValidator: (body) => validateApprovalDecisionPayload(body, { requireComment: true }),
    }),
    asyncHandler(purchaseBillController.reject)
  );
  router.post(
    "/purchase-bills/:id/resubmit",
    authenticate,
    validateRequest({
      customBodyValidator: (body) => validateApprovalDecisionPayload(body),
    }),
    asyncHandler(purchaseBillController.resubmit)
  );
  router.post("/purchase-bills/:id/post", authenticate, asyncHandler(purchaseBillController.post));
  router.post("/purchase-bills/:id/void", authenticate, asyncHandler(purchaseBillController.void));

  return router;
}

module.exports = {
  createPurchaseBillRoutes,
};
