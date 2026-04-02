"use strict";

function validateInventoryPayload(body) {
  const errors = [];
  if (!body.linked_vendor_profile_id) errors.push("linked_vendor_profile_id is required");
  if (!body.vendor_product_id) errors.push("vendor_product_id is required");
  if (body.purchase_price === undefined || body.purchase_price === null) errors.push("purchase_price is required");
  if (body.selling_price === undefined || body.selling_price === null) errors.push("selling_price is required");
  return errors;
}

function validateItemPayload(body) {
  const errors = [];
  if (!body.name) errors.push("name is required");
  return errors;
}

function validateWarehousePayload(body) {
  const errors = [];
  if (!body.name) errors.push("name is required");
  if (!body.code) errors.push("code is required");
  return errors;
}

function validateStockAdjustmentPayload(body) {
  const errors = [];
  if (!body.item_id) errors.push("item_id is required");
  if (body.quantity_delta === undefined || body.quantity_delta === null) errors.push("quantity_delta is required");
  return errors;
}

function validateStockTransferPayload(body) {
  const errors = [];
  if (!body.item_id) errors.push("item_id is required");
  if (!body.from_warehouse_id) errors.push("from_warehouse_id is required");
  if (!body.to_warehouse_id) errors.push("to_warehouse_id is required");
  if (body.quantity === undefined || body.quantity === null) errors.push("quantity is required");
  return errors;
}

module.exports = {
  validateInventoryPayload,
  validateItemPayload,
  validateWarehousePayload,
  validateStockAdjustmentPayload,
  validateStockTransferPayload,
};
