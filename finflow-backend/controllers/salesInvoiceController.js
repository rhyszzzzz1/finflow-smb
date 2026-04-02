"use strict";

class SalesInvoiceController {
  constructor(salesInvoiceService) {
    this.salesInvoiceService = salesInvoiceService;
  }

  list = async (req, res) => {
    const rows = await this.salesInvoiceService.list(req.user.id);
    return res.json(rows);
  };

  getById = async (req, res) => {
    const invoice = await this.salesInvoiceService.getById(req.user.id, req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Sales invoice not found" });
    }
    return res.json(invoice);
  };

  createDraft = async (req, res) => {
    const invoice = await this.salesInvoiceService.createDraft(req.user.id, req.body, req.requestMeta || {});
    return res.status(201).json(invoice);
  };

  updateDraft = async (req, res) => {
    const invoice = await this.salesInvoiceService.updateDraft(req.user.id, req.params.id, req.body, req.requestMeta || {});
    return res.json(invoice);
  };

  approve = async (req, res) => {
    const invoice = await this.salesInvoiceService.approve(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(invoice);
  };

  post = async (req, res) => {
    const invoice = await this.salesInvoiceService.post(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(invoice);
  };

  void = async (req, res) => {
    const invoice = await this.salesInvoiceService.void(req.user.id, req.params.id, req.requestMeta || {});
    return res.json(invoice);
  };
}

module.exports = {
  SalesInvoiceController,
};
