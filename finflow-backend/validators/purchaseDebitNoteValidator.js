"use strict";

function validatePurchaseDebitNotePayload(body) {
  const errors = [];
  if (!(body.related_purchase_bill_id || body.counterparty_id || body.vendor_id || body.vendor_name)) {
    errors.push("related_purchase_bill_id, counterparty_id, vendor_id, or vendor_name is required");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }
  for (let i = 0; i < body.lines.length; i += 1) {
    const line = body.lines[i] || {};
    if (!line.description) errors.push(`lines[${i}].description is required`);
    if (line.quantity === undefined || line.quantity === null) errors.push(`lines[${i}].quantity is required`);
    if (line.unit_cost === undefined || line.unit_cost === null) errors.push(`lines[${i}].unit_cost is required`);
    if (line.discount_type && !["none", "percentage", "fixed"].includes(line.discount_type)) {
      errors.push(`lines[${i}].discount_type must be one of none, percentage, fixed`);
    }
  }
  return errors;
}

module.exports = {
  validatePurchaseDebitNotePayload,
};
