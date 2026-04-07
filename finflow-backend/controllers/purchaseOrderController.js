"use strict";

class PurchaseOrderController {
  constructor(purchaseOrderService) {
    this.purchaseOrderService = purchaseOrderService;
  }

  list = async (req, res) => {
    const rows = await this.purchaseOrderService.list(req.user.id);
    return res.json(rows);
  };

  getById = async (req, res) => {
    const order = await this.purchaseOrderService.getById(req.user.id, req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Purchase order not found" });
    }
    return res.json(order);
  };

  createDraft = async (req, res) => {
    const order = await this.purchaseOrderService.createDraft(req.user.id, req.body, req.requestMeta || {});
    return res.status(201).json(order);
  };

  updateDraft = async (req, res) => {
    const order = await this.purchaseOrderService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {});
    return res.json(order);
  };

  approve = async (req, res) => {
    const order = await this.purchaseOrderService.approve(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(order);
  };

  void = async (req, res) => {
    const order = await this.purchaseOrderService.void(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(order);
  };
}

module.exports = {
  PurchaseOrderController,
};
