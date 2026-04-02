"use strict";

class PurchaseBillController {
  constructor(purchaseBillService) {
    this.purchaseBillService = purchaseBillService;
  }

  list = async (req, res) => {
    const rows = await this.purchaseBillService.list(req.user.id);
    return res.json(rows);
  };

  getById = async (req, res) => {
    const bill = await this.purchaseBillService.getById(req.user.id, req.params.id);
    if (!bill) {
      return res.status(404).json({ message: "Purchase bill not found" });
    }
    return res.json(bill);
  };

  createDraft = async (req, res) => {
    const bill = await this.purchaseBillService.createDraft(req.user.id, req.body, req.requestMeta || {});
    return res.status(201).json(bill);
  };

  updateDraft = async (req, res) => {
    const bill = await this.purchaseBillService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {});
    return res.json(bill);
  };

  approve = async (req, res) => {
    const bill = await this.purchaseBillService.approve(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(bill);
  };

  post = async (req, res) => {
    const bill = await this.purchaseBillService.post(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(bill);
  };

  void = async (req, res) => {
    const bill = await this.purchaseBillService.void(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(bill);
  };
}

module.exports = {
  PurchaseBillController,
};
