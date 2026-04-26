"use strict";

class PaymentController {
  constructor(paymentService, khaltiVendorPaymentService = null) {
    this.paymentService = paymentService;
    this.khaltiVendorPaymentService = khaltiVendorPaymentService;
  }

  applyPayment = async (req, res) => {
    const result = await this.paymentService.applyPayment(req.user.id, req.body, req.requestMeta || {});
    return res.status(201).json(result);
  };

  getReceivables = async (req, res) => {
    const rows = await this.paymentService.getReceivables(req.user.id);
    return res.json(rows);
  };

  getPayables = async (req, res) => {
    const rows = await this.paymentService.getPayables(req.user.id);
    return res.json(rows);
  };

  getInvoiceOutstanding = async (req, res) => {
    const row = await this.paymentService.getInvoiceOutstanding(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ message: "Invoice not found" });
    return res.json(row);
  };

  getPurchaseOutstanding = async (req, res) => {
    const row = await this.paymentService.getPurchaseOutstanding(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ message: "Purchase not found" });
    return res.json(row);
  };

  getReceivablesAging = async (req, res) => {
    const result = await this.paymentService.getReceivablesAging(req.user.id);
    return res.json(result);
  };

  getPayablesAging = async (req, res) => {
    const result = await this.paymentService.getPayablesAging(req.user.id);
    return res.json(result);
  };

  getCustomerBalance = async (req, res) => {
    const result = await this.paymentService.calculateCustomerBalance(req.user.id, req.params.id);
    return res.json({ customer_id: req.params.id, outstanding_balance: result });
  };

  getVendorBalance = async (req, res) => {
    const result = await this.paymentService.calculateVendorBalance(req.user.id, req.params.id);
    return res.json({ vendor_id: req.params.id, outstanding_balance: result });
  };

  listBankAccounts = async (req, res) => {
    const rows = await this.paymentService.listBankAccounts(req.user.id);
    return res.json(rows);
  };

  blockDerivedWrite = async (req, res) => {
    console.warn(`[LEGACY_ENDPOINT] Legacy endpoint used — migrate frontend [write] ${req.method} ${req.originalUrl}`);
    return res.status(410).json({
      message: "This endpoint is deprecated. Use accounting APIs instead.",
      detail: "Receivables/payables are derived from invoices/purchases and payment allocations. Direct edits are disabled.",
    });
  };

  khaltiInitiateVendor = async (req, res) => {
    if (!this.khaltiVendorPaymentService) {
      return res.status(503).json({ message: "Khalti vendor payments are not enabled on this server" });
    }
    try {
      const result = await this.khaltiVendorPaymentService.initiateVendorPayment(
        req.user.id,
        req.body,
        req.requestMeta || {}
      );
      return res.json(result);
    } catch (err) {
      const code = err.statusCode || 500;
      return res.status(code).json({ message: err.message || "Khalti initiate failed" });
    }
  };

  khaltiVerifyVendor = async (req, res) => {
    if (!this.khaltiVendorPaymentService) {
      return res.status(503).json({ message: "Khalti vendor payments are not enabled on this server" });
    }
    try {
      const result = await this.khaltiVendorPaymentService.verifyAndSettle(
        req.user.id,
        req.body,
        req.requestMeta || {}
      );
      return res.json(result);
    } catch (err) {
      const code = err.statusCode || 500;
      return res.status(code).json({ message: err.message || "Khalti verify failed" });
    }
  };
}

module.exports = {
  PaymentController,
};
