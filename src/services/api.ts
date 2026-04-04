const API_BASE = "/api";

const getToken = () => localStorage.getItem("auth_token");
const isDevelopment = import.meta.env.DEV;

const deprecatedWrite = (methodName: string, replacement: string): never => {
  const message = `Deprecated frontend API write: ${methodName}. Use ${replacement} instead.`;
  console.warn(message);
  throw new Error(message);
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

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "An error occurred");
  }

  return data;
};

// AUTHORITATIVE: accounting source of truth
export const accountingInvoiceApi = {
  list: async () => apiRequest("/accounting/sales-invoices"),
  getById: async (id: string) => apiRequest(`/accounting/sales-invoices/${id}`),
  createDraft: async (invoice: any) =>
    apiRequest("/accounting/sales-invoices", {
      method: "POST",
      body: JSON.stringify(invoice),
    }),
  updateDraft: async (id: string, invoice: any) =>
    apiRequest(`/accounting/sales-invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(invoice),
    }),
  approve: async (id: string) =>
    apiRequest(`/accounting/sales-invoices/${id}/approve`, {
      method: "POST",
    }),
  post: async (id: string) =>
    apiRequest(`/accounting/sales-invoices/${id}/post`, {
      method: "POST",
    }),
  void: async (id: string) =>
    apiRequest(`/accounting/sales-invoices/${id}/void`, {
      method: "POST",
    }),
};

// AUTHORITATIVE: accounting source of truth
export const purchaseBillApi = {
  list: async () => apiRequest("/accounting/purchase-bills"),
  getById: async (id: string) => apiRequest(`/accounting/purchase-bills/${id}`),
  createDraft: async (bill: any) =>
    apiRequest("/accounting/purchase-bills", {
      method: "POST",
      body: JSON.stringify(bill),
    }),
  updateDraft: async (id: string, bill: any) =>
    apiRequest(`/accounting/purchase-bills/${id}`, {
      method: "PUT",
      body: JSON.stringify(bill),
    }),
  approve: async (id: string) =>
    apiRequest(`/accounting/purchase-bills/${id}/approve`, {
      method: "POST",
    }),
  post: async (id: string) =>
    apiRequest(`/accounting/purchase-bills/${id}/post`, {
      method: "POST",
    }),
  void: async (id: string) =>
    apiRequest(`/accounting/purchase-bills/${id}/void`, {
      method: "POST",
    }),
};

// AUTHORITATIVE: settlement source of truth
export const paymentApi = {
  apply: async (payment: any) =>
    apiRequest("/payments/apply", {
      method: "POST",
      body: JSON.stringify(payment),
    }),
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
  getAll: async () => apiRequest("/inventory"),
  getVendorProducts: async (linkedProfileId: string) => apiRequest(`/vendors/${linkedProfileId}/products`),
  getStockBalances: async () => apiRequest("/stock/balances"),
  createStockAdjustment: async (payload: any) =>
    apiRequest("/stock/adjustment", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  createStockTransfer: async (payload: any) =>
    apiRequest("/stock/transfer", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getItems: async () => apiRequest("/items"),
  createItem: async (payload: any) =>
    apiRequest("/items", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getWarehouses: async () => apiRequest("/warehouses"),
  createWarehouse: async (payload: any) =>
    apiRequest("/warehouses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  add: async (product: any) =>
    apiRequest("/inventory", {
      method: "POST",
      body: JSON.stringify(product),
    }),
  update: async (id: string, product: any) =>
    apiRequest(`/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(product),
    }),
  delete: async (id: string) =>
    apiRequest(`/inventory/${id}`, {
      method: "DELETE",
    }),
};

export const vendorProductsApi = {
  getMine: async () => apiRequest("/vendor-products/mine"),
  add: async (product: any) =>
    apiRequest("/vendor-products", {
      method: "POST",
      body: JSON.stringify(product),
    }),
  update: async (id: string, product: any) =>
    apiRequest(`/vendor-products/${id}`, {
      method: "PUT",
      body: JSON.stringify(product),
    }),
  delete: async (id: string) =>
    apiRequest(`/vendor-products/${id}`, {
      method: "DELETE",
    }),
};

