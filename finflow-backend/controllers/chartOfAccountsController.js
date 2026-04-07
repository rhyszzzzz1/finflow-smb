"use strict";

class ChartOfAccountsController {
  constructor(chartOfAccountsService) {
    this.chartOfAccountsService = chartOfAccountsService;
  }

  listPostingAccounts = async (req, res) => {
    const rows = await this.chartOfAccountsService.listPostingAccounts(req.user.id, {
      type: req.query?.type || null,
      q: req.query?.q || null,
    });
    return res.json(rows);
  };
}

module.exports = {
  ChartOfAccountsController,
};

