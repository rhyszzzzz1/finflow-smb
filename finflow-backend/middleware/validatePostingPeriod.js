"use strict";

function createPostingPeriodValidator({ accountingControlService, dateField }) {
  if (!accountingControlService) {
    throw new Error("createPostingPeriodValidator requires accountingControlService");
  }
  if (!dateField) {
    throw new Error("createPostingPeriodValidator requires dateField");
  }

  return async (req, _res, next) => {
    try {
      const entryDate = req.body?.[dateField];
      if (!entryDate) return next();

      const companyId = await accountingControlService.resolveCompanyId(null, req.user.id);
      const conn = await accountingControlService.pool.getConnection();
      try {
        await accountingControlService.validatePostingDate(conn, companyId, entryDate);
      } finally {
        conn.release();
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  createPostingPeriodValidator,
};
