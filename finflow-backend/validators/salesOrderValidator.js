"use strict";

function validateSalesOrderPayload(body) {
  const errors = [];
  if (!(body.counterparty_id || body.customer_id || body.client_id || body.customer_name || body.client_name || body.sales_quote_id)) {
    errors.push("sales_quote_id, counterparty_id, customer_id, client_id, or customer_name is required");
  }
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    errors.push("lines must be a non-empty array");
    return errors;
  }
  for (let i = 0; i < body.lines.length; i += 1) {
    const line = body.lines[i] || {};
    if (!line.description) errors.push(`lines[${i}].description is required`);
    if (line.ordered_quantity === undefined && line.quantity === undefined) errors.push(`lines[${i}].ordered_quantity is required`);
    if (line.unit_price === undefined || line.unit_price === null) errors.push(`lines[${i}].unit_price is required`);
  }
  return errors;
}

module.exports = {
  validateSalesOrderPayload,
};
