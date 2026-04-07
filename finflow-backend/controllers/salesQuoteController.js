"use strict";

class SalesQuoteController {
  constructor(salesQuoteService) {
    this.salesQuoteService = salesQuoteService;
  }

  list = async (req, res) => res.json(await this.salesQuoteService.list(req.user.id));

  getById = async (req, res) => {
    const quote = await this.salesQuoteService.getById(req.user.id, req.params.id);
    if (!quote) return res.status(404).json({ message: "Sales quote not found" });
    return res.json(quote);
  };

  createDraft = async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    return res.status(201).json(await this.salesQuoteService.createDraft(userId, req.body, req.requestMeta || {}));
  };
  send = async (req, res) => res.json(await this.salesQuoteService.send(req.user.id, req.params.id, req.requestMeta || {}));
  accept = async (req, res) => res.json(await this.salesQuoteService.accept(req.user.id, req.params.id, req.requestMeta || {}));
  void = async (req, res) => res.json(await this.salesQuoteService.void(req.user.id, req.params.id, req.requestMeta || {}));
  convertToOrder = async (req, res) => res.status(201).json(await this.salesQuoteService.convertToOrder(req.user.id, req.params.id, req.body || {}, req.requestMeta || {}));
}

module.exports = {
  SalesQuoteController,
};
