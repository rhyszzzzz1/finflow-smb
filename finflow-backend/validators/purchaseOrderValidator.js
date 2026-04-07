"use strict";

function validatePurchaseOrderPayload(body) {
  const errors = [];
  if (!(body.counterparty_id || body.vendor_id || body.vendor_name)) {
    errors.push("counterparty_id, vendor_id, or vendor_name is required");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }

  for (let i = 0; i < body.lines.length; i += 1) {
    const line = body.lines[i] || {};
    if (!line.description) errors.push(`lines[${i}].description is required`);
    if (line.ordered_quantity === undefined || line.ordered_quantity === null) errors.push(`lines[${i}].ordered_quantity is required`);
    if (line.unit_cost === undefined || line.unit_cost === null) errors.push(`lines[${i}].unit_cost is required`);
  }

  return errors;
}

module.exports = {
  validatePurchaseOrderPayload,
};
