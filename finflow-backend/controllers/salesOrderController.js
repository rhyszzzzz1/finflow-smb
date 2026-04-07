"use strict";

class SalesOrderController {
  constructor(salesOrderService) {
    this.salesOrderService = salesOrderService;
  }

  list = async (req, res) => res.json(await this.salesOrderService.list(req.user.id));

  getById = async (req, res) => {
    const order = await this.salesOrderService.getById(req.user.id, req.params.id);
    if (!order) return res.status(404).json({ message: "Sales order not found" });
    return res.json(order);
  };

  createDraft = async (req, res) => res.status(201).json(await this.salesOrderService.createDraft(req.user.id, req.body, req.requestMeta || {}));
  accept = async (req, res) => res.json(await this.salesOrderService.accept(req.user.id, req.params.id, req.requestMeta || {}));
  void = async (req, res) => res.json(await this.salesOrderService.void(req.user.id, req.params.id, req.requestMeta || {}));
  convertToInvoice = async (req, res) => res.status(201).json(await this.salesOrderService.convertToInvoice(req.user.id, req.params.id, req.body || {}, req.requestMeta || {}));
}

module.exports = {
  SalesOrderController,
};
