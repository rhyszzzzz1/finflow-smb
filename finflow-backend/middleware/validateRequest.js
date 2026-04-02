"use strict";

function validateRequest(schema) {
  return (req, res, next) => {
    const errors = [];

    if (Array.isArray(schema.requiredBody)) {
      for (const field of schema.requiredBody) {
        if (req.body[field] === undefined || req.body[field] === null || req.body[field] === "") {
          errors.push(`Missing required body field: ${field}`);
        }
      }
    }

    if (typeof schema.customBodyValidator === "function") {
      const customErrors = schema.customBodyValidator(req.body, req);
      if (Array.isArray(customErrors)) {
        errors.push(...customErrors.filter(Boolean));
      }
    }

    if (errors.length) {
      return res.status(400).json({ message: "Validation failed", errors });
    }

    return next();
  };
}

module.exports = {
  validateRequest,
};
