"use strict";

class SalesCreditNoteController {
  constructor(salesCreditNoteService) {
    this.salesCreditNoteService = salesCreditNoteService;
  }

  list = async (req, res) => res.json(await this.salesCreditNoteService.list(req.user.id));
  getById = async (req, res) => {
    const note = await this.salesCreditNoteService.getById(req.user.id, req.params.id);
    if (!note) return res.status(404).json({ message: "Sales credit note not found" });
    return res.json(note);
  };
  createDraft = async (req, res) => res.status(201).json(await this.salesCreditNoteService.createDraft(req.user.id, req.body, req.requestMeta || {}));
  updateDraft = async (req, res) => res.json(await this.salesCreditNoteService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {}));
  approve = async (req, res) => res.json(await this.salesCreditNoteService.approve(req.user.id, req.params.id, req.requestMeta || {}));
  post = async (req, res) => res.json(await this.salesCreditNoteService.post(req.user.id, req.params.id, req.requestMeta || {}));
  void = async (req, res) => res.json(await this.salesCreditNoteService.void(req.user.id, req.params.id, req.requestMeta || {}));
}

module.exports = {
  SalesCreditNoteController,
};
