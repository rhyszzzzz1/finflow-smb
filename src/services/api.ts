const API_BASE = "/api";
const API_TIMEOUT_MS = 8000;

const getToken = () => localStorage.getItem("auth_token");
const isDevelopment = import.meta.env.DEV;

type QueryParams = Record<string, string | number | boolean | null | undefined>;

const deprecatedWrite = (methodName: string, replacement: string): never => {
  const message = `Deprecated frontend API write: ${methodName}. Use ${replacement} instead.`;
  console.warn(message);
  throw new Error(message);
};

const deprecatedRead = (methodName: string, replacement: string) => {
  if (isDevelopment) {
    console.warn(`Deprecated frontend API read: ${methodName}. Use ${replacement} instead.`);
  }
};

const buildQuery = (params?: QueryParams) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
};

const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "An error occurred");
    }

    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("Request timed out while loading data");
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const post = (endpoint: string, body?: any) =>
  apiRequest(endpoint, {
    method: "POST",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const put = (endpoint: string, body?: any) =>
  apiRequest(endpoint, {
    method: "PUT",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

const remove = (endpoint: string) =>
  apiRequest(endpoint, {
    method: "DELETE",
  });

const withAccountingPath = (path: string) => `/accounting${path}`;

const createDocumentApi = (basePath: string) => ({
  list: async () => apiRequest(withAccountingPath(basePath)),
  getById: async (id: string) => apiRequest(withAccountingPath(`${basePath}/${id}`)),
  createDraft: async (payload: any) => post(withAccountingPath(basePath), payload),
  updateDraft: async (id: string, payload: any) => put(withAccountingPath(`${basePath}/${id}`), payload),
  approve: async (id: string) => post(withAccountingPath(`${basePath}/${id}/approve`)),
  post: async (id: string) => post(withAccountingPath(`${basePath}/${id}/post`)),
  void: async (id: string) => post(withAccountingPath(`${basePath}/${id}/void`)),
});

// AUTHORITATIVE: accounting source of truth
export const accountingInvoiceApi = {
  ...createDocumentApi("/sales-invoices"),
  submit: async (id: string, payload?: any) => post(withAccountingPath(`/sales-invoices/${id}/submit`), payload || {}),
  reject: async (id: string, payload: any) => post(withAccountingPath(`/sales-invoices/${id}/reject`), payload),
  resubmit: async (id: string, payload?: any) => post(withAccountingPath(`/sales-invoices/${id}/resubmit`), payload || {}),
};

// AUTHORITATIVE: sales workflow
export const salesQuoteApi = {
  list: async () => apiRequest(withAccountingPath("/sales-quotes")),
  getById: async (id: string) => apiRequest(withAccountingPath(`/sales-quotes/${id}`)),
  createDraft: async (payload: any) => post(withAccountingPath("/sales-quotes"), payload),
  send: async (id: string) => post(withAccountingPath(`/sales-quotes/${id}/send`)),
  accept: async (id: string) => post(withAccountingPath(`/sales-quotes/${id}/accept`)),
  convertToOrder: async (id: string, payload?: any) => post(withAccountingPath(`/sales-quotes/${id}/convert-to-order`), payload || {}),
  void: async (id: string) => post(withAccountingPath(`/sales-quotes/${id}/void`)),
};

// AUTHORITATIVE: sales workflow
export const salesOrderApi = {
  list: async () => apiRequest(withAccountingPath("/sales-orders")),
  getById: async (id: string) => apiRequest(withAccountingPath(`/sales-orders/${id}`)),
  createDraft: async (payload: any) => post(withAccountingPath("/sales-orders"), payload),
  accept: async (id: string) => post(withAccountingPath(`/sales-orders/${id}/accept`)),
  convertToInvoice: async (id: string, payload?: any) => post(withAccountingPath(`/sales-orders/${id}/convert-to-invoice`), payload || {}),
  void: async (id: string) => post(withAccountingPath(`/sales-orders/${id}/void`)),
};

// AUTHORITATIVE: purchasing source of truth
export const purchaseBillApi = {
  ...createDocumentApi("/purchase-bills"),
  submit: async (id: string, payload?: any) => post(withAccountingPath(`/purchase-bills/${id}/submit`), payload || {}),
  reject: async (id: string, payload: any) => post(withAccountingPath(`/purchase-bills/${id}/reject`), payload),
  resubmit: async (id: string, payload?: any) => post(withAccountingPath(`/purchase-bills/${id}/resubmit`), payload || {}),
};

// AUTHORITATIVE: procurement workflow
export const purchaseOrderApi = {
  list: async () => apiRequest(withAccountingPath("/purchase-orders")),
  getById: async (id: string) => apiRequest(withAccountingPath(`/purchase-orders/${id}`)),
  createDraft: async (payload: any) => post(withAccountingPath("/purchase-orders"), payload),
  updateDraft: async (id: string, payload: any) => put(withAccountingPath(`/purchase-orders/${id}`), payload),
  approve: async (id: string) => post(withAccountingPath(`/purchase-orders/${id}/approve`)),
  void: async (id: string) => post(withAccountingPath(`/purchase-orders/${id}/void`)),
};

// AUTHORITATIVE: procurement workflow
export const goodsReceiptApi = {
  list: async () => apiRequest(withAccountingPath("/goods-receipts")),
  getById: async (id: string) => apiRequest(withAccountingPath(`/goods-receipts/${id}`)),
  createDraft: async (payload: any) => post(withAccountingPath("/goods-receipts"), payload),
  updateDraft: async (id: string, payload: any) => put(withAccountingPath(`/goods-receipts/${id}`), payload),
  post: async (id: string) => post(withAccountingPath(`/goods-receipts/${id}/post`)),
  void: async (id: string) => post(withAccountingPath(`/goods-receipts/${id}/void`)),
};

// AUTHORITATIVE: returns/adjustments
export const salesCreditNoteApi = {
  ...createDocumentApi("/sales-credit-notes"),
};

// AUTHORITATIVE: returns/adjustments
export const purchaseDebitNoteApi = {
  ...createDocumentApi("/purchase-debit-notes"),
};

// AUTHORITATIVE: bilateral relationship model
export const businessRelationshipApi = {
  list: async (params?: { status?: string; onlyActive?: boolean }) =>
    apiRequest(`/business-relationships${buildQuery({
      status: params?.status,
      only_active: params?.onlyActive,
    })}`),
  listActive: async () => apiRequest("/business-relationships/active"),
  invite: async (payload: any) => post("/business-relationships/invite", payload),
  accept: async (id: string) => post(`/business-relationships/${id}/accept`),
};

// AUTHORITATIVE: settlement source of truth
export const paymentApi = {
  apply: async (payment: any) => post("/payments/apply", payment),
  listBankAccounts: async () => apiRequest("/bank-accounts"),
  getInvoiceOutstanding: async (id: string) => apiRequest(`/outstanding/invoices/${id}`),
  getPurchaseOutstanding: async (id: string) => apiRequest(`/outstanding/purchases/${id}`),
  getCustomerBalance: async (id: string) => apiRequest(`/balances/customers/${id}`),
  getVendorBalance: async (id: string) => apiRequest(`/balances/vendors/${id}`),
};

// AUTHORITATIVE: derived read-only balances
export const receivablesReadApi = {
  getAll: async () => apiRequest("/receivables"),
  getAging: async () => apiRequest("/aging/receivables"),
};

// AUTHORITATIVE: derived read-only balances
export const payablesReadApi = {
  getAll: async () => apiRequest("/payables"),
  getAging: async () => apiRequest("/aging/payables"),
};

// AUTHORITATIVE: inventory source of truth
export const inventoryApi = {
  // DEPRECATED COMPATIBILITY: legacy inventory-shaped list for older UI parity.
  getAll: async () => apiRequest("/inventory"),
  getVendorProducts: async (linkedProfileId: string) => apiRequest(`/vendors/${linkedProfileId}/products`),
  getStockBalances: async () => apiRequest("/stock/balances"),
  createStockAdjustment: async (payload: any) => post("/stock/adjustment", payload),
  createStockTransfer: async (payload: any) => post("/stock/transfer", payload),
  getItems: async () => apiRequest("/items"),
  createItem: async (payload: any) => post("/items", payload),
  getWarehouses: async () => apiRequest("/warehouses"),
  createWarehouse: async (payload: any) => post("/warehouses", payload),
  listItemVendorLinks: async (itemId: string) => apiRequest(`/items/${itemId}/vendors`),
  addItemVendorLink: async (itemId: string, payload: any) => post(`/items/${itemId}/vendors`, payload),
  markPreferredVendor: async (itemId: string, linkId: string) => post(`/items/${itemId}/vendors/${linkId}/preferred`),
  // Transitional compatibility only:
  add: async (product: any) => post("/inventory", product),
  update: async (id: string, product: any) => put(`/inventory/${id}`, product),
  delete: async (id: string) => remove(`/inventory/${id}`),
};

export const vendorProductsApi = {
  getMine: async () => apiRequest("/vendor-products/mine"),
  add: async (product: any) => post("/vendor-products", product),
  update: async (id: string, product: any) => put(`/vendor-products/${id}`, product),
  delete: async (id: string) => remove(`/vendor-products/${id}`),
};

export const settingsApi = {
  get: async () => apiRequest("/settings"),
  save: async (settings: any) => post("/settings", settings),
};

// DEPRECATED: use accountingReportsApi + workflow hooks instead
export const dashboardApi = {
  getStats: async () => deprecatedWrite("dashboardApi.getStats", "useDashboardStats with workflow-aware accounting reports"),
};

// Transitional relationship/contact compatibility layer
export const clientsApi = {
  getRegisteredAccounts: async () => apiRequest("/accounts/registered"),
  getSalesClients: async () => apiRequest("/clients/sales"),
  getVendors: async () => apiRequest("/clients/vendors"),
  getClientList: async () => apiRequest("/clients/list"),
  getVendorList: async () => apiRequest("/vendors/list"),
  addClient: async (client: any) => post("/clients", client),
  addVendor: async (vendor: any) => post("/vendors", vendor),
  deleteClient: async (id: string) => remove(`/clients/${id}`),
  deleteVendor: async (id: string) => remove(`/vendors/${id}`),
};

// AUTHORITATIVE: accounting reports
export const accountingReportsApi = {
  getTrialBalance: async (params?: { startDate?: string; endDate?: string }) =>
    apiRequest(`/reports/trial-balance${buildQuery({ start_date: params?.startDate, end_date: params?.endDate })}`),
  getProfitLoss: async (params?: { startDate?: string; endDate?: string }) =>
    apiRequest(`/reports/profit-loss${buildQuery({ start_date: params?.startDate, end_date: params?.endDate })}`),
  getBalanceSheet: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/balance-sheet${buildQuery({ as_of_date: params?.asOfDate })}`),
  getARAging: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/ar-aging${buildQuery({ as_of_date: params?.asOfDate })}`),
  getAPAging: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/ap-aging${buildQuery({ as_of_date: params?.asOfDate })}`),
  getCustomerStatement: async (customerId: string, params?: { startDate?: string; endDate?: string }) =>
    apiRequest(`/reports/customers/${customerId}/statement${buildQuery({ start_date: params?.startDate, end_date: params?.endDate })}`),
  getVendorStatement: async (vendorId: string, params?: { startDate?: string; endDate?: string }) =>
    apiRequest(`/reports/vendors/${vendorId}/statement${buildQuery({ start_date: params?.startDate, end_date: params?.endDate })}`),
  getStockSummary: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/stock-summary${buildQuery({ as_of_date: params?.asOfDate })}`),
  getStockLedger: async (itemId: string, params?: { warehouseId?: string; startDate?: string; endDate?: string }) =>
    apiRequest(`/reports/stock-ledger/${itemId}${buildQuery({
      warehouse_id: params?.warehouseId,
      start_date: params?.startDate,
      end_date: params?.endDate,
    })}`),
  getARControlReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/ar-control${buildQuery({ as_of_date: params?.asOfDate })}`),
  getAPControlReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/ap-control${buildQuery({ as_of_date: params?.asOfDate })}`),
  getInventoryControlReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/inventory-control${buildQuery({ as_of_date: params?.asOfDate })}`),
  getTaxControlReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/tax-control${buildQuery({ as_of_date: params?.asOfDate })}`),
  getAdvancesReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/advances${buildQuery({ as_of_date: params?.asOfDate })}`),
  getGRNIControlReconciliation: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/grni-control${buildQuery({ as_of_date: params?.asOfDate })}`),
  getReconciliationSummary: async (params?: { asOfDate?: string }) =>
    apiRequest(`/reports/reconciliations/summary${buildQuery({ as_of_date: params?.asOfDate })}`),
};

