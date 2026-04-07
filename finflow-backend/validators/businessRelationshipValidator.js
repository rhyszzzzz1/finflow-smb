"use strict";

function validateBusinessRelationshipInvitePayload(body) {
  const errors = [];
  const hasBuyer = !!(body.buyer_company_id || body.buyer_profile_id);
  const hasSeller = !!(body.seller_company_id || body.seller_profile_id);

  if (!hasBuyer && !hasSeller) {
    errors.push("At least one side must be provided with buyer_* or seller_* fields");
  }
  if ((!hasBuyer || !hasSeller) && !["buyer", "seller"].includes(body.actor_role || body.relationship_side)) {
    errors.push("actor_role must be buyer or seller when one side is omitted");
  }
  if (body.default_payment_terms_days !== undefined && body.default_payment_terms_days !== null) {
    const days = Number(body.default_payment_terms_days);
    if (!Number.isInteger(days) || days < 0) {
      errors.push("default_payment_terms_days must be a non-negative integer");
    }
  }
  if (body.credit_limit !== undefined && body.credit_limit !== null && body.credit_limit !== "") {
    const limit = Number(body.credit_limit);
    if (!Number.isFinite(limit) || limit < 0) {
      errors.push("credit_limit must be a non-negative number");
    }
  }
  return errors;
}

module.exports = {
  validateBusinessRelationshipInvitePayload,
};
