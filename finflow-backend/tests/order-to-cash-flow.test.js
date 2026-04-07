"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { SalesQuoteService } = require("../services/salesQuoteService");
const { SalesOrderService } = require("../services/salesOrderService");
const { SalesInvoiceService } = require("../services/salesInvoiceService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createIdFactory(prefix) {
  let i = 1;
  return () => `${prefix}-${i++}`;
}

function createCounterpartyStub() {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      return actorUserId;
    },
    async resolveCustomerSnapshot(_conn, _actorUserId, _companyId, customerId) {
      return {
        id: customerId || "customer-1",
        display_name: "Customer A",
        legal_name: "Customer A Pvt Ltd",
        pan_vat_number: "PAN-1",
        email: "customer@example.com",
        phone: "9800000000",
        address: "Kathmandu",
      };
    },
  };
}

function createControlStub(prefix) {
  let i = 1;
  return {
    async nextDocumentNumber() {
      return {
        documentNumber: `${prefix}-${String(i++).padStart(4, "0")}`,
        sequenceId: `seq-${prefix}-${i}`,
      };
    },
    async validatePostingDate() {
      return { id: "period-1" };
    },
  };
}

function createTaxStub() {
  return {
    async calculateLineTax(_conn, _actorUserId, payload) {
      return {
        tax_code_id: payload.tax_code_id || null,
        tax_rate: payload.tax_rate || 0,
        tax_type: "non_taxable",
        tax_amount: 0,
      };
    },
    async buildOutputTaxPostings() {
      return [];
    },
    async recordTaxTransactionsForSalesInvoice() {},
  };
}

