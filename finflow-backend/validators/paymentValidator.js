"use strict";

function validatePaymentPayload(body) {
  const errs = [];
  if (!["incoming", "outgoing"].includes(body.type)) {
    errs.push("type must be incoming or outgoing");
  }
  if (!Array.isArray(body.allocations)) {
    errs.push("allocations must be an array");
  }
  return errs;
}

module.exports = {
  validatePaymentPayload,
};
