// API service for communicating with the backend
const API_URL = "http://localhost:5001/api";

// Get token from localStorage
const getToken = () => localStorage.getItem("auth_token");

// API request helper
const apiRequest = async (endpoint: string, options: RequestInit = {}) => {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "An error occurred");
  }

  return data;
};

// ============= AUTH API =============

export const authApi = {
  register: async (name: string, email: string, password: string) => {
    return apiRequest("/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
  },

  login: async (email: string, password: string) => {
    return apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },
};

// ============= INVENTORY API =============

export const inventoryApi = {
  getAll: async () => {
    return apiRequest("/inventory");
  },

  getVendorProducts: async (linkedProfileId: string) => {
    return apiRequest(`/vendors/${linkedProfileId}/products`);
  },

  add: async (product: any) => {
    return apiRequest("/inventory", {
      method: "POST",
      body: JSON.stringify(product),
    });
  },

  update: async (id: number, product: any) => {
    return apiRequest(`/inventory/${id}`, {
      method: "PUT",
      body: JSON.stringify(product),
    });
  },

  delete: async (id: number) => {
    return apiRequest(`/inventory/${id}`, {
      method: "DELETE",
    });
  },
};

export const vendorProductsApi = {
  getMine: async () => {
    return apiRequest("/vendor-products/mine");
  },

  add: async (product: any) => {
    return apiRequest("/vendor-products", {
      method: "POST",
      body: JSON.stringify(product),
    });
  },

  update: async (id: string, product: any) => {
    return apiRequest(`/vendor-products/${id}`, {
      method: "PUT",
      body: JSON.stringify(product),
    });
  },

  delete: async (id: string) => {
    return apiRequest(`/vendor-products/${id}`, {
      method: "DELETE",
    });
  },
};

// ============= INVOICE API =============

export const invoiceApi = {
  getAll: async () => {
    return apiRequest("/invoices");
  },

  add: async (invoice: any) => {
    return apiRequest("/invoices", {
      method: "POST",
      body: JSON.stringify(invoice),
    });
  },

  update: async (id: number, invoice: any) => {
    return apiRequest(`/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(invoice),
    });
  },

  delete: async (id: number) => {
    return apiRequest(`/invoices/${id}`, {
      method: "DELETE",
    });
  },
};

// ============= RECEIVABLES API =============

export const receivablesApi = {
  getAll: async () => {
    return apiRequest("/receivables");
  },

  add: async (receivable: any) => {
    return apiRequest("/receivables", {
      method: "POST",
      body: JSON.stringify(receivable),
    });
  },

  update: async (id: number, receivable: any) => {
    return apiRequest(`/receivables/${id}`, {
      method: "PUT",
      body: JSON.stringify(receivable),
    });
  },

  delete: async (id: number) => {
    return apiRequest(`/receivables/${id}`, {
      method: "DELETE",
    });
  },
};

// ============= PAYABLES API =============

export const payablesApi = {
  getAll: async () => {
    return apiRequest("/payables");
  },

  add: async (payable: any) => {
    return apiRequest("/payables", {
      method: "POST",
      body: JSON.stringify(payable),
    });
  },

  update: async (id: number, payable: any) => {
    return apiRequest(`/payables/${id}`, {
      method: "PUT",
      body: JSON.stringify(payable),
    });
  },

  delete: async (id: number) => {
    return apiRequest(`/payables/${id}`, {
      method: "DELETE",
    });
  },
};

// ============= SALES API =============

export const salesApi = {
  getAll: async () => {
    return apiRequest("/sales");
  },

  add: async (sale: any) => {
    return apiRequest("/sales", {
      method: "POST",
      body: JSON.stringify(sale),
    });
  },
};

// ============= PURCHASES API =============

export const purchasesApi = {
  getAll: async () => {
    return apiRequest("/purchases");
  },

  add: async (purchase: any) => {
    return apiRequest("/purchases", {
      method: "POST",
      body: JSON.stringify(purchase),
    });
  },
};

// ============= SETTINGS API =============

export const settingsApi = {
  get: async () => {
    return apiRequest("/settings");
  },

  save: async (settings: any) => {
    return apiRequest("/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    });
  },
};

// ============= DASHBOARD API =============

export const dashboardApi = {
  getStats: async () => {
    return apiRequest("/dashboard/stats");
  },
};

// ============= CLIENTS API =============

export const clientsApi = {
  getRegisteredAccounts: async () => {
    return apiRequest("/accounts/registered");
  },

  getSalesClients: async () => {
    return apiRequest("/clients/sales");
  },

  getVendors: async () => {
    return apiRequest("/clients/vendors");
  },

  getClientList: async () => {
    return apiRequest("/clients/list");
  },

  getVendorList: async () => {
    return apiRequest("/vendors/list");
  },

  addClient: async (client: any) => {
    return apiRequest("/clients", {
      method: "POST",
      body: JSON.stringify(client),
    });
  },

  addVendor: async (vendor: any) => {
    return apiRequest("/vendors", {
      method: "POST",
      body: JSON.stringify(vendor),
    });
  },

  deleteClient: async (id: string) => {
    return apiRequest(`/clients/${id}`, { method: "DELETE" });
  },

  deleteVendor: async (id: string) => {
    return apiRequest(`/vendors/${id}`, { method: "DELETE" });
  },
};

// ============= REPORTS API =============

export const reportsApi = {
  get: async (year?: number) => {
    const q = year ? `?year=${year}` : "";
    return apiRequest(`/reports${q}`);
  },
};

// ============= KYC API =============

export const kycApi = {
  getStatus: async () => {
    return apiRequest("/kyc/status");
  },

  uploadDocument: async (file: File, documentType: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentType", documentType);

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_URL}/kyc/upload`, {
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

  getDocuments: async () => {
    return apiRequest("/kyc/documents");
  },

  getAdminDocuments: async () => {
    return apiRequest("/kyc/admin/documents");
  },

  approveDocument: async (documentId: string) => {
    return apiRequest(`/kyc/admin/approve/${documentId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "approved" }),
    });
  },

  rejectDocument: async (documentId: string, reason: string) => {
    return apiRequest(`/kyc/admin/reject/${documentId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "rejected", rejectionReason: reason }),
    });
  },
};
