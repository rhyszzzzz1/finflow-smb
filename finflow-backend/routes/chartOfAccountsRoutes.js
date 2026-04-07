"use strict";

const express = require("express");
const { asyncHandler } = require("../utils/asyncHandler");

function createChartOfAccountsRoutes({ authenticate, chartOfAccountsController }) {
  const router = express.Router();
  router.get("/chart-of-accounts", authenticate, asyncHandler(chartOfAccountsController.listPostingAccounts));
  return router;
}

module.exports = {
  createChartOfAccountsRoutes,
};

