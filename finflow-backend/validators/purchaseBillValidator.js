"use strict";

function validatePurchaseBillPayload(body) {
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
    if (!line.description && !line.purchase_order_line_id && !line.goods_receipt_line_id) {
      errors.push(`lines[${i}].description is required`);
    }
    if (line.quantity === undefined || line.quantity === null) errors.push(`lines[${i}].quantity is required`);
    if (line.unit_cost === undefined || line.unit_cost === null) errors.push(`lines[${i}].unit_cost is required`);
    if (line.discount_type && !["none", "percentage", "fixed"].includes(line.discount_type)) {
      errors.push(`lines[${i}].discount_type must be one of none, percentage, fixed`);
    }
    const hasInventoryTarget = !!(line.item_id || line.inventory_account_id);
    const hasExpenseTarget = !!line.expense_account_id;
    if (!hasInventoryTarget && !hasExpenseTarget) {
      errors.push(`lines[${i}] must target inventory or expense`);
    }
    if (hasInventoryTarget && hasExpenseTarget) {
      errors.push(`lines[${i}] cannot target both inventory and expense`);
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
  validatePurchaseBillPayload,
  validateApprovalDecisionPayload,
};
