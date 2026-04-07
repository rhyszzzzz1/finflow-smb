"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateBusinessRelationshipInvitePayload } = require("../validators/businessRelationshipValidator");

function createBusinessRelationshipRoutes({ authenticate, businessRelationshipController }) {
  const router = express.Router();

  router.get("/business-relationships", authenticate, asyncHandler(businessRelationshipController.list));
  router.get("/business-relationships/active", authenticate, asyncHandler(businessRelationshipController.listActive));
  router.post(
    "/business-relationships/invite",
    authenticate,
    validateRequest({
      customBodyValidator: validateBusinessRelationshipInvitePayload,
    }),
    asyncHandler(businessRelationshipController.invite)
  );
  router.post("/business-relationships/:id/accept", authenticate, asyncHandler(businessRelationshipController.accept));

  return router;
}

module.exports = {
  createBusinessRelationshipRoutes,
};