function createFakePool(initialState = {}) {
  const state = {
    salesQuoteHeaders: initialState.salesQuoteHeaders || [],
    salesQuoteLines: initialState.salesQuoteLines || [],
    salesOrderHeaders: initialState.salesOrderHeaders || [],
    salesOrderLines: initialState.salesOrderLines || [],
    salesInvoiceHeaders: initialState.salesInvoiceHeaders || [],
    salesInvoiceLines: initialState.salesInvoiceLines || [],
  };

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT id FROM companies")) return [[]];

    if (q.startsWith("DELETE FROM sales_quote_lines WHERE sales_quote_id = ?")) {
      state.salesQuoteLines = state.salesQuoteLines.filter((line) => line.sales_quote_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO sales_quote_lines")) {
      state.salesQuoteLines.push({
        id: params[0],
        sales_quote_id: params[1],
        line_no: params[2],
        item_id: params[3],
        description: params[4],
        quantity: params[5],
        unit_price: params[6],
        line_total: params[7],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO sales_quote_headers")) {
      state.salesQuoteHeaders.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        quote_no: params[3],
        business_relationship_id: params[4],
        counterparty_id: params[5],
        customer_id: params[6],
        customer_name: params[7],
        customer_legal_name: params[8],
        customer_pan_vat_number: params[9],
        customer_email: params[10],
        customer_phone: params[11],
        customer_address: params[12],
        quote_date: params[13],
        valid_until: params[14],
        status: "draft",
        subtotal_amount: params[15],
        tax_amount: params[16],
        total_amount: params[17],
        notes: params[18],
        sequence_id: params[19],
        created_by_user_id: params[20],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM sales_quote_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_quote_headers WHERE id = ? AND user_id = ?")) {
      const row = state.salesQuoteHeaders.find((h) => h.id === params[0] && h.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_quote_headers WHERE id = ?")) {
      const row = state.salesQuoteHeaders.find((h) => h.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_quote_headers WHERE user_id = ?")) {
      return [state.salesQuoteHeaders.filter((h) => h.user_id === params[0])];
    }
    if (q.startsWith("SELECT * FROM sales_quote_lines WHERE sales_quote_id = ?")) {
      return [state.salesQuoteLines.filter((l) => l.sales_quote_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("UPDATE sales_quote_headers SET status = 'converted'")) {
      const row = state.salesQuoteHeaders.find((h) => h.id === params[1]);
      if (row) {
        row.status = "converted";
        row.converted_sales_order_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (q.startsWith("UPDATE sales_quote_headers SET status = ?")) {
      const row = state.salesQuoteHeaders.find((h) => h.id === params[1]);
      if (row) row.status = params[0];
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("DELETE FROM sales_order_lines WHERE sales_order_id = ?")) {
      state.salesOrderLines = state.salesOrderLines.filter((line) => line.sales_order_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO sales_order_lines")) {
      state.salesOrderLines.push({
        id: params[0],
        sales_order_id: params[1],
        sales_quote_line_id: params[2],
        line_no: params[3],
        item_id: params[4],
        description: params[5],
        ordered_quantity: params[6],
        unit_price: params[7],
        line_total: params[8],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO sales_order_headers")) {
      state.salesOrderHeaders.push({
        id: params[0],
        company_id: params[1],
        user_id: params[2],
        order_no: params[3],
        sales_quote_id: params[4],
        business_relationship_id: params[5],
        counterparty_id: params[6],
        customer_id: params[7],
        customer_name: params[8],
        customer_legal_name: params[9],
        customer_pan_vat_number: params[10],
        customer_email: params[11],
        customer_phone: params[12],
        customer_address: params[13],
        order_date: params[14],
        expected_invoice_date: params[15],
        status: q.includes("'accepted'") ? "accepted" : "draft",
        subtotal_amount: params[16],
        total_amount: params[17],
        notes: params[18],
        sequence_id: params[19],
        created_by_user_id: params[20],
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_order_headers WHERE id = ? AND user_id = ?")) {
      const row = state.salesOrderHeaders.find((h) => h.id === params[0] && h.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_order_headers WHERE id = ?")) {
      const row = state.salesOrderHeaders.find((h) => h.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_order_headers WHERE user_id = ?")) {
      return [state.salesOrderHeaders.filter((h) => h.user_id === params[0])];
    }
    if (q.startsWith("SELECT * FROM sales_order_lines WHERE sales_order_id = ?")) {
      return [state.salesOrderLines.filter((l) => l.sales_order_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(sil.quantity), 0) AS invoiced_quantity")) {
      const salesOrderLineId = params[0];
      const currentInvoiceId = params[1];
      const relevant = state.salesInvoiceLines.filter((line) => line.sales_order_line_id === salesOrderLineId && (!currentInvoiceId || line.sales_invoice_id !== currentInvoiceId))
        .filter((line) => {
          const header = state.salesInvoiceHeaders.find((h) => h.id === line.sales_invoice_id);
          return ["approved", "posted", "partially_paid", "paid", "overdue"].includes(header?.status);
        });
      return [[{ invoiced_quantity: relevant.reduce((sum, line) => sum + Number(line.quantity || 0), 0) }]];
    }
    if (q.startsWith("UPDATE sales_order_headers SET status = 'converted'")) {
      const row = state.salesOrderHeaders.find((h) => h.id === params[1]);
      if (row) {
        row.status = "converted";
        row.converted_invoice_id = params[0];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (q.startsWith("UPDATE sales_order_headers SET status = 'accepted'")) {
      const row = state.salesOrderHeaders.find((h) => h.id === params[0]);
      if (row) row.status = "accepted";
      return [{ affectedRows: row ? 1 : 0 }];
    }
    if (q.startsWith("UPDATE sales_order_headers SET status = 'void'")) {
      const row = state.salesOrderHeaders.find((h) => h.id === params[0]);
      if (row) row.status = "void";
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("SELECT sqln.*, sqh.user_id FROM sales_quote_lines")) {
      const row = state.salesQuoteLines.find((l) => l.id === params[0]);
      const header = row ? state.salesQuoteHeaders.find((h) => h.id === row.sales_quote_id) : null;
      return [[row ? { ...row, user_id: header?.user_id || null } : null].filter(Boolean)];
    }
    if (q.startsWith("SELECT sol.*, soh.user_id, soh.sales_quote_id FROM sales_order_lines")) {
      const row = state.salesOrderLines.find((l) => l.id === params[0]);
      const header = row ? state.salesOrderHeaders.find((h) => h.id === row.sales_order_id) : null;
      return [[row ? { ...row, user_id: header?.user_id || null, sales_quote_id: header?.sales_quote_id || null } : null].filter(Boolean)];
    }

    if (q.startsWith("SELECT id FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.salesInvoiceHeaders.find((h) => h.id === params[0]);
      return [row ? [{ id: row.id }] : []];
    }

    if (q.startsWith("DELETE FROM sales_invoice_lines WHERE sales_invoice_id = ?")) {
      state.salesInvoiceLines = state.salesInvoiceLines.filter((line) => line.sales_invoice_id !== params[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("INSERT INTO sales_invoice_lines")) {
      state.salesInvoiceLines.push({
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
    if (q.startsWith("INSERT INTO sales_invoice_headers")) {
      state.salesInvoiceHeaders.push({
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
      });
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ?")) {
      const row = state.salesInvoiceHeaders.find((h) => h.id === params[0] && h.user_id === params[1]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.salesInvoiceHeaders.find((h) => h.id === params[0]);
      return [[row].filter(Boolean)];
    }
    if (q.startsWith("SELECT * FROM sales_invoice_lines WHERE sales_invoice_id = ?")) {
      return [state.salesInvoiceLines.filter((l) => l.sales_invoice_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }
    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='incoming'")) {
      return [[{ allocated_amount: 0 }]];
    }

    throw new Error(`Unhandled SQL in order-to-cash test fake: ${q}`);
  };

  const conn = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
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

test("quote can be created", async () => {
  const pool = createFakePool();
  const salesOrderService = new SalesOrderService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SO"),
    idFactory: createIdFactory("so"),
  });
  const service = new SalesQuoteService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SQ"),
    salesOrderService,
    idFactory: createIdFactory("sq"),
  });

  const quote = await service.createDraft("seller-1", {
    customer_id: "customer-1",
    quote_date: "2026-04-05",
    valid_until: "2026-04-10",
    lines: [{ item_id: "item-1", description: "Widget", quantity: 2, unit_price: 100 }],
  });

  assert.equal(quote.quote_no, "SQ-0001");
  assert.equal(quote.lines.length, 1);
  assert.equal(quote.customer_id, "customer-1");
});

test("quote converts to order with linkage preserved", async () => {
  const pool = createFakePool();
  const salesInvoiceService = new SalesInvoiceService(pool, {
    journalService: {},
    taxService: createTaxStub(),
    accountingControlService: createControlStub("SI"),
    counterpartyService: createCounterpartyStub(),
    idFactory: createIdFactory("si"),
  });
  const salesOrderService = new SalesOrderService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SO"),
    salesInvoiceService,
    idFactory: createIdFactory("so"),
  });
  const salesQuoteService = new SalesQuoteService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SQ"),
    salesOrderService,
    idFactory: createIdFactory("sq"),
  });

  const quote = await salesQuoteService.createDraft("seller-1", {
    customer_id: "customer-1",
    lines: [{ item_id: "item-1", description: "Widget", quantity: 3, unit_price: 120 }],
  });
  const order = await salesQuoteService.convertToOrder("seller-1", quote.id, {});

  assert.equal(order.sales_quote_id, quote.id);
  assert.equal(order.lines[0].sales_quote_line_id, quote.lines[0].id);
  assert.equal(pool.state.salesQuoteHeaders[0].converted_sales_order_id, order.id);
});

test("order converts to invoice with commercial origin references", async () => {
  const pool = createFakePool();
  const salesInvoiceService = new SalesInvoiceService(pool, {
    journalService: {},
    taxService: createTaxStub(),
    accountingControlService: createControlStub("SI"),
    counterpartyService: createCounterpartyStub(),
    idFactory: createIdFactory("si"),
  });
  const salesOrderService = new SalesOrderService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SO"),
    salesInvoiceService,
    idFactory: createIdFactory("so"),
  });
  const salesQuoteService = new SalesQuoteService(pool, {
    counterpartyService: createCounterpartyStub(),
    accountingControlService: createControlStub("SQ"),
    salesOrderService,
    idFactory: createIdFactory("sq"),
  });

  const quote = await salesQuoteService.createDraft("seller-1", {
    customer_id: "customer-1",
    lines: [{ item_id: "item-1", description: "Widget", quantity: 2, unit_price: 150 }],
  });
  const order = await salesQuoteService.convertToOrder("seller-1", quote.id, {});
  const invoice = await salesOrderService.convertToInvoice("seller-1", order.id, {
    invoice_date: "2026-04-06",
    due_date: "2026-04-10",
  });

  assert.equal(invoice.sales_quote_id, quote.id);
  assert.equal(invoice.sales_order_id, order.id);
  assert.equal(invoice.lines[0].sales_quote_line_id, quote.lines[0].id);
  assert.equal(invoice.lines[0].sales_order_line_id, order.lines[0].id);
  assert.equal(pool.state.salesOrderHeaders[0].converted_invoice_id, invoice.id);
});
