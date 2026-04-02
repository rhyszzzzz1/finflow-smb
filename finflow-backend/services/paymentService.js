"use strict";

class PaymentService {
  constructor(paymentModel, idFactory) {
    this.paymentModel = paymentModel;
    this.idFactory = idFactory;
  }

  async applyPayment(userId, payload, requestMeta) {
    return this.paymentModel.applyPayment(userId, payload, requestMeta);
  }

  getReceivables(userId) {
    return this.paymentModel.getOutstandingReceivables(userId);
  }

  getPayables(userId) {
    return this.paymentModel.getOutstandingPayables(userId);
  }

  getInvoiceOutstanding(userId, invoiceId) {
    return this.paymentModel.getInvoiceOutstanding(userId, invoiceId);
  }

  getPurchaseOutstanding(userId, purchaseId) {
    return this.paymentModel.getPurchaseOutstanding(userId, purchaseId);
  }

  getReceivablesAging(userId) {
    return this.paymentModel.getAging(userId, "receivable");
  }

  getPayablesAging(userId) {
    return this.paymentModel.getAging(userId, "payable");
  }

  calculateCustomerBalance(userId, customerId) {
    return this.paymentModel.calculateCustomerBalance(userId, customerId);
  }

  calculateVendorBalance(userId, vendorId) {
    return this.paymentModel.calculateVendorBalance(userId, vendorId);
  }

  listBankAccounts(userId) {
    return this.paymentModel.listBankAccounts(userId);
  }
}

module.exports = {
  PaymentService,
};
