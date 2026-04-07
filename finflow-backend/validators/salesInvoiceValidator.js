"use strict";

function validateSalesInvoicePayload(body) {
  const errors = [];
  if (!(body.counterparty_id || body.customer_id || body.client_id || body.customer_name || body.client_name)) {
    errors.push("counterparty_id, customer_id, client_id, or customer_name is required");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }

  for (let i = 0; i < body.lines.length; i += 1) {
    const line = body.lines[i] || {};
    if (!line.description && !line.sales_quote_line_id && !line.sales_order_line_id) {
      errors.push(`lines[${i}].description is required`);
    }
    if (line.quantity === undefined || line.quantity === null) errors.push(`lines[${i}].quantity is required`);
    if (line.unit_price === undefined || line.unit_price === null) errors.push(`lines[${i}].unit_price is required`);
    if (line.discount_type && !["none", "percentage", "fixed"].includes(line.discount_type)) {
      errors.push(`lines[${i}].discount_type must be one of none, percentage, fixed`);
    }
  }

  return errors;
}

function validateApprovalDecisionPayload(body, options = {}) {
  const errors = [];
  const requireComment = options.requireComment === true;
  const comment = String(body?.comment || body?.reason || "").trim();
  if (requireComment && !comment) {
    errors.push("comment or reason is required");
  }
  return errors;
}

module.exports = {
  validateSalesInvoicePayload,
  validateApprovalDecisionPayload,
};
