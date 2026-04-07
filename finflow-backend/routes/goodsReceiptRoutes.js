"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const { validateGoodsReceiptPayload } = require("../validators/goodsReceiptValidator");

function createGoodsReceiptRoutes({ authenticate, goodsReceiptController }) {
  const router = express.Router();

  router.get("/goods-receipts", authenticate, asyncHandler(goodsReceiptController.list));
  router.get("/goods-receipts/:id", authenticate, asyncHandler(goodsReceiptController.getById));

  router.post(
    "/goods-receipts",
    authenticate,
    validateRequest({ customBodyValidator: validateGoodsReceiptPayload }),
    asyncHandler(goodsReceiptController.createDraft)
  );

  router.put(
    "/goods-receipts/:id",
    authenticate,
    validateRequest({ customBodyValidator: validateGoodsReceiptPayload }),
    asyncHandler(goodsReceiptController.updateDraft)
  );

  router.post("/goods-receipts/:id/post", authenticate, asyncHandler(goodsReceiptController.post));
  router.post("/goods-receipts/:id/void", authenticate, asyncHandler(goodsReceiptController.void));

  return router;
}

module.exports = {
  createGoodsReceiptRoutes,
};
