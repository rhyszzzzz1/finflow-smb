"use strict";

function validateInventoryPayload(body) {
  const errors = [];
  const hasVendorProductFlow = !!(body.linked_vendor_profile_id && body.vendor_product_id);
  const hasStandaloneItemRef = !!(body.item_id || body.name || body.product_name);
  if (!hasVendorProductFlow && !hasStandaloneItemRef) {
    errors.push("Provide item_id, name/product_name, or linked_vendor_profile_id with vendor_product_id");
  }
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

function validateItemVendorLinkPayload(body) {
  const errors = [];
  if (!(body.vendor_id || body.linked_vendor_profile_id)) {
    errors.push("vendor_id or linked_vendor_profile_id is required");
  }
  if (body.lead_time_days !== undefined && body.lead_time_days !== null && body.lead_time_days !== "") {
    const days = Number(body.lead_time_days);
    if (!Number.isInteger(days) || days < 0) {
      errors.push("lead_time_days must be a non-negative integer");
    }
  }
  if (body.last_purchase_price !== undefined && body.last_purchase_price !== null && body.last_purchase_price !== "") {
    const price = Number(body.last_purchase_price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push("last_purchase_price must be a non-negative number");
    }
  }
  return errors;
}

module.exports = {
  validateInventoryPayload,
  validateItemPayload,
  validateWarehousePayload,
  validateStockAdjustmentPayload,
  validateStockTransferPayload,
  validateItemVendorLinkPayload,
};
