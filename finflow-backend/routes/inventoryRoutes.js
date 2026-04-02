"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");
const { validateRequest } = require("../middleware/validateRequest");
const {
  validateInventoryPayload,
  validateItemPayload,
  validateWarehousePayload,
  validateStockAdjustmentPayload,
  validateStockTransferPayload,
} = require("../validators/inventoryValidator");

function createInventoryRoutes({ authenticate, inventoryController }) {
  const router = express.Router();

  router.get("/vendors/:linkedProfileId/products", authenticate, asyncHandler(inventoryController.listVendorProducts));
  router.get("/inventory", authenticate, asyncHandler(inventoryController.list));
  router.post("/inventory", authenticate, validateRequest({ customBodyValidator: validateInventoryPayload }), asyncHandler(inventoryController.create));
  router.put("/inventory/:id", authenticate, validateRequest({ customBodyValidator: validateInventoryPayload }), asyncHandler(inventoryController.update));
  router.delete("/inventory/:id", authenticate, asyncHandler(inventoryController.remove));

  router.get("/stock/balances", authenticate, asyncHandler(inventoryController.getStockBalances));
  router.post("/stock/adjustment", authenticate, validateRequest({ customBodyValidator: validateStockAdjustmentPayload }), asyncHandler(inventoryController.createStockAdjustment));
  router.post("/stock/transfer", authenticate, validateRequest({ customBodyValidator: validateStockTransferPayload }), asyncHandler(inventoryController.createStockTransfer));

  router.get("/items", authenticate, asyncHandler(inventoryController.listItems));
  router.post("/items", authenticate, validateRequest({ customBodyValidator: validateItemPayload }), asyncHandler(inventoryController.createItem));

  router.get("/warehouses", authenticate, asyncHandler(inventoryController.listWarehouses));
  router.post("/warehouses", authenticate, validateRequest({ customBodyValidator: validateWarehousePayload }), asyncHandler(inventoryController.createWarehouse));

  return router;
}

module.exports = {
  createInventoryRoutes,
};