// DEPRECATED: temporary compatibility only
export const invoiceApi = {
  getAll: async () => accountingInvoiceApi.list(),
  add: async () => deprecatedWrite("invoiceApi.add", "accountingInvoiceApi.createDraft"),
  update: async () => deprecatedWrite("invoiceApi.update", "accountingInvoiceApi.updateDraft / submit / approve / post / void"),
  delete: async () => deprecatedWrite("invoiceApi.delete", "accountingInvoiceApi.void"),
};

// DEPRECATED: derived balances are read-only
export const receivablesApi = {
  getAll: async () => receivablesReadApi.getAll(),
  getAging: async () => receivablesReadApi.getAging(),
  add: async () => deprecatedWrite("receivablesApi.add", "paymentApi.apply"),
  update: async () => deprecatedWrite("receivablesApi.update", "paymentApi.apply"),
  delete: async () => deprecatedWrite("receivablesApi.delete", "paymentApi.apply"),
};

// DEPRECATED: derived balances are read-only
export const payablesApi = {
  getAll: async () => payablesReadApi.getAll(),
  getAging: async () => payablesReadApi.getAging(),
  add: async () => deprecatedWrite("payablesApi.add", "paymentApi.apply"),
  update: async () => deprecatedWrite("payablesApi.update", "paymentApi.apply"),
  delete: async () => deprecatedWrite("payablesApi.delete", "paymentApi.apply"),
};

