"use strict";

const crypto = require("crypto");
const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

/** Bumped when draft invoice persistence / FK behavior changes (surfaced on GET /api/health). */
const SALES_INVOICE_SERVICE_BUILD_ID = "sales-invoice-draft-v4-line-fk-parent-key";

function coerceMysqlRowId(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  if (typeof value === "bigint") return value.toString();
  return value;
}

class SalesInvoiceService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("SalesInvoiceService requires a mysql2/promise pool");
    }
    if (!options.journalService) {
      throw new Error("SalesInvoiceService requires a journalService");
    }
    if (!options.taxService) {
      throw new Error("SalesInvoiceService requires a taxService");
    }
    if (!options.accountingControlService) {
      throw new Error("SalesInvoiceService requires an accountingControlService");
    }
    if (!options.counterpartyService) {
      throw new Error("SalesInvoiceService requires a counterpartyService");
    }

    this.pool = pool;
    this.journalService = options.journalService;
    this.taxService = options.taxService;
    this.accountingControlService = options.accountingControlService;
    this.counterpartyService = options.counterpartyService;
    this.businessRelationshipService = options.businessRelationshipService || null;
    this.approvalWorkflowService = options.approvalWorkflowService || null;
    this.inventoryLedgerService = options.inventoryLedgerService || null;
    this.auditService = options.auditService || null;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
  }

  async withTransaction(work) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_rollbackError) {
        // Preserve original error.
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  async queryAll(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  money(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  qty(value) {
    return Number(Number(value || 0).toFixed(4));
  }

  async buildInventoryCogsPosting(conn, actorUserId, companyId, invoiceId, invoiceNo, lines) {
    if (!this.inventoryLedgerService) {
      return { journalLines: [], inventoryPlan: null };
    }

    const stockLines = lines.filter((line) => line.item_id);
    if (!stockLines.length) {
      return { journalLines: [], inventoryPlan: null };
    }

    const inventoryPlan = await this.inventoryLedgerService.previewSaleIssue({
      companyId,
      invoiceId,
      lines: stockLines,
      createdByUserId: actorUserId,
      newId: this.idFactory,
      conn,
    });

    if (!inventoryPlan.applied || !inventoryPlan.movements.length) {
      throw new Error("Inventory-tracked invoice lines require resolvable stock issue cost before posting");
    }

    const totalCost = this.money(inventoryPlan.total_cost);
    if (totalCost < 0 || !Number.isFinite(totalCost)) {
      throw new Error(`Unable to resolve inventory cost for invoice ${invoiceNo}`);
    }

    if (totalCost === 0) {
      return { journalLines: [], inventoryPlan };
    }

    return {
      inventoryPlan,
      journalLines: [
        {
          accountCode: DEFAULT_ACCOUNT_CODES.costOfGoodsSold,
          debit: totalCost,
          credit: 0,
          itemId: inventoryPlan.movements.length === 1 ? inventoryPlan.movements[0].item_id : null,
          description: `Cost of goods sold for ${invoiceNo}`,
        },
        {
          accountCode: DEFAULT_ACCOUNT_CODES.inventory,
          debit: 0,
          credit: totalCost,
          itemId: inventoryPlan.movements.length === 1 ? inventoryPlan.movements[0].item_id : null,
          description: `Inventory reduction for ${invoiceNo}`,
        },
      ],
    };
  }

  async writeAudit(conn, payload) {
    if (!this.auditService) return;
    await this.auditService.logAction(payload, conn);
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS document_sequences (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        fiscal_period_id VARCHAR(36) NULL,
        document_type VARCHAR(50) NOT NULL,
        prefix VARCHAR(20) NOT NULL,
        next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
        reset_rule ENUM('never','yearly','period') NOT NULL DEFAULT 'yearly',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_document_sequences_scope (company_id, fiscal_period_id, document_type, prefix)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_invoice_headers (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        invoice_no VARCHAR(50) NOT NULL,
        sales_quote_id VARCHAR(36) NULL,
        sales_order_id VARCHAR(36) NULL,
        business_relationship_id VARCHAR(36) NULL,
        counterparty_id VARCHAR(36) NULL,
        customer_id VARCHAR(36) NULL,
        customer_name VARCHAR(255) NULL,
        customer_legal_name VARCHAR(255) NULL,
        customer_pan_vat_number VARCHAR(100) NULL,
        customer_email VARCHAR(255) NULL,
        customer_phone VARCHAR(50) NULL,
        customer_address TEXT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_journal_entry_id VARCHAR(36) NULL,
        sequence_id VARCHAR(36) NULL,
        approved_by_user_id VARCHAR(36) NULL,
        approved_at TIMESTAMP NULL DEFAULT NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        voided_at TIMESTAMP NULL DEFAULT NULL,
        notes TEXT NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_invoice_headers_company_invoice_no (company_id, invoice_no)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS sales_invoice_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_invoice_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL,
        sales_quote_line_id VARCHAR(36) NULL,
        sales_order_line_id VARCHAR(36) NULL,
        item_id VARCHAR(36) NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL DEFAULT 0,
        unit_price DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none',
        discount_value DECIMAL(14,4) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_code_id VARCHAR(36) NULL,
        tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        line_total DECIMAL(14,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_sales_invoice_lines_header_line (sales_invoice_id, line_no)
      )
      `,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS sales_quote_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS sales_order_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_pan_vat_number VARCHAR(100) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_address TEXT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS sequence_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approved_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS voided_at TIMESTAMP NULL DEFAULT NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers MODIFY COLUMN status ENUM('draft','approved','posted','partially_paid','paid','overdue','void') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS sales_quote_line_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS sales_order_line_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_type ENUM('none','percentage','fixed') NOT NULL DEFAULT 'none'`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_value DECIMAL(14,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE sales_invoice_lines ADD COLUMN IF NOT EXISTS line_total DECIMAL(14,2) NOT NULL DEFAULT 0`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Existing transitional environments may already diverge. Keep startup resilient.
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getCustomerSnapshot(conn, actorUserId, companyId, customerId, input = {}) {
    // TODO(accounting-refactor): keep this legacy-compatible entry point until
    // invoice payloads stop sending `customer_id` values that may still refer
    // to legacy clients instead of the canonical counterparty master.
    const snapshot = await this.counterpartyService.resolveCustomerSnapshot(
      conn,
      actorUserId,
      companyId,
      customerId,
      {
        ...input,
        customer_id: customerId,
      }
    );

    return {
      id: snapshot.id,
      counterparty_id: snapshot.id,
      customer_name: snapshot.display_name,
      customer_legal_name: snapshot.legal_name,
      customer_pan_vat_number: snapshot.pan_vat_number,
      customer_email: snapshot.email,
      customer_phone: snapshot.phone,
      customer_address: snapshot.address,
      linked_profile_id: snapshot.linked_profile_id || null,
    };
  }

  async resolveBusinessRelationship(conn, actorUserId, companyId, customer, payload = {}) {
    if (!this.businessRelationshipService) {
      return null;
    }
    const relationship = await this.businessRelationshipService.resolveActiveRelationship(conn, {
      actorUserId,
      companyId,
      businessRelationshipId: payload.business_relationship_id || null,
      counterpartyLinkedProfileId: customer.linked_profile_id || null,
      perspective: "seller",
    });

    if (payload.business_relationship_id && !relationship) {
      throw new Error("Business relationship not found or not accepted");
    }

    return relationship;
  }

  async calculateLine(conn, actorUserId, rawLine) {
    const commercialRefs = await this.resolveCommercialReferences(conn, actorUserId, rawLine, rawLine.current_invoice_id || null);
    const quantity = this.qty(rawLine.quantity);
    const unitPrice = this.qty(rawLine.unit_price);
    const description = String(rawLine.description || commercialRefs.description || "").trim();
    const discountType = rawLine.discount_type || "none";
    const discountValue = this.qty(rawLine.discount_value);
    if (!description) throw new Error("Each invoice line requires description");
    if (quantity <= 0) throw new Error("Invoice line quantity must be greater than 0");
    if (unitPrice < 0) throw new Error("Invoice line unit_price must be 0 or greater");
    if (!["none", "percentage", "fixed"].includes(discountType)) {
      throw new Error("discount_type must be one of none, percentage, fixed");
    }

    const lineSubtotal = this.money(quantity * unitPrice);
    let discountAmount = 0;
    if (discountType === "percentage") {
      if (discountValue < 0 || discountValue > 100) {
        throw new Error("Percentage discount_value must be between 0 and 100");
      }
      discountAmount = this.money((lineSubtotal * discountValue) / 100);
    } else if (discountType === "fixed") {
      if (discountValue < 0) throw new Error("Fixed discount_value cannot be negative");
      discountAmount = this.money(Math.min(lineSubtotal, discountValue));
    }

    const taxableBase = this.money(Math.max(lineSubtotal - discountAmount, 0));
    const taxCalc = await this.taxService.calculateLineTax(conn, actorUserId, {
      tax_code_id: rawLine.tax_code_id || null,
      tax_rate: rawLine.tax_rate,
      taxable_amount: taxableBase,
    });
    const lineTaxAmount = this.money(taxCalc.tax_amount);
    const lineTotal = this.money(taxableBase + lineTaxAmount);

    return {
      sales_quote_line_id: commercialRefs.sales_quote_line_id,
      sales_order_line_id: commercialRefs.sales_order_line_id,
      item_id: rawLine.item_id || commercialRefs.item_id || null,
      description,
      quantity,
      unit_price: unitPrice,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount: discountAmount,
      tax_code_id: taxCalc.tax_code_id,
      tax_rate: Number(taxCalc.tax_rate || 0),
      tax_type: taxCalc.tax_type,
      line_subtotal: lineSubtotal,
      line_tax_amount: lineTaxAmount,
      line_total: lineTotal,
      taxable_amount: taxableBase,
    };
  }

  async resolveCommercialReferences(conn, actorUserId, rawLine, currentInvoiceId = null) {
    let salesQuoteLine = null;
    let salesOrderLine = null;

    if (rawLine.sales_quote_line_id) {
      salesQuoteLine = await this.queryOne(
        conn,
        `SELECT sqln.*, sqh.user_id
           FROM sales_quote_lines sqln
           JOIN sales_quote_headers sqh ON sqh.id = sqln.sales_quote_id
          WHERE sqln.id = ?
          LIMIT 1`,
        [rawLine.sales_quote_line_id]
      ).catch(() => null);
      if (!salesQuoteLine || salesQuoteLine.user_id !== actorUserId) {
        throw new Error("Referenced sales quote line not found");
      }
    }

    if (rawLine.sales_order_line_id) {
      salesOrderLine = await this.queryOne(
        conn,
        `SELECT sol.*, soh.user_id, soh.sales_quote_id
           FROM sales_order_lines sol
           JOIN sales_order_headers soh ON soh.id = sol.sales_order_id
          WHERE sol.id = ?
          LIMIT 1`,
        [rawLine.sales_order_line_id]
      ).catch(() => null);
      if (!salesOrderLine || salesOrderLine.user_id !== actorUserId) {
        throw new Error("Referenced sales order line not found");
      }
    }

    if (salesOrderLine?.sales_quote_line_id) {
      if (salesQuoteLine && salesQuoteLine.id !== salesOrderLine.sales_quote_line_id) {
        throw new Error("Sales order line does not match the referenced quote line");
      }
      if (!salesQuoteLine) {
        salesQuoteLine = await this.queryOne(
          conn,
          `SELECT sqln.*, sqh.user_id
             FROM sales_quote_lines sqln
             JOIN sales_quote_headers sqh ON sqh.id = sqln.sales_quote_id
            WHERE sqln.id = ?
            LIMIT 1`,
          [salesOrderLine.sales_quote_line_id]
        ).catch(() => null);
      }
    }

    if (salesOrderLine) {
      const invoicedRow = await this.queryOne(
        conn,
        `SELECT COALESCE(SUM(sil.quantity), 0) AS invoiced_quantity
           FROM sales_invoice_lines sil
           JOIN sales_invoice_headers sih ON sih.id = sil.sales_invoice_id
          WHERE sil.sales_order_line_id = ?
            AND sih.id <> ?`,
        [salesOrderLine.id, currentInvoiceId || ""]
      ).catch(() => null);
      const remaining = this.qty(Number(salesOrderLine.ordered_quantity || 0) - Number(invoicedRow?.invoiced_quantity || 0));
      if (Number(rawLine.quantity || 0) > remaining) {
        throw new Error("Invoice quantity exceeds remaining uninvoiced quantity on the referenced sales order line");
      }
    }

    return {
      sales_quote_line_id: salesQuoteLine?.id || null,
      sales_order_line_id: salesOrderLine?.id || null,
      item_id: rawLine.item_id || salesOrderLine?.item_id || salesQuoteLine?.item_id || null,
      description: salesOrderLine?.description || salesQuoteLine?.description || null,
    };
  }

  deriveHeaderTotals(lines) {
    return lines.reduce(
      (acc, line) => {
        acc.subtotal_amount = this.money(acc.subtotal_amount + line.line_subtotal);
        acc.discount_amount = this.money(acc.discount_amount + line.discount_amount);
        acc.taxable_amount = this.money(acc.taxable_amount + line.taxable_amount);
        acc.tax_amount = this.money(acc.tax_amount + line.line_tax_amount);
        acc.total_amount = this.money(acc.total_amount + line.line_total);
        return acc;
      },
      {
        subtotal_amount: 0,
        discount_amount: 0,
        taxable_amount: 0,
        tax_amount: 0,
        total_amount: 0,
      }
    );
  }

  async normalizeInvoiceLines(conn, actorUserId, invoiceId, lines) {
    const normalizedLines = [];
    for (const line of lines) {
      normalizedLines.push(await this.calculateLine(conn, actorUserId, {
        ...line,
        current_invoice_id: invoiceId,
      }));
    }

    if (!normalizedLines.length) {
      throw new Error("At least one invoice line is required");
    }

    return {
      lines: normalizedLines,
      totals: this.deriveHeaderTotals(normalizedLines),
    };
  }

  /**
   * Persists lines using the exact `sales_invoice_headers.id` value returned by MySQL so child FKs
   * succeed when the column is CHAR/BINARY or collation differs from the JS UUID string we generated.
   * @returns {string} Canonical header id for follow-up queries in the same request.
   */
  async persistInvoiceLines(conn, invoiceId, normalizedLines) {
    const headerRow = await this.queryOne(conn, `SELECT id FROM sales_invoice_headers WHERE id = ? LIMIT 1`, [invoiceId]);
    if (!headerRow) {
      throw new Error(
        "Cannot save invoice lines: header row is missing. The INSERT into sales_invoice_headers did not leave a row visible in this transaction — check DB schema vs API, or restart the backend so header-before-lines code is loaded."
      );
    }

    const parentKey = coerceMysqlRowId(headerRow.id);
    if (parentKey === null || parentKey === undefined || parentKey === "") {
      throw new Error("Cannot save invoice lines: header id from database is empty.");
    }

    await conn.execute(`DELETE FROM sales_invoice_lines WHERE sales_invoice_id = ?`, [parentKey]);

    for (let i = 0; i < normalizedLines.length; i += 1) {
      const line = normalizedLines[i];
      try {
        await conn.execute(
          `INSERT INTO sales_invoice_lines
          (id, sales_invoice_id, line_no, sales_quote_line_id, sales_order_line_id, item_id, description, quantity, unit_price, discount_type,
           discount_value, discount_amount, tax_code_id, tax_rate, line_subtotal, line_tax_amount, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.idFactory(),
            parentKey,
            i + 1,
            line.sales_quote_line_id,
            line.sales_order_line_id,
            line.item_id,
            line.description,
            line.quantity,
            line.unit_price,
            line.discount_type,
            line.discount_value,
            line.discount_amount,
            line.tax_code_id,
            line.tax_rate,
            line.line_subtotal,
            line.line_tax_amount,
            line.line_total,
          ]
        );
      } catch (err) {
        if (err && (err.code === "ER_NO_REFERENCED_ROW_2" || String(err.message || "").includes("foreign key"))) {
          throw new Error(
            `Could not insert invoice lines: foreign key to sales_invoice_headers failed while using parent id ${JSON.stringify(parentKey)}. ` +
              "Often this means the header row was not inserted on the same connection/transaction, or id column types (CHAR vs VARCHAR, collation) do not match between header and line tables."
          );
        }
        throw err;
      }
    }

    return parentKey;
  }

  async replaceInvoiceLines(conn, actorUserId, invoiceId, lines) {
    const { lines: normalizedLines, totals } = await this.normalizeInvoiceLines(conn, actorUserId, invoiceId, lines);
    await this.persistInvoiceLines(conn, invoiceId, normalizedLines);
    return { lines: normalizedLines, totals };
  }

  async getPaymentSnapshot(conn, actorUserId, invoiceId, totalAmount) {
    const row = await this.queryOne(
      conn,
      `SELECT
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END), 0) AS allocated_amount
       FROM payment_allocations pa
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pa.sales_invoice_id = ?
          OR pa.invoice_id = ?`,
      [invoiceId, invoiceId]
    ).catch(() => null);

    const allocatedAmount = this.money(row?.allocated_amount || 0);
    const outstandingAmount = this.money(Number(totalAmount || 0) - allocatedAmount);
    return {
      allocated_amount: allocatedAmount,
      outstanding_amount: outstandingAmount < 0 ? 0 : outstandingAmount,
    };
  }

  deriveDisplayStatus(baseStatus, paymentSnapshot, dueDate) {
    if (baseStatus === "draft" || baseStatus === "approved" || baseStatus === "void") {
      return baseStatus;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (paymentSnapshot.outstanding_amount <= 0) return "paid";
    if (paymentSnapshot.allocated_amount > 0) return "partially_paid";
    if (dueDate && dueDate < today) return "overdue";
    return "posted";
  }

  async hydrateInvoice(conn, actorUserId, header) {
    const lines = await this.queryAll(
      conn,
      `SELECT *
         FROM sales_invoice_lines
        WHERE sales_invoice_id = ?
        ORDER BY line_no ASC`,
      [header.id]
    );

    const paymentSnapshot = await this.getPaymentSnapshot(conn, actorUserId, header.id, header.total_amount);
    const approval = this.approvalWorkflowService
      ? await this.approvalWorkflowService.buildApprovalView(conn, {
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        documentType: "sales_invoice",
        entityId: header.id,
        header,
      })
      : {
        required: false,
        workflow_id: null,
        workflow_name: null,
        status: header.approval_status || "not_required",
        current_step_no: null,
        submitted_at: null,
        submitted_by_user_id: null,
        approved_at: header.approved_at || null,
        approved_by_user_id: header.approved_by_user_id || null,
        rejected_at: null,
        rejected_by_user_id: null,
        rejection_comment: null,
        decisions: [],
      };
    return {
      ...header,
      status: this.deriveDisplayStatus(header.status, paymentSnapshot, header.due_date),
      base_status: header.status,
      payment: paymentSnapshot,
      approval,
      commercial_origin: {
        sales_quote_id: header.sales_quote_id || null,
        sales_order_id: header.sales_order_id || null,
      },
      lines,
    };
  }

  async createDraft(actorUserId, payload, requestMeta = {}, externalConn = null) {
    const runner = externalConn
      ? (work) => work(externalConn)
      : (work) => this.withTransaction(work);

    return runner(async (conn) => {
      const companyId = await this.resolveCompanyId(conn, actorUserId);
      const customerRef = payload.counterparty_id || payload.customer_id || payload.client_id || null;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerRef, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, customer, payload);
      const invoiceDate = payload.invoice_date || new Date().toISOString().slice(0, 10);
      const dueDate = payload.due_date || invoiceDate;
      const numberInfo = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "sales_invoice",
        entryDate: invoiceDate,
      });
      const invoiceId = this.idFactory();

      const { totals, lines } = await this.normalizeInvoiceLines(conn, actorUserId, invoiceId, payload.lines || []);

      const [insertHeaderResult] = await conn.execute(
        `INSERT INTO sales_invoice_headers
          (id, company_id, user_id, invoice_no, sales_quote_id, sales_order_id, business_relationship_id, counterparty_id, customer_id, customer_name, customer_legal_name, customer_pan_vat_number, customer_email,
           customer_phone, customer_address, invoice_date, due_date, status, subtotal_amount, discount_amount, taxable_amount, tax_amount, total_amount,
           notes, sequence_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [
          invoiceId,
          companyId,
          actorUserId,
          numberInfo.documentNumber,
          payload.sales_quote_id || null,
          payload.sales_order_id || null,
          businessRelationship?.id || null,
          customer.counterparty_id,
          customer.id,
          customer.customer_name,
          customer.customer_legal_name,
          customer.customer_pan_vat_number,
          customer.customer_email,
          customer.customer_phone,
          customer.customer_address,
          invoiceDate,
          dueDate,
          totals.subtotal_amount,
          totals.discount_amount,
          totals.taxable_amount,
          totals.tax_amount,
          totals.total_amount,
          payload.notes || null,
          numberInfo.sequenceId,
          actorUserId,
        ]
      );
      if (!insertHeaderResult || Number(insertHeaderResult.affectedRows || 0) < 1) {
        throw new Error("Failed to insert sales_invoice_headers row (0 affected rows). Check DB permissions and schema.");
      }

      const headerRowId = await this.persistInvoiceLines(conn, invoiceId, lines);

      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?`,
        [headerRowId]
      );
      if (this.approvalWorkflowService) {
        await this.approvalWorkflowService.initializeDocument(conn, {
          companyId,
          documentType: "sales_invoice",
          entityId: headerRowId,
        });
      }

      const hydrated = await this.hydrateInvoice(
        conn,
        actorUserId,
        await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [headerRowId])
      );
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: headerRowId,
        actionType: "create",
        newValues: {
          invoice_no: header.invoice_no,
          status: header.status,
          business_relationship_id: header.business_relationship_id,
          counterparty_id: header.counterparty_id,
          customer_id: header.customer_id,
          total_amount: header.total_amount,
          line_count: lines.length,
        },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async updateDraft(actorUserId, invoiceId, payload, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );

      if (!existing) throw new Error("Sales invoice not found");
      if (existing.status !== "draft") {
        throw new Error("Only draft invoices can be edited");
      }

      const beforeState = await this.hydrateInvoice(conn, actorUserId, existing);

      const companyId = existing.company_id || await this.resolveCompanyId(conn, actorUserId);
      const customerId = payload.counterparty_id || payload.customer_id || payload.client_id || existing.counterparty_id || existing.customer_id;
      const customer = await this.getCustomerSnapshot(conn, actorUserId, companyId, customerId, payload);
      const businessRelationship = await this.resolveBusinessRelationship(conn, actorUserId, companyId, customer, {
        ...payload,
        business_relationship_id: payload.business_relationship_id !== undefined
          ? payload.business_relationship_id
          : existing.business_relationship_id,
      });
      const { totals, lines } = await this.replaceInvoiceLines(conn, actorUserId, invoiceId, payload.lines || []);

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET sales_quote_id = ?,
                sales_order_id = ?,
                business_relationship_id = ?,
                counterparty_id = ?,
                customer_id = ?,
                customer_name = ?,
                customer_legal_name = ?,
                customer_pan_vat_number = ?,
                customer_email = ?,
                customer_phone = ?,
                customer_address = ?,
                invoice_date = ?,
                due_date = ?,
                subtotal_amount = ?,
                discount_amount = ?,
                taxable_amount = ?,
                tax_amount = ?,
                total_amount = ?,
                notes = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          payload.sales_quote_id !== undefined ? payload.sales_quote_id : existing.sales_quote_id,
          payload.sales_order_id !== undefined ? payload.sales_order_id : existing.sales_order_id,
          businessRelationship?.id || null,
          customer.counterparty_id,
          customer.id,
          customer.customer_name,
          customer.customer_legal_name,
          customer.customer_pan_vat_number,
          customer.customer_email,
          customer.customer_phone,
          customer.customer_address,
          payload.invoice_date || existing.invoice_date,
          payload.due_date || existing.due_date,
          totals.subtotal_amount,
          totals.discount_amount,
          totals.taxable_amount,
          totals.tax_amount,
          totals.total_amount,
          payload.notes !== undefined ? payload.notes : existing.notes,
          invoiceId,
        ]
      );

      const header = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, header);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "update",
        oldValues: beforeState,
        newValues: hydrated,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async approve(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      if (this.approvalWorkflowService) {
        const approvalResult = await this.approvalWorkflowService.approveDocument(conn, {
          companyId,
          documentType: "sales_invoice",
          entityId: invoiceId,
          actorUserId,
          comment: requestMeta.comment || requestMeta.reason || null,
        });
        if (approvalResult.workflowRequired) {
          const updated = approvalResult.header;
          const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
          await this.writeAudit(conn, {
            actorUserId,
            companyId,
            entityType: "sales_invoice",
            entityId: invoiceId,
            actionType: "approve",
            oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
            newValues: {
              status: updated.status,
              approval_status: updated.approval_status,
              approved_at: updated.approved_at,
            },
            ipAddress: requestMeta.ipAddress || null,
            userAgent: requestMeta.userAgent || null,
            route: requestMeta.route || null,
            method: requestMeta.method || null,
          });
          return hydrated;
        }
      }

      if (header.status !== "draft") throw new Error("Only draft invoices can be approved");

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'approved',
                approved_by_user_id = ?,
                approved_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [actorUserId, invoiceId]
      );
      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const lines = await this.queryAll(conn, `SELECT * FROM sales_invoice_lines WHERE sales_invoice_id = ? ORDER BY line_no ASC`, [invoiceId]);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "approve",
        oldValues: { status: header.status },
        newValues: { status: updated.status, approved_at: updated.approved_at },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async submitForApproval(actorUserId, invoiceId, payload = {}, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);

      if (!this.approvalWorkflowService) {
        return this.approve(actorUserId, invoiceId, {
          ...requestMeta,
          comment: payload.comment || payload.reason || null,
        });
      }

      const result = await this.approvalWorkflowService.submitDocument(conn, {
        companyId,
        documentType: "sales_invoice",
        entityId: invoiceId,
        actorUserId,
        comment: payload.comment || payload.reason || null,
      });
      const updated = result.header && result.header.id
        ? result.header
        : await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: result.workflowRequired ? result.decisionType : "submit_for_approval",
        oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
        newValues: { status: updated.status, approval_status: updated.approval_status || "not_required" },
        reason: payload.comment || payload.reason || null,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async reject(actorUserId, invoiceId, payload = {}, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      if (!this.approvalWorkflowService) {
        throw new Error("No approval workflow is configured for sales invoices");
      }

      const result = await this.approvalWorkflowService.rejectDocument(conn, {
        companyId,
        documentType: "sales_invoice",
        entityId: invoiceId,
        actorUserId,
        comment: payload.comment || payload.reason || null,
      });
      const updated = result.header;
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "reject",
        oldValues: { status: header.status, approval_status: header.approval_status || "draft" },
        newValues: {
          status: updated.status,
          approval_status: updated.approval_status,
          rejected_at: updated.rejected_at,
          rejection_comment: updated.rejection_comment,
        },
        reason: payload.comment || payload.reason || null,
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async resubmit(actorUserId, invoiceId, payload = {}, requestMeta = {}) {
    return this.submitForApproval(actorUserId, invoiceId, payload, requestMeta);
  }

  async post(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      if (header.posted_journal_entry_id) {
        throw new Error("Invoice has already been posted");
      }
      const companyId = header.company_id || await this.resolveCompanyId(conn, actorUserId);
      if (this.approvalWorkflowService) {
        await this.approvalWorkflowService.assertCanPost(conn, {
          companyId,
          documentType: "sales_invoice",
          header,
        });
      }
      if (!["approved", "draft"].includes(header.status)) {
        throw new Error("Only draft or approved invoices can be posted");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT *
           FROM sales_invoice_lines
          WHERE sales_invoice_id = ?
          ORDER BY line_no ASC`,
        [invoiceId]
      );
      if (!lines.length) throw new Error("Invoice requires at least one line before posting");
      await this.accountingControlService.validatePostingDate(conn, companyId, header.invoice_date);

      const revenueAmount = this.money(header.taxable_amount);
      const totalAmount = this.money(header.total_amount);
      const outputTaxPostings = await this.taxService.buildOutputTaxPostings(conn, actorUserId, lines);
      const { journalLines: inventoryJournalLines, inventoryPlan } = await this.buildInventoryCogsPosting(
        conn,
        actorUserId,
        companyId,
        invoiceId,
        header.invoice_no,
        lines
      );

      const journalEntry = await this.journalService.createJournalEntry({
        companyId,
        sourceType: "sales_invoice",
        sourceId: invoiceId,
        entryDate: header.invoice_date,
        memo: `Post sales invoice ${header.invoice_no}`,
        createdByUserId: actorUserId,
        requestMeta,
        conn,
        lines: [
          {
            accountCode: "1100-AR",
            debit: totalAmount,
            credit: 0,
            customerId: header.counterparty_id || header.customer_id || null,
            description: `Accounts receivable for ${header.invoice_no}`,
          },
          {
            accountCode: "4100-SALES",
            debit: 0,
            credit: revenueAmount,
            customerId: header.counterparty_id || header.customer_id || null,
            description: `Sales revenue for ${header.invoice_no}`,
          },
          ...outputTaxPostings.map((posting) => ({
            accountId: posting.accountId || null,
            accountCode: posting.accountCode,
            debit: 0,
            credit: posting.amount,
            customerId: header.counterparty_id || header.customer_id || null,
            description: `VAT payable for ${header.invoice_no}`,
          })),
          ...inventoryJournalLines,
        ],
      });

      const postedJournal = await this.journalService.postJournalEntry({
        companyId,
        journalEntryId: journalEntry.id,
        actorUserId,
        requestMeta,
        conn,
      });

      let inventoryHook = null;
      if (this.inventoryLedgerService && lines.some((line) => line.item_id)) {
        try {
          inventoryHook = await this.inventoryLedgerService.applySaleIssue({
            companyId,
            invoiceId,
            lines: lines.map((line) => ({
              item_id: line.item_id,
              quantity: line.quantity,
              product_name: line.description,
              line_no: line.line_no,
            })),
            createdByUserId: actorUserId,
            newId: this.idFactory,
            postAccounting: false,
            conn,
          });
        } catch (error) {
          throw new Error(`Sales invoice posted journal could not complete stock issue: ${error.message}`);
        }
      }

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'posted',
                posted_journal_entry_id = ?,
                posted_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [postedJournal.id, invoiceId]
      );

      await this.taxService.recordTaxTransactionsForSalesInvoice(conn, actorUserId, {
        companyId,
        header,
        lines,
        postedJournalEntryId: postedJournal.id,
      });

      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId,
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "post",
        oldValues: { status: header.status, posted_journal_entry_id: header.posted_journal_entry_id },
        newValues: { status: updated.status, posted_journal_entry_id: updated.posted_journal_entry_id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return {
        ...hydrated,
        inventory_hook: inventoryHook || inventoryPlan,
      };
    });
  }

  async void(actorUserId, invoiceId, requestMeta = {}) {
    return this.withTransaction(async (conn) => {
      const header = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?
          FOR UPDATE`,
        [invoiceId, actorUserId]
      );
      if (!header) throw new Error("Sales invoice not found");
      if (header.posted_journal_entry_id) {
        throw new Error("Posted invoices cannot be voided directly; use reversal/credit note");
      }
      if (header.status === "void") {
        return this.hydrateInvoice(conn, actorUserId, header);
      }

      await conn.execute(
        `UPDATE sales_invoice_headers
            SET status = 'void',
                voided_at = NOW(),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [invoiceId]
      );

      const updated = await this.queryOne(conn, `SELECT * FROM sales_invoice_headers WHERE id = ?`, [invoiceId]);
      const lines = await this.queryAll(conn, `SELECT * FROM sales_invoice_lines WHERE sales_invoice_id = ? ORDER BY line_no ASC`, [invoiceId]);
      const hydrated = await this.hydrateInvoice(conn, actorUserId, updated);
      await this.writeAudit(conn, {
        actorUserId,
        companyId: header.company_id || await this.resolveCompanyId(conn, actorUserId),
        entityType: "sales_invoice",
        entityId: invoiceId,
        actionType: "void",
        oldValues: { status: header.status },
        newValues: { status: updated.status, voided_at: updated.voided_at },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
        route: requestMeta.route || null,
        method: requestMeta.method || null,
      });
      return hydrated;
    });
  }

  async list(actorUserId) {
    const conn = await this.pool.getConnection();
    try {
      const rows = await this.queryAll(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE user_id = ?
          ORDER BY created_at DESC`,
        [actorUserId]
      );

      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateInvoice(conn, actorUserId, row));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async getById(actorUserId, invoiceId) {
    const conn = await this.pool.getConnection();
    try {
      const row = await this.queryOne(
        conn,
        `SELECT *
           FROM sales_invoice_headers
          WHERE id = ?
            AND user_id = ?`,
        [invoiceId, actorUserId]
      );
      if (!row) return null;
      return this.hydrateInvoice(conn, actorUserId, row);
    } finally {
      conn.release();
    }
  }
}

module.exports = {
  SalesInvoiceService,
  SALES_INVOICE_SERVICE_BUILD_ID,
};
