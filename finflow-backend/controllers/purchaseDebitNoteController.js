"use strict";

class PurchaseDebitNoteController {
  constructor(purchaseDebitNoteService) {
    this.purchaseDebitNoteService = purchaseDebitNoteService;
  }

  list = async (req, res) => res.json(await this.purchaseDebitNoteService.list(req.user.id));
  getById = async (req, res) => {
    const note = await this.purchaseDebitNoteService.getById(req.user.id, req.params.id);
    if (!note) return res.status(404).json({ message: "Purchase debit note not found" });
    return res.json(note);
  };
  createDraft = async (req, res) => res.status(201).json(await this.purchaseDebitNoteService.createDraft(req.user.id, req.body, req.requestMeta || {}));
  updateDraft = async (req, res) => res.json(await this.purchaseDebitNoteService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {}));
  approve = async (req, res) => res.json(await this.purchaseDebitNoteService.approve(req.user.id, req.params.id, req.requestMeta || {}));
  post = async (req, res) => res.json(await this.purchaseDebitNoteService.post(req.user.id, req.params.id, req.requestMeta || {}));
  void = async (req, res) => res.json(await this.purchaseDebitNoteService.void(req.user.id, req.params.id, req.requestMeta || {}));
}

module.exports = {
  PurchaseDebitNoteController,
};