// DEPRECATED: compatibility only
export const salesApi = {
  getAll: async () => accountingInvoiceApi.list(),
  add: async () => deprecatedWrite("salesApi.add", "accountingInvoiceApi.createDraft / post"),
};

// DEPRECATED: compatibility only
export const purchasesApi = {
  getAll: async () => purchaseBillApi.list(),
  add: async () => deprecatedWrite("purchasesApi.add", "purchaseBillApi.createDraft / post"),
};

// DEPRECATED: use accountingReportsApi directly
export const reportsApi = {
  get: async () => {
    deprecatedRead("reportsApi.get", "accountingReportsApi.*");
    throw new Error("reportsApi.get is deprecated. Use accountingReportsApi report-specific methods instead.");
  },
};

export const authApi = {
  register: async (name: string, email: string, password: string) =>
    post("/register", { name, email, password }),
  login: async (email: string, password: string) =>
    post("/login", { email, password }),
};

export const kycApi = {
  getStatus: async () => apiRequest("/kyc/status"),
  uploadDocument: async (file: File, documentType: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}/kyc/upload`, {
      method: "POST",
      headers,
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || "Upload failed");
    }
    return data;
  },
  getDocuments: async () => apiRequest("/kyc/documents"),
  getAdminDocuments: async () => apiRequest("/kyc/admin/documents"),
  approveDocument: async (documentId: string) =>
    apiRequest(`/kyc/admin/approve/${documentId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
    }),
  rejectDocument: async (documentId: string, reason: string) =>
    apiRequest(`/kyc/admin/reject/${documentId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    }),
};
