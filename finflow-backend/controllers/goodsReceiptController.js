"use strict";

class GoodsReceiptController {
  constructor(goodsReceiptService) {
    this.goodsReceiptService = goodsReceiptService;
  }

  list = async (req, res) => {
    const rows = await this.goodsReceiptService.list(req.user.id);
    return res.json(rows);
  };

  getById = async (req, res) => {
    const receipt = await this.goodsReceiptService.getById(req.user.id, req.params.id);
    if (!receipt) {
      return res.status(404).json({ message: "Goods receipt not found" });
    }
    return res.json(receipt);
  };

  createDraft = async (req, res) => {
    const receipt = await this.goodsReceiptService.createDraft(req.user.id, req.body, req.requestMeta || {});
    return res.status(201).json(receipt);
  };

  updateDraft = async (req, res) => {
    const receipt = await this.goodsReceiptService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {});
    return res.json(receipt);
  };

  post = async (req, res) => {
    const receipt = await this.goodsReceiptService.post(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(receipt);
  };

  void = async (req, res) => {
    const receipt = await this.goodsReceiptService.void(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(receipt);
  };
}

module.exports = {
  GoodsReceiptController,
};
