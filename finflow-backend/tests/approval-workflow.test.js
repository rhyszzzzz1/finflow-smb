"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ApprovalWorkflowService } = require("../services/approvalWorkflowService");
const { SalesInvoiceService } = require("../services/salesInvoiceService");
const { PurchaseBillService } = require("../services/purchaseBillService");

function normalizeSql(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

function createIdFactory(prefix) {
  let i = 1;
  return () => `${prefix}-${i++}`;
}

function createFakePool() {
  const state = {
    companies: [{ id: "company-1", legacy_profile_id: "user-1", owner_profile_id: "user-1" }],
    approval_workflows: [
      {
        id: "workflow-sales",
        company_id: "company-1",
        document_type: "sales_invoice",
        workflow_name: "Invoice Approval",
        require_approval_before_post: 1,
        is_active: 1,
      },
      {
        id: "workflow-purchase",
        company_id: "company-1",
        document_type: "purchase_bill",
        workflow_name: "Bill Approval",
        require_approval_before_post: 1,
        is_active: 1,
      },
    ],
    approval_steps: [
      { id: "step-sales-1", workflow_id: "workflow-sales", step_no: 1, step_name: "Manager", is_active: 1 },
      { id: "step-purchase-1", workflow_id: "workflow-purchase", step_no: 1, step_name: "Owner", is_active: 1 },
    ],
    approval_decisions: [],
    sales_invoice_headers: [],
    sales_invoice_lines: [],
    purchase_bill_headers: [],
    purchase_bill_lines: [],
    journal_entries: [],
  };

  const execute = async (sql, params = []) => {
    const q = normalizeSql(sql);

    if (q.startsWith("SELECT id FROM companies")) {
      const row = state.companies.find((c) => c.legacy_profile_id === params[0] || c.owner_profile_id === params[1]);
      return [[row ? { id: row.id } : undefined].filter(Boolean)];
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
        approval_workflow_id: null,
        approval_status: "not_required",
        approval_current_step_no: null,
        submitted_by_user_id: null,
        submitted_at: null,
        approved_by_user_id: null,
        approved_at: null,
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_comment: null,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ? FOR UPDATE")
      || q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ? AND user_id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[0] && header.user_id === params[1]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_headers WHERE id = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM sales_invoice_lines")) {
      return [state.sales_invoice_lines.filter((line) => line.sales_invoice_id === params[0]).sort((a, b) => a.line_no - b.line_no)];
    }

    if (q.startsWith("SELECT COALESCE(SUM(CASE WHEN p.type='incoming'")) {
      return [[{ allocated_amount: 0 }]];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET approval_workflow_id = ?, approval_status = ?")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[2]);
      if (row) {
        row.approval_workflow_id = params[0];
        row.approval_status = params[1];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET approval_workflow_id = ?, approval_status = 'pending_approval'")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[3]);
      if (row) {
        row.approval_workflow_id = params[0];
        row.approval_status = "pending_approval";
        row.approval_current_step_no = params[1];
        row.submitted_by_user_id = params[2];
        row.submitted_at = "now";
        row.rejected_by_user_id = null;
        row.rejected_at = null;
        row.rejection_comment = null;
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET approval_status = 'approved'")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[1]);
      if (row) {
        row.approval_status = "approved";
        row.approval_current_step_no = null;
        row.status = "approved";
        row.approved_by_user_id = params[0];
        row.approved_at = "now";
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE sales_invoice_headers SET status = 'posted'")) {
      const row = state.sales_invoice_headers.find((header) => header.id === params[1]);
      if (row) {
        row.status = "posted";
        row.posted_journal_entry_id = params[0];
        row.posted_at = "now";
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
        approval_workflow_id: null,
        approval_status: "not_required",
        approval_current_step_no: null,
        submitted_by_user_id: null,
        submitted_at: null,
        approved_by_user_id: null,
        approved_at: null,
        rejected_by_user_id: null,
        rejected_at: null,
        rejection_comment: null,
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

    if (q.startsWith("UPDATE purchase_bill_headers SET approval_workflow_id = ?, approval_status = ?")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[2]);
      if (row) {
        row.approval_workflow_id = params[0];
        row.approval_status = params[1];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET approval_workflow_id = ?, approval_status = 'pending_approval'")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[3]);
      if (row) {
        row.approval_workflow_id = params[0];
        row.approval_status = "pending_approval";
        row.approval_current_step_no = params[1];
        row.submitted_by_user_id = params[2];
        row.submitted_at = "now";
        row.rejected_by_user_id = null;
        row.rejected_at = null;
        row.rejection_comment = null;
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET approval_status = 'approved'")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[1]);
      if (row) {
        row.approval_status = "approved";
        row.approval_current_step_no = null;
        row.status = "approved";
        row.approved_by_user_id = params[0];
        row.approved_at = "now";
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("UPDATE purchase_bill_headers SET approval_status = 'rejected'")) {
      const row = state.purchase_bill_headers.find((header) => header.id === params[2]);
      if (row) {
        row.approval_status = "rejected";
        row.approval_current_step_no = null;
        row.rejected_by_user_id = params[0];
        row.rejected_at = "now";
        row.rejection_comment = params[1];
      }
      return [{ affectedRows: row ? 1 : 0 }];
    }

    if (q.startsWith("INSERT INTO approval_decisions")) {
      state.approval_decisions.push({
        id: params[0],
        workflow_id: params[1],
        step_id: params[2],
        company_id: params[3],
        document_type: params[4],
        entity_id: params[5],
        decision_type: params[6],
        actor_user_id: params[7],
        comment: params[8],
        created_at: state.approval_decisions.length + 1,
      });
      return [{ affectedRows: 1 }];
    }

    if (q.startsWith("SELECT id, workflow_id, step_id, company_id, document_type, entity_id, decision_type, actor_user_id, comment, created_at FROM approval_decisions")) {
      return [state.approval_decisions
        .filter((row) => row.document_type === params[0] && row.entity_id === params[1])
        .sort((a, b) => a.created_at - b.created_at)];
    }

    if (q.startsWith("SELECT * FROM approval_workflows WHERE company_id = ?")) {
      const row = state.approval_workflows.find((workflow) =>
        workflow.company_id === params[0]
        && workflow.document_type === params[1]
        && workflow.is_active === 1
      );
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM approval_workflows WHERE id = ?")) {
      const row = state.approval_workflows.find((workflow) => workflow.id === params[0]);
      return [[row].filter(Boolean)];
    }

    if (q.startsWith("SELECT * FROM approval_steps WHERE workflow_id = ?")) {
      return [state.approval_steps.filter((step) => step.workflow_id === params[0] && step.is_active === 1).sort((a, b) => a.step_no - b.step_no)];
    }

    throw new Error(`Unhandled SQL in approval workflow test: ${q}`);
  };

  return {
    state,
    execute,
    async getConnection() {
      return {
        execute,
        async beginTransaction() {},
        async commit() {},
        async rollback() {},
        release() {},
      };
    },
  };
}

function createSharedDependencies(pool) {
  const idFactory = createIdFactory("id");
  const approvalWorkflowService = new ApprovalWorkflowService(pool, { idFactory });
  const counterpartyService = {
    async resolveCompanyId(_conn, actorUserId) {
      return actorUserId === "user-1" ? "company-1" : `company-for-${actorUserId}`;
    },
    async resolveCustomerSnapshot() {
      return {
        id: "cp-customer-1",
        display_name: "ACME Buyer",
        legal_name: "ACME Buyer Pvt Ltd",
        pan_vat_number: "PAN-001",
        email: "buyer@example.com",
        phone: "9800000000",
        address: "Kathmandu",
        linked_profile_id: null,
      };
    },
    async resolveVendorSnapshot() {
      return {
        id: "cp-vendor-1",
        display_name: "Supply House",
        legal_name: "Supply House Pvt Ltd",
        pan_vat_number: "PAN-002",
        email: "vendor@example.com",
        phone: "9811111111",
        address: "Pokhara",
        linked_profile_id: null,
      };
    },
  };
  const accountingControlService = {
    async nextDocumentNumber(_conn, { documentType }) {
      const prefix = documentType === "sales_invoice" ? "INV" : "BILL";
      return {
        documentNumber: `${prefix}-${String(pool.state.journal_entries.length + pool.state.sales_invoice_headers.length + pool.state.purchase_bill_headers.length + 1).padStart(4, "0")}`,
        sequenceId: `${prefix.toLowerCase()}-seq`,
      };
    },
    async validatePostingDate() {},
  };
  const taxService = {
    async calculateLineTax(_conn, _actorUserId, input) {
      return {
        tax_code_id: input.tax_code_id || null,
        tax_rate: Number(input.tax_rate || 0),
        tax_amount: 0,
        tax_type: "non_taxable",
      };
    },
    async buildOutputTaxPostings() {
      return [];
    },
    async buildInputTaxPostings() {
      return [];
    },
    async recordTaxTransactionsForSalesInvoice() {},
    async recordSalesInvoiceTaxTransactions() {},
    async recordPurchaseBillTaxTransactions() {},
  };
  const journalService = {
    async createJournalEntry({ sourceType, sourceId, lines }) {
      const entry = { id: `journal-${pool.state.journal_entries.length + 1}`, sourceType, sourceId, lines };
      pool.state.journal_entries.push(entry);
      return entry;
    },
    async postJournalEntry({ journalEntryId }) {
      return { id: journalEntryId };
    },
  };

  return {
    idFactory,
    approvalWorkflowService,
    counterpartyService,
    accountingControlService,
    taxService,
    journalService,
  };
}

test("sales invoice submit approve post flow records approval trail and gates posting", async () => {
  const pool = createFakePool();
  const deps = createSharedDependencies(pool);
  const service = new SalesInvoiceService(pool, {
    journalService: deps.journalService,
    taxService: deps.taxService,
    accountingControlService: deps.accountingControlService,
    counterpartyService: deps.counterpartyService,
    approvalWorkflowService: deps.approvalWorkflowService,
    idFactory: deps.idFactory,
  });

  const draft = await service.createDraft("user-1", {
    customer_id: "customer-1",
    lines: [
      {
        description: "Consulting service",
        quantity: 1,
        unit_price: 1500,
      },
    ],
  });

  await assert.rejects(
    service.post("user-1", draft.id),
    /Document must be approved before posting/
  );

  const submitted = await service.submitForApproval("user-1", draft.id, { comment: "Need manager review" });
  assert.equal(submitted.approval.status, "pending_approval");
  assert.equal(submitted.base_status, "draft");

  const approved = await service.approve("user-1", draft.id, { comment: "Approved by manager" });
  assert.equal(approved.approval.status, "approved");
  assert.equal(approved.base_status, "approved");

  const posted = await service.post("user-1", draft.id);
  assert.equal(posted.base_status, "posted");
  assert.equal(posted.approval.status, "approved");
  assert.equal(posted.posted_journal_entry_id, "journal-1");
  assert.deepEqual(
    posted.approval.decisions.map((row) => row.decision_type),
    ["submitted", "approved"]
  );
});

test("purchase bill reject and resubmit flow keeps approval trail visible", async () => {
  const pool = createFakePool();
  const deps = createSharedDependencies(pool);
  const service = new PurchaseBillService(pool, {
    journalService: deps.journalService,
    taxService: deps.taxService,
    accountingControlService: deps.accountingControlService,
    counterpartyService: deps.counterpartyService,
    approvalWorkflowService: deps.approvalWorkflowService,
    idFactory: deps.idFactory,
  });

  const draft = await service.createDraft("user-1", {
    vendor_id: "vendor-1",
    lines: [
      {
        description: "Office expense",
        quantity: 1,
        unit_cost: 500,
        expense_account_id: "5100-PURCHASES",
      },
    ],
  });

  const submitted = await service.submitForApproval("user-1", draft.id, { comment: "Please review supplier bill" });
  assert.equal(submitted.approval.status, "pending_approval");

  const rejected = await service.reject("user-1", draft.id, { comment: "Missing vendor backup" });
  assert.equal(rejected.approval.status, "rejected");
  assert.equal(rejected.approval.rejection_comment, "Missing vendor backup");

  const resubmitted = await service.resubmit("user-1", draft.id, { comment: "Attached corrected support" });
  assert.equal(resubmitted.approval.status, "pending_approval");
  assert.deepEqual(
    resubmitted.approval.decisions.map((row) => row.decision_type),
    ["submitted", "rejected", "resubmitted"]
  );
});