export const settingsApi = {
  get: async () => apiRequest("/settings"),
  save: async (settings: any) =>
    apiRequest("/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
};

// DEPRECATED: use accountingReportsApi + accountingInvoiceApi derived hooks instead
export const dashboardApi = {
  getStats: async () => deprecatedWrite("dashboardApi.getStats", "useDashboardStats with accounting reports"),
};

export const clientsApi = {
  getRegisteredAccounts: async () => apiRequest("/accounts/registered"),
  getSalesClients: async () => apiRequest("/clients/sales"),
  getVendors: async () => apiRequest("/clients/vendors"),
  getClientList: async () => apiRequest("/clients/list"),
  getVendorList: async () => apiRequest("/vendors/list"),
  addClient: async (client: any) =>
    apiRequest("/clients", {
      method: "POST",
      body: JSON.stringify(client),
    }),
  addVendor: async (vendor: any) =>
    apiRequest("/vendors", {
      method: "POST",
      body: JSON.stringify(vendor),
    }),
  deleteClient: async (id: string) => apiRequest(`/clients/${id}`, { method: "DELETE" }),
  deleteVendor: async (id: string) => apiRequest(`/vendors/${id}`, { method: "DELETE" }),
};

// AUTHORITATIVE: accounting reports
export const accountingReportsApi = {
  getTrialBalance: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.endDate) query.set("end_date", params.endDate);
    return apiRequest(`/reports/trial-balance${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getProfitLoss: async (params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.endDate) query.set("end_date", params.endDate);
    return apiRequest(`/reports/profit-loss${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getBalanceSheet: async (params?: { asOfDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.asOfDate) query.set("as_of_date", params.asOfDate);
    return apiRequest(`/reports/balance-sheet${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getARAging: async (params?: { asOfDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.asOfDate) query.set("as_of_date", params.asOfDate);
    return apiRequest(`/reports/ar-aging${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getAPAging: async (params?: { asOfDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.asOfDate) query.set("as_of_date", params.asOfDate);
    return apiRequest(`/reports/ap-aging${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getCustomerStatement: async (customerId: string, params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.endDate) query.set("end_date", params.endDate);
    return apiRequest(`/reports/customers/${customerId}/statement${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getVendorStatement: async (vendorId: string, params?: { startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.endDate) query.set("end_date", params.endDate);
    return apiRequest(`/reports/vendors/${vendorId}/statement${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getStockSummary: async (params?: { asOfDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.asOfDate) query.set("as_of_date", params.asOfDate);
    return apiRequest(`/reports/stock-summary${query.toString() ? `?${query.toString()}` : ""}`);
  },
  getStockLedger: async (itemId: string, params?: { warehouseId?: string; startDate?: string; endDate?: string }) => {
    const query = new URLSearchParams();
    if (params?.warehouseId) query.set("warehouse_id", params.warehouseId);
    if (params?.startDate) query.set("start_date", params.startDate);
    if (params?.endDate) query.set("end_date", params.endDate);
    return apiRequest(`/reports/stock-ledger/${itemId}${query.toString() ? `?${query.toString()}` : ""}`);
  },
};

// DEPRECATED: temporary compatibility only
export const invoiceApi = {
  getAll: async () => accountingInvoiceApi.list(),
  add: async () => deprecatedWrite("invoiceApi.add", "accountingInvoiceApi.createDraft"),
  update: async () => deprecatedWrite("invoiceApi.update", "accountingInvoiceApi.updateDraft / approve / post / void"),
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
    if (isDevelopment) {
      console.warn("Deprecated frontend API read: reportsApi.get. Use accountingReportsApi instead.");
    }
    throw new Error("reportsApi.get is deprecated. Use accountingReportsApi report-specific methods instead.");
  },
};

export const authApi = {
  register: async (name: string, email: string, password: string) =>
    apiRequest("/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    }),
  login: async (email: string, password: string) =>
    apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
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
