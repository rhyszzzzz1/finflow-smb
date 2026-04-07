"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { CounterpartyService } = require("../services/counterpartyService");
const { SalesInvoiceService } = require("../services/salesInvoiceService");
const { PurchaseBillService } = require("../services/purchaseBillService");
const { SettlementService } = require("../services/settlementService");

function createIdFactory(prefix) {
  let i = 1;
  return () => `${prefix}-${i++}`;
}

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createFakePool() {
  const state = {
    companies: [{ id: "company-1", legacy_profile_id: "user-1", owner_profile_id: "user-1" }],
    customers: [],
    clients: [],
    vendors: [],
    counterparties: [],
    counterparty_roles: [],
    sales_invoice_headers: [],
    sales_invoice_lines: [],
    purchase_bill_headers: [],
    purchase_bill_lines: [],
    payment_allocations: [],
  };

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT id FROM companies")) {
      const row = state.companies.find((c) => c.legacy_profile_id === params[0] || c.owner_profile_id === params[1]);
      return [[row ? { id: row.id } : undefined].filter(Boolean)];
    }

    if (q.startsWith("SELECT c.id, c.linked_company_id AS linked_profile_id")) {
      const row = state.customers.find((c) =>
        c.id === params[0]
        && c.company_id === params[1]
        && (c.status || "active") !== "inactive"
      );
      return [[row ? {
        id: row.id,
        linked_profile_id: row.linked_company_id || null,
        display_name: row.display_name || row.legal_name || row.email || null,
        legal_name: row.legal_name || null,
        pan_vat_number: row.pan_vat_number || row.tax_number || null,
        email: row.email || null,
        phone: row.phone || null,
        address: row.billing_address || row.address || null,
      } : undefined].filter(Boolean)];
    }

    if (q.startsWith("SELECT v.id, COALESCE(v.linked_company_id, v.linked_profile_id) AS linked_profile_id")) {
      const row = state.vendors.find((v) =>
        v.id === params[0]
        && v.company_id === params[1]
        && (v.status || "active") !== "inactive"
      );
      return [[row ? {
        id: row.id,
        linked_profile_id: row.linked_company_id || row.linked_profile_id || null,
        display_name: row.display_name || row.vendor_name || row.legal_name || row.email || null,
        legal_name: row.legal_name || row.vendor_name || null,
        pan_vat_number: row.pan_vat_number || row.tax_number || null,
        email: row.email || null,
        phone: row.phone || null,
        address: row.billing_address || row.address || null,
        counterparty_id: row.counterparty_id || null,
      } : undefined].filter(Boolean)];
    }

    if (q.startsWith("SELECT id, allow_posting, is_active FROM chart_of_accounts")) {
      return [[{ id: params[0] || "acct-1", allow_posting: 1, is_active: 1 }]];
    }

    if (q.startsWith("SELECT id FROM counterparty_roles")) {
      const row = state.counterparty_roles.find((r) => r.counterparty_id === params[0] && r.role_type === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("INSERT INTO counterparty_roles")) {
      state.counterparty_roles.push({ id: params[0], counterparty_id: params[1], role_type: params[2] });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT cp.* FROM counterparties cp JOIN counterparty_roles cr")) {
      const roleType = params[0];
      let row = null;
      if (q.includes("WHERE cp.id = ?")) {
        row = state.counterparties.find((cp) =>
          cp.id === params[1]
          && cp.company_id === params[2]
          && cp.is_active === 1
          && state.counterparty_roles.some((r) => r.counterparty_id === cp.id && r.role_type === roleType)
        );
      } else {
        const companyId = params[1];
        const name1 = String(params[2] || "").toLowerCase();
        row = state.counterparties.find((cp) =>
          cp.company_id === companyId
          && cp.is_active === 1
          && state.counterparty_roles.some((r) => r.counterparty_id === cp.id && r.role_type === roleType)
          && (String(cp.display_name || "").toLowerCase() === name1 || String(cp.legal_name || "").toLowerCase() === name1)
        );
      }
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT cp.* FROM counterparties cp")) {
      if (q.includes("WHERE cp.id = ?")) {
        const row = state.counterparties.find((cp) => cp.id === params[0] && cp.company_id === params[1] && cp.is_active === 1);
        return [[row].filter(Boolean)];
      }
      return [[]];
    }

    if (q.startsWith("SELECT * FROM counterparties WHERE company_id = ? AND linked_profile_id = ?")) {
      const row = state.counterparties.find((cp) => cp.company_id === params[0] && cp.linked_profile_id === params[1] && cp.is_active === 1);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("INSERT INTO counterparties")) {
      state.counterparties.push({
        id: params[0],
        company_id: params[1],
        linked_profile_id: params[2],
        display_name: params[3],
        legal_name: params[4],
        tax_number: params[5],
        email: params[6],
        phone: params[7],
        address: params[8],
        is_active: 1,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT id, counterparty_id, linked_profile_id, client_name AS display_name")) {
      const row = state.clients.find((client) => client.id === params[0] && client.user_id === params[1]);
      return [[row ? {
        id: row.id,
        counterparty_id: row.counterparty_id || null,
        linked_profile_id: row.linked_profile_id || null,
        display_name: row.client_name,
        email: row.email || null,
        phone: row.phone || null,
        address: row.address || null,
      } : undefined].filter(Boolean)];
    }

    if (q.startsWith("SELECT id, counterparty_id, linked_profile_id, vendor_name AS display_name")) {
      const row = state.vendors.find((vendor) => vendor.id === params[0] && vendor.user_id === params[1]);
      return [[row ? {
        id: row.id,
        counterparty_id: row.counterparty_id || null,
        linked_profile_id: row.linked_profile_id || null,
        display_name: row.vendor_name,
        email: row.email || null,
        phone: row.phone || null,
        address: row.address || null,
      } : undefined].filter(Boolean)];
    }

    if (q.startsWith("UPDATE clients SET counterparty_id = COALESCE(counterparty_id, ?)")) {
      const row = state.clients.find((client) => client.id === params[1]);
      if (row && !row.counterparty_id) {
        row.counterparty_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE vendors SET counterparty_id = COALESCE(counterparty_id, ?)")) {
      const row = state.vendors.find((vendor) => vendor.id === params[1]);
      if (row && !row.counterparty_id) {
        row.counterparty_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE counterparties SET")) {
      const row = state.counterparties.find((cp) => cp.id === params[7]);
      if (row) {
        row.display_name = params[0];
        row.legal_name = params[1];
        row.tax_number = params[2];
        row.email = params[3];
        row.phone = params[4];
        row.address = params[5];
        row.is_active = params[6];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT role_type FROM counterparty_roles")) {
      return [state.counterparty_roles.filter((r) => r.counterparty_id === params[0]).sort((a, b) => a.role_type.localeCompare(b.role_type))];
    }

    if (q.startsWith("DELETE FROM sales_invoice_lines")) {
      state.sales_invoice_lines = state.sales_invoice_lines.filter((line) => line.sales_invoice_id !== params[0]);
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("INSERT INTO sales_invoice_lines")) {
      state.sales_invoice_lines.push({
        id: params[0],
        sales_invoice_id: params[1],
        line_no: params[2],
        sales_quote_line_id: params[3],
        sales_order_line_id: params[4],
        item_id: params[5],
        description: params[6],
        quantity: params[7],
        unit_price: params[8],
        discount_type: params[9],
        discount_value: params[10],
        discount_amount: params[11],
        tax_code_id: params[12],
        tax_rate: params[13],
        line_subtotal: params[14],
        line_tax_amount: params[15],
        line_total: params[16],
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT id FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[0]);
      return [row ? [{ id: row.id }] : []];
    }

    if (q.startsWith("INSERT INTO sales_invoice_headers")) {
      state.sales_invoice_headers.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        invoice_no: params[3],
        sales_quote_id: params[4],
        sales_order_id: params[5],
        business_relationship_id: params[6],
        counterparty_id: params[7],
        customer_id: params[8],
        customer_name: params[9],
        customer_legal_name: params[10],
        customer_pan_vat_number: params[11],
        customer_email: params[12],
        customer_phone: params[13],
        customer_address: params[14],
        invoice_date: params[15],
        due_date: params[16],
        status: "draft",
        subtotal_amount: params[17],
        discount_amount: params[18],
        taxable_amount: params[19],
        tax_amount: params[20],
        total_amount: params[21],
        notes: params[22],
        sequence_id: params[23],
        created_by_user_id: params[24],
        posted_journal_entry_id: null,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_lines")) {
      return [state.sales_invoice_lines.filter((line) => line.sales_invoice_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='incoming'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET business_relationship_id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[17]);
      if (row) {
        row.business_relationship_id = params[0];
        row.counterparty_id = params[1];
        row.customer_id = params[2];
        row.customer_name = params[3];
        row.customer_legal_name = params[4];
        row.customer_pan_vat_number = params[5];
        row.customer_email = params[6];
        row.customer_phone = params[7];
        row.customer_address = params[8];
        row.invoice_date = params[9];
        row.due_date = params[10];
        row.subtotal_amount = params[11];
        row.discount_amount = params[12];
        row.taxable_amount = params[13];
        row.tax_amount = params[14];
        row.total_amount = params[15];
        row.notes = params[16];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET status = 'approved'")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "approved";
        row.approved_by_user_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET status = 'posted'")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("DELETE FROM purchase_bill_lines")) {
      state.purchase_bill_lines = state.purchase_bill_lines.filter((line) => line.purchase_bill_id !== params[0]);
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("INSERT INTO purchase_bill_lines")) {
      state.purchase_bill_lines.push({
        id: params[0],
        purchase_bill_id: params[1],
        line_no: params[2],
        purchase_order_line_id: params[3],
        goods_receipt_line_id: params[4],
        item_id: params[5],
        description: params[6],
        quantity: params[7],
        unit_cost: params[8],
        discount_type: params[9],
        discount_value: params[10],
        discount_amount: params[11],
        tax_code_id: params[12],
        tax_rate: params[13],
        line_subtotal: params[14],
        line_tax_amount: params[15],
        line_total: params[16],
        expense_account_id: params[17],
        inventory_account_id: params[18],
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("INSERT INTO purchase_bill_headers")) {
      state.purchase_bill_headers.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        bill_no: params[3],
        purchase_order_id: params[4],
        goods_receipt_id: params[5],
        business_relationship_id: params[6],
        counterparty_id: params[7],
        vendor_id: params[8],
        vendor_name: params[9],
        vendor_legal_name: params[10],
        vendor_pan_vat_number: params[11],
        vendor_email: params[12],
        vendor_phone: params[13],
        vendor_address: params[14],
        bill_date: params[15],
        due_date: params[16],
        status: "draft",
        subtotal_amount: params[17],
        discount_amount: params[18],
        taxable_amount: params[19],
        tax_amount: params[20],
        total_amount: params[21],
        notes: params[22],
        sequence_id: params[23],
        created_by_user_id: params[24],
        posted_journal_entry_id: null,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ? AND user_id = ?")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_headers WHERE id = ?")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM purchase_bill_lines")) {
      return [state.purchase_bill_lines.filter((line) => line.purchase_bill_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='outgoing'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET business_relationship_id = ?")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[17]);
      if (row) {
        row.business_relationship_id = params[0];
        row.counterparty_id = params[1];
        row.vendor_id = params[2];
        row.vendor_name = params[3];
        row.vendor_legal_name = params[4];
        row.vendor_pan_vat_number = params[5];
        row.vendor_email = params[6];
        row.vendor_phone = params[7];
        row.vendor_address = params[8];
        row.bill_date = params[9];
        row.due_date = params[10];
        row.subtotal_amount = params[11];
        row.discount_amount = params[12];
        row.taxable_amount = params[13];
        row.tax_amount = params[14];
        row.total_amount = params[15];
        row.notes = params[16];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET status = 'approved'")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "approved";
        row.approved_by_user_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET status = 'posted'")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.includes("FROM sales_invoice_headers si") && q.includes("COALESCE(si.counterparty_id, si.customer_id) = ?")) {
      const rows = state.sales_invoice_headers
        .filter((header) => header.user_id === params[0] && (header.counterparty_id || header.customer_id) === params[1] && header.status !== "void")
        .map((header) => ({
          id: header.id,
          invoice_no: header.invoice_no,
          total_amount: header.total_amount,
          allocated_amount: 0,
        }));
      return [rows];
    }

    if (q.includes("FROM purchase_bill_headers pb") && q.includes("COALESCE(pb.counterparty_id, pb.vendor_id) = ?")) {
      const rows = state.purchase_bill_headers
        .filter((header) => header.user_id === params[0] && (header.counterparty_id || header.vendor_id) === params[1] && header.status !== "void")
        .map((header) => ({
          id: header.id,
          bill_no: header.bill_no,
          total_amount: header.total_amount,
          allocated_amount: 0,
        }));
      return [rows];
    }

    throw new Error(`Unhandled SQL in test fake: ${q}`);
  };

  const conn = {
    beginTransaction: async () => { },
    commit: async () => { },
    rollback: async () => { },
    release: () => { },
    execute,
  };

  return {
    state,
    async getConnection() {
      return conn;
    },
    async execute(sql, params = []) {
      return execute(sql, params);
    },
  };
}

function createAccountingControlStub() {
  let salesSeq = 1;
  let billSeq = 1;
  let paymentSeq = 1;
  return {
    async validatePostingDate(_conn, _companyId, _date) {
      return { id: "period-1" };
    },
    async nextDocumentNumber(_conn, payload) {
      if (payload.documentType === "sales_invoice") {
        return { documentNumber: `SI-${String(salesSeq++).padStart(4, "0")}`, sequenceId: "seq-sales" };
      }
      if (payload.documentType === "purchase_bill") {
        return { documentNumber: `PB-${String(billSeq++).padStart(4, "0")}`, sequenceId: "seq-bills" };
      }
      return { documentNumber: `PAY-${String(paymentSeq++).padStart(4, "0")}`, sequenceId: "seq-pay" };
    },
  };
}

function createJournalStub() {
  let i = 1;
  return {
    async createJournalEntry() {
      return { id: `je-${i++}` };
    },
    async postJournalEntry({ journalEntryId }) {
      return { id: journalEntryId };
    },
  };
}

function createTaxStub() {
  return {
    async calculateLineTax(_conn, _actorUserId, input) {
      const taxable = Number(input.taxable_amount || 0);
      const rate = Number(input.tax_rate || 0);
      const tax = Number(((taxable * rate) / 100).toFixed(2));
      return {
        tax_code_id: input.tax_code_id || null,
        tax_type: rate > 0 ? "vat" : "non_taxable",
        tax_rate: rate,
        taxable_amount: taxable,
        tax_amount: tax,
      };
    },
    async buildOutputTaxPostings() {
      return [];
    },
    async buildInputTaxPostings() {
      return [];
    },
    async recordTaxTransactionsForSalesInvoice() { },
    async recordTaxTransactionsForPurchaseBill() { },
  };
}

test("resolveCustomerSnapshot prefers modern customers before legacy client fallback", async () => {
  const pool = createFakePool();
  pool.state.customers.push({
    id: "cust-1",
    company_id: "company-1",
    linked_company_id: "profile-customer-1",
    display_name: "Modern Customer",
    legal_name: "Modern Customer Pvt Ltd",
    pan_vat_number: "PAN-001",
    email: "modern-customer@example.com",
    phone: "9800000001",
    billing_address: "Kathmandu",
    status: "active",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const conn = await pool.getConnection();
  const snapshot = await counterpartyService.resolveCustomerSnapshot(conn, "user-1", "company-1", "cust-1");

  assert.equal(snapshot.source_type, "modern_customer");
  assert.equal(snapshot.display_name, "Modern Customer");
  assert.ok(snapshot.id);
});

test("resolveCustomerSnapshot falls back to legacy clients when modern customer is unavailable", async () => {
  const pool = createFakePool();
  pool.state.clients.push({
    id: "client-1",
    user_id: "user-1",
    linked_profile_id: null,
    client_name: "Legacy Client",
    email: "legacy-client@example.com",
    phone: "9800000002",
    address: "Pokhara",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const conn = await pool.getConnection();
  const snapshot = await counterpartyService.resolveCustomerSnapshot(conn, "user-1", "company-1", "client-1");

  assert.equal(snapshot.source_type, "legacy_client");
  assert.equal(snapshot.display_name, "Legacy Client");
  assert.ok(snapshot.id);
  assert.equal(pool.state.clients[0].counterparty_id, snapshot.id);
});

test("resolveVendorSnapshot prefers modern vendors before legacy vendor fallback", async () => {
  const pool = createFakePool();
  pool.state.vendors.push({
    id: "vendor-modern-1",
    company_id: "company-1",
    linked_company_id: "profile-vendor-1",
    display_name: "Modern Vendor",
    legal_name: "Modern Vendor Pvt Ltd",
    pan_vat_number: "PAN-002",
    email: "modern-vendor@example.com",
    phone: "9800000003",
    billing_address: "Lalitpur",
    status: "active",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const conn = await pool.getConnection();
  const snapshot = await counterpartyService.resolveVendorSnapshot(conn, "user-1", "company-1", "vendor-modern-1");

  assert.equal(snapshot.source_type, "modern_vendor");
  assert.equal(snapshot.display_name, "Modern Vendor");
  assert.ok(snapshot.id);
});

test("resolveVendorSnapshot falls back to legacy vendors when modern vendor is unavailable", async () => {
  const pool = createFakePool();
  pool.state.vendors.push({
    id: "vendor-legacy-1",
    user_id: "user-1",
    linked_profile_id: null,
    vendor_name: "Legacy Vendor",
    email: "legacy-vendor@example.com",
    phone: "9800000004",
    address: "Bhaktapur",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const conn = await pool.getConnection();
  const snapshot = await counterpartyService.resolveVendorSnapshot(conn, "user-1", "company-1", "vendor-legacy-1");

  assert.equal(snapshot.source_type, "legacy_vendor");
  assert.equal(snapshot.display_name, "Legacy Vendor");
  assert.ok(snapshot.id);
  assert.equal(pool.state.vendors[0].counterparty_id, snapshot.id);
});

test("sales invoice creation works with modern customer and legacy client fallback", async () => {
  const pool = createFakePool();
  pool.state.customers.push({
    id: "cust-2",
    company_id: "company-1",
    display_name: "Modern Customer Two",
    legal_name: "Modern Customer Two Pvt Ltd",
    pan_vat_number: "PAN-010",
    email: "modern2@example.com",
    phone: "9800000010",
    billing_address: "Kathmandu",
    status: "active",
  });
  pool.state.clients.push({
    id: "client-2",
    user_id: "user-1",
    client_name: "Legacy Client Two",
    email: "legacy2@example.com",
    phone: "9800000011",
    address: "Pokhara",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const salesInvoiceService = new SalesInvoiceService(pool, {
    journalService: createJournalStub(),
    taxService: createTaxStub(),
    counterpartyService,
    accountingControlService: createAccountingControlStub(),
    idFactory: createIdFactory("si"),
  });

  const modernDraft = await salesInvoiceService.createDraft("user-1", {
    customer_id: "cust-2",
    invoice_date: "2026-04-04",
    due_date: "2026-04-10",
    lines: [{ description: "Modern invoice line", quantity: 1, unit_price: 100, tax_rate: 0 }],
  });
  const legacyDraft = await salesInvoiceService.createDraft("user-1", {
    customer_id: "client-2",
    invoice_date: "2026-04-05",
    due_date: "2026-04-11",
    lines: [{ description: "Legacy invoice line", quantity: 1, unit_price: 150, tax_rate: 0 }],
  });

  assert.equal(modernDraft.customer_name, "Modern Customer Two");
  assert.ok(modernDraft.counterparty_id);
  assert.equal(legacyDraft.customer_name, "Legacy Client Two");
  assert.ok(legacyDraft.counterparty_id);
});

test("purchase bill creation works with modern vendor and legacy vendor fallback", async () => {
  const pool = createFakePool();
  pool.state.vendors.push({
    id: "vendor-modern-2",
    company_id: "company-1",
    display_name: "Modern Vendor Two",
    legal_name: "Modern Vendor Two Pvt Ltd",
    pan_vat_number: "PAN-020",
    email: "modern-vendor-2@example.com",
    phone: "9800000020",
    billing_address: "Lalitpur",
    status: "active",
  });
  pool.state.vendors.push({
    id: "vendor-legacy-2",
    user_id: "user-1",
    vendor_name: "Legacy Vendor Two",
    email: "legacy-vendor-2@example.com",
    phone: "9800000021",
    address: "Bhaktapur",
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const purchaseBillService = new PurchaseBillService(pool, {
    journalService: createJournalStub(),
    taxService: createTaxStub(),
    counterpartyService,
    accountingControlService: createAccountingControlStub(),
    idFactory: createIdFactory("pb"),
  });

  const modernDraft = await purchaseBillService.createDraft("user-1", {
    vendor_id: "vendor-modern-2",
    bill_date: "2026-04-04",
    due_date: "2026-04-10",
    lines: [{ description: "Modern bill line", quantity: 1, unit_cost: 100, tax_rate: 0, inventory_account_id: "acct-inventory" }],
  });
  const legacyDraft = await purchaseBillService.createDraft("user-1", {
    vendor_id: "vendor-legacy-2",
    bill_date: "2026-04-05",
    due_date: "2026-04-11",
    lines: [{ description: "Legacy bill line", quantity: 1, unit_cost: 150, tax_rate: 0, inventory_account_id: "acct-inventory" }],
  });

  assert.equal(modernDraft.vendor_name, "Modern Vendor Two");
  assert.ok(modernDraft.counterparty_id);
  assert.equal(legacyDraft.vendor_name, "Legacy Vendor Two");
  assert.ok(legacyDraft.counterparty_id);
});

test("canonical counterparty can carry both customer and vendor roles", async () => {
  const pool = createFakePool();
  const conn = await pool.getConnection();
  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });

  const created = await counterpartyService.createOrUpdateCounterparty(conn, "user-1", {
    display_name: "Acme Traders",
    legal_name: "Acme Traders Pvt Ltd",
    email: "acme@example.com",
    role_type: "customer",
  });

  const updated = await counterpartyService.createOrUpdateCounterparty(conn, "user-1", {
    counterparty_id: created.id,
    display_name: "Acme Traders",
    legal_name: "Acme Traders Pvt Ltd",
    email: "acme@example.com",
    role_types: ["customer", "vendor"],
  });

  assert.equal(updated.id, created.id);
  assert.deepEqual(updated.role_types, ["customer", "vendor"]);
});

test("documents keep immutable snapshots while balances stay tied to canonical counterparty id", async () => {
  const pool = createFakePool();
  const counterpartyService = new CounterpartyService(pool, { idFactory: createIdFactory("cp") });
  const control = createAccountingControlStub();
  const journal = createJournalStub();
  const tax = createTaxStub();

  const conn = await pool.getConnection();
  const counterparty = await counterpartyService.createOrUpdateCounterparty(conn, "user-1", {
    display_name: "Acme Traders",
    legal_name: "Acme Traders Pvt Ltd",
    email: "acme@example.com",
    role_types: ["customer", "vendor"],
  });

  const salesInvoiceService = new SalesInvoiceService(pool, {
    journalService: journal,
    taxService: tax,
    counterpartyService,
    accountingControlService: control,
    idFactory: createIdFactory("si"),
  });

  const purchaseBillService = new PurchaseBillService(pool, {
    journalService: journal,
    taxService: tax,
    counterpartyService,
    accountingControlService: control,
    idFactory: createIdFactory("pb"),
  });

  const settlementService = new SettlementService(pool, {
    journalService: journal,
    counterpartyService,
    accountingControlService: control,
    idFactory: createIdFactory("pay"),
  });

  const draftInvoice = await salesInvoiceService.createDraft("user-1", {
    counterparty_id: counterparty.id,
    invoice_date: "2026-04-04",
    due_date: "2026-04-10",
    lines: [
      { description: "Consulting", quantity: 1, unit_price: 1000, tax_rate: 0 },
    ],
  });
  const postedInvoice = await salesInvoiceService.post("user-1", draftInvoice.id, {});

  await counterpartyService.createOrUpdateCounterparty(conn, "user-1", {
    counterparty_id: counterparty.id,
    display_name: "Acme Global",
    legal_name: "Acme Global Pvt Ltd",
    email: "finance@acmeglobal.com",
    role_types: ["customer", "vendor"],
  });

  const draftBill = await purchaseBillService.createDraft("user-1", {
    counterparty_id: counterparty.id,
    bill_date: "2026-04-05",
    due_date: "2026-04-12",
    lines: [
      { description: "Inventory purchase", quantity: 2, unit_cost: 250, tax_rate: 0, inventory_account_id: "acct-inventory" },
    ],
  });
  const postedBill = await purchaseBillService.post("user-1", draftBill.id, {});

  const invoiceAfterRename = await salesInvoiceService.getById("user-1", postedInvoice.id);
  const billAfterRename = await purchaseBillService.getById("user-1", postedBill.id);

  assert.equal(invoiceAfterRename.counterparty_id, counterparty.id);
  assert.equal(invoiceAfterRename.customer_id, counterparty.id);
  assert.equal(invoiceAfterRename.customer_name, "Acme Traders");
  assert.equal(invoiceAfterRename.customer_legal_name, "Acme Traders Pvt Ltd");

  assert.equal(billAfterRename.counterparty_id, counterparty.id);
  assert.equal(billAfterRename.vendor_id, counterparty.id);
  assert.equal(billAfterRename.vendor_name, "Acme Global");
  assert.equal(billAfterRename.vendor_legal_name, "Acme Global Pvt Ltd");

  const receivableBalance = await settlementService.calculateCustomerBalance("user-1", counterparty.id);
  const payableBalance = await settlementService.calculateVendorBalance("user-1", counterparty.id);

  assert.equal(receivableBalance, 1000);
  assert.equal(payableBalance, 500);
});
