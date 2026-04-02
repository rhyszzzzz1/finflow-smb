"use strict";

class PaymentModel {
  constructor(settlementService) {
    this.settlementService = settlementService;
  }

  applyPayment(userId, payload, requestMeta) {
    return this.settlementService.applyPayment(userId, payload, requestMeta);
  }

  allocatePayment(...args) {
    return this.settlementService.allocatePayment(...args);
  }

  calculateDocumentOutstanding(userId, targetType, targetId) {
    return this.settlementService.calculateDocumentOutstanding(userId, targetType, targetId);
  }

  getInvoiceOutstanding(userId, invoiceId) {
    return this.settlementService.calculateDocumentOutstanding(userId, "sales_invoice", invoiceId);
  }

  getPurchaseOutstanding(userId, purchaseId) {
    return this.settlementService.calculateDocumentOutstanding(userId, "purchase_bill", purchaseId);
  }

  getOutstandingReceivables(userId) {
    return this.settlementService.getOutstandingReceivables(userId);
  }

  getOutstandingPayables(userId) {
    return this.settlementService.getOutstandingPayables(userId);
  }

  calculateCustomerBalance(userId, customerId) {
    return this.settlementService.calculateCustomerBalance(userId, customerId);
  }

  calculateVendorBalance(userId, vendorId) {
    return this.settlementService.calculateVendorBalance(userId, vendorId);
  }

  getAging(userId, type) {
    return type === "receivable"
      ? this.settlementService.calculateARAging(userId)
      : this.settlementService.calculateAPAging(userId);
  }

  listBankAccounts(userId) {
    return this.settlementService.listBankAccounts(userId);
  }
}

module.exports = {
  PaymentModel,
};
