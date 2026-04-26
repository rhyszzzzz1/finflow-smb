"use strict";

function validateGoodsReceiptPayload(body) {
  const errors = [];
  if (!(body.purchase_order_id || body.counterparty_id || body.vendor_id || body.vendor_name)) {
    errors.push("purchase_order_id, counterparty_id, vendor_id, or vendor_name is required");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }

  for (let i = 0; i < body.lines.length; i += 1) {
    const line = body.lines[i] || {};
    const hasDesc = String(line.description || "").trim().length > 0;
    if (!(line.item_id || line.purchase_order_line_id || hasDesc)) {
      errors.push(`lines[${i}]: item_id, purchase_order_line_id, or description is required`);
    }
    if (!hasDesc && !line.purchase_order_line_id) {
      errors.push(`lines[${i}].description is required when not referencing a purchase order line`);
    }
    if (line.received_quantity === undefined || line.received_quantity === null) {
      errors.push(`lines[${i}].received_quantity is required`);
    }
    if (line.unit_cost === undefined || line.unit_cost === null) {
      errors.push(`lines[${i}].unit_cost is required`);
    }
  }

  return errors;
}

module.exports = {
  validateGoodsReceiptPayload,
};
