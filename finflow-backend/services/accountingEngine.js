"use strict";

const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

/**
 * AccountingEngine enforces strict double-entry posting on FinFlow V2 schema.
 *
 * Rules:
 * - Every posting happens inside a single DB transaction
 * - Journal entries are created as draft, lines inserted, balance validated, then posted
 * - Posted entries are immutable; corrections must be reversal entries
 * - All posting and reversal actions are written to audit_logs
 */
class AccountingEngine {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("AccountingEngine requires a mysql2/promise pool");
    }

    this.pool = pool;
    this.defaultAccountCodes = {
      ar: options.defaultArCode || DEFAULT_ACCOUNT_CODES.accountsReceivable,
      ap: options.defaultApCode || DEFAULT_ACCOUNT_CODES.accountsPayable,
      outputTax: options.defaultOutputTaxCode || DEFAULT_ACCOUNT_CODES.outputVatPayable,
      inputTax: options.defaultInputTaxCode || DEFAULT_ACCOUNT_CODES.inputVat,
      inventory: options.defaultInventoryCode || DEFAULT_ACCOUNT_CODES.inventory,
      cogs: options.defaultCogsCode || DEFAULT_ACCOUNT_CODES.costOfGoodsSold,
      inventoryAdjustmentExpense: options.defaultInventoryAdjustmentExpenseCode || DEFAULT_ACCOUNT_CODES.inventoryAdjustmentLoss,
      inventoryAdjustmentGain: options.defaultInventoryAdjustmentGainCode || DEFAULT_ACCOUNT_CODES.inventoryAdjustmentGain
    };
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
      } catch (rollbackError) {
        // Preserve original posting error while surfacing rollback issue in logs.
        console.error("[ACCOUNTING_ROLLBACK_ERROR]", rollbackError.message);
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  async queryOne(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows[0] || null;
  }

  async queryAll(conn, sql, params = []) {
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  async insertAuditLog(conn, payload) {
    const {
      companyId,
      actorUserId,
      entityType,
      entityId,
      actionType,
      reason = null,
      beforeState = null,
      afterState = null,
      ipAddress = null,
      userAgent = null
    } = payload;

    await conn.execute(
      `INSERT INTO audit_logs
        (company_id, actor_user_id, entity_type, entity_id, action_type, reason, before_state, after_state, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        companyId,
        actorUserId || null,
        entityType,
        String(entityId),
        actionType,
        reason,
        beforeState ? JSON.stringify(beforeState) : null,
        afterState ? JSON.stringify(afterState) : null,
        ipAddress,
        userAgent
      ]
    );
  }

  async resolveAccountIdByCode(conn, companyId, code) {
    const row = await this.queryOne(
      conn,
      `SELECT id
         FROM chart_of_accounts
        WHERE company_id = ?
          AND account_code = ?
          AND is_active = 1
        LIMIT 1`,
      [companyId, code]
    );

    if (!row) {
      throw new Error(`Required account not found for company ${companyId}: ${code}`);
    }
    return row.id;
  }

  async getOpenFiscalPeriodId(conn, companyId, entryDate) {
    const row = await this.queryOne(
      conn,
      `SELECT id
         FROM fiscal_periods
        WHERE company_id = ?
          AND status = 'open'
          AND ? BETWEEN start_date AND end_date
        ORDER BY start_date DESC
        LIMIT 1`,
      [companyId, entryDate]
    );

    if (!row) {
      throw new Error("No open fiscal period found for entry date");
    }

    return row.id;
  }

  async generateEntryNumber(conn, companyId, entryDate) {
    const row = await this.queryOne(
      conn,
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(entry_number, '-', -1) AS UNSIGNED)), 0) AS seq
         FROM journal_entries
        WHERE company_id = ?
          AND entry_number LIKE ?`,
      [companyId, `JE-${entryDate}-%`]
    );

    const nextSeq = Number(row?.seq || 0) + 1;
    return `JE-${entryDate}-${String(nextSeq).padStart(6, "0")}`;
  }

  validateBalancedLines(lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new Error("Journal entry must contain at least 2 lines");
    }

    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of lines) {
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      if (debit < 0 || credit < 0) {
        throw new Error("Debit/Credit cannot be negative");
      }
      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new Error("Each line must have exactly one non-zero side");
      }

      debitTotal += debit;
      creditTotal += credit;
    }

    const roundedDebit = Number(debitTotal.toFixed(2));
    const roundedCredit = Number(creditTotal.toFixed(2));

    if (roundedDebit !== roundedCredit) {
      throw new Error(`Unbalanced journal lines: debit=${roundedDebit}, credit=${roundedCredit}`);
    }

    return { debitTotal: roundedDebit, creditTotal: roundedCredit };
  }

  async createAndPostJournalEntry(conn, payload) {
    const {
      companyId,
      fiscalPeriodId,
      entryDate,
      sourceType,
      sourceId,
      memo,
      createdByUserId,
      lines
    } = payload;

    this.validateBalancedLines(lines);

    const entryNumber = await this.generateEntryNumber(conn, companyId, entryDate);

    const [result] = await conn.execute(
      `INSERT INTO journal_entries
        (company_id, fiscal_period_id, entry_number, entry_date, posting_status, source_type, source_id, memo, created_by_user_id)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [companyId, fiscalPeriodId, entryNumber, entryDate, sourceType, sourceId || null, memo || null, createdByUserId]
    );

    const journalEntryId = result.insertId;

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      await conn.execute(
        `INSERT INTO journal_lines
          (journal_entry_id, line_no, account_id, description, debit_amount, credit_amount, customer_id, vendor_id, item_id, tax_code_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          journalEntryId,
          i + 1,
          line.accountId,
          line.description || null,
          Number(line.debit || 0).toFixed(2),
          Number(line.credit || 0).toFixed(2),
          line.customerId || null,
          line.vendorId || null,
          line.itemId || null,
          line.taxCodeId || null
        ]
      );
    }

    await conn.execute(
      `UPDATE journal_entries
          SET posting_status = 'posted',
              posted_by_user_id = ?,
              posted_at = NOW(),
              updated_at = NOW()
        WHERE id = ?
          AND posting_status = 'draft'`,
      [createdByUserId, journalEntryId]
    );

    const postedEntry = await this.queryOne(
      conn,
      `SELECT * FROM journal_entries WHERE id = ?`,
      [journalEntryId]
    );

    return postedEntry;
  }

  async getSalesInvoiceContext(conn, companyId, salesInvoiceId) {
    const invoice = await this.queryOne(
      conn,
      `SELECT si.*, c.receivable_account_id
         FROM sales_invoices si
         JOIN customers c ON c.id = si.customer_id
        WHERE si.id = ?
          AND si.company_id = ?
        FOR UPDATE`,
      [salesInvoiceId, companyId]
    );

    if (!invoice) {
      throw new Error("Sales invoice not found");
    }
    if (invoice.posted_journal_entry_id) {
      throw new Error("Sales invoice already posted to journal");
    }

    const lines = await this.queryAll(
      conn,
      `SELECT sil.*, tc.output_tax_account_id
         FROM sales_invoice_lines sil
         LEFT JOIN tax_codes tc ON tc.id = sil.tax_code_id
        WHERE sil.sales_invoice_id = ?
        ORDER BY sil.line_no ASC`,
      [salesInvoiceId]
    );

    if (!lines.length) {
      throw new Error("Sales invoice has no lines");
    }

    return { invoice, lines };
  }

  async postSalesInvoice(params) {
    const { companyId, salesInvoiceId, actorUserId, entryDate = null, memo = null, requestMeta = {} } = params;

    return this.withTransaction(async (conn) => {
      const { invoice, lines } = await this.getSalesInvoiceContext(conn, companyId, salesInvoiceId);
      const postingDate = entryDate || invoice.invoice_date;
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postingDate);

      const arAccountId = invoice.receivable_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.ar);

      const revenueByAccount = new Map();
      const taxByAccount = new Map();

      for (const line of lines) {
        const revenueAmount = Number(line.line_subtotal || 0);
        const taxAmount = Number(line.line_tax_amount || 0);

        revenueByAccount.set(
          line.revenue_account_id,
          Number((Number(revenueByAccount.get(line.revenue_account_id) || 0) + revenueAmount).toFixed(2))
        );

        if (taxAmount > 0) {
          const taxAccountId = line.output_tax_account_id ||
            await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.outputTax);
          taxByAccount.set(
            taxAccountId,
            Number((Number(taxByAccount.get(taxAccountId) || 0) + taxAmount).toFixed(2))
          );
        }
      }

      const totalInvoiceAmount = Number(invoice.total_amount);
      const journalLines = [
        {
          accountId: arAccountId,
          debit: totalInvoiceAmount,
          credit: 0,
          description: `AR for Sales Invoice ${invoice.invoice_number}`,
          customerId: invoice.customer_id
        }
      ];

      for (const [accountId, amount] of revenueByAccount.entries()) {
        if (amount <= 0) continue;
        journalLines.push({
          accountId,
          debit: 0,
          credit: amount,
          description: `Revenue for Sales Invoice ${invoice.invoice_number}`,
          customerId: invoice.customer_id
        });
      }

      for (const [accountId, amount] of taxByAccount.entries()) {
        if (amount <= 0) continue;
        journalLines.push({
          accountId,
          debit: 0,
          credit: amount,
          description: `Output tax for Sales Invoice ${invoice.invoice_number}`,
          customerId: invoice.customer_id
        });
      }

      const entry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postingDate,
        sourceType: "sales_invoice",
        sourceId: invoice.id,
        memo: memo || `Posting sales invoice ${invoice.invoice_number}`,
        createdByUserId: actorUserId,
        lines: journalLines
      });

      await conn.execute(
        `UPDATE sales_invoices
            SET posted_journal_entry_id = ?,
                status = CASE WHEN status = 'draft' THEN 'issued' ELSE status END,
                updated_at = NOW()
          WHERE id = ?`,
        [entry.id, invoice.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "sales_invoice",
        entityId: invoice.id,
        actionType: "post",
        reason: "Sales invoice posted",
        beforeState: { posted_journal_entry_id: null },
        afterState: { posted_journal_entry_id: entry.id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return entry;
    });
  }

  async getPurchaseBillContext(conn, companyId, purchaseBillId) {
    const bill = await this.queryOne(
      conn,
      `SELECT pb.*, v.payable_account_id
         FROM purchase_bills pb
         JOIN vendors v ON v.id = pb.vendor_id
        WHERE pb.id = ?
          AND pb.company_id = ?
        FOR UPDATE`,
      [purchaseBillId, companyId]
    );

    if (!bill) {
      throw new Error("Purchase bill not found");
    }
    if (bill.posted_journal_entry_id) {
      throw new Error("Purchase bill already posted to journal");
    }

    const lines = await this.queryAll(
      conn,
      `SELECT pbl.*, i.item_type, i.inventory_account_id, tc.input_tax_account_id
         FROM purchase_bill_lines pbl
         LEFT JOIN items i ON i.id = pbl.item_id
         LEFT JOIN tax_codes tc ON tc.id = pbl.tax_code_id
        WHERE pbl.purchase_bill_id = ?
        ORDER BY pbl.line_no ASC`,
      [purchaseBillId]
    );

    if (!lines.length) {
      throw new Error("Purchase bill has no lines");
    }

    return { bill, lines };
  }

  async postPurchaseBill(params) {
    const { companyId, purchaseBillId, actorUserId, entryDate = null, memo = null, requestMeta = {} } = params;

    return this.withTransaction(async (conn) => {
      const { bill, lines } = await this.getPurchaseBillContext(conn, companyId, purchaseBillId);
      const postingDate = entryDate || bill.bill_date;
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postingDate);

      const apAccountId = bill.payable_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.ap);

      const debitByAccount = new Map();
      const inputTaxByAccount = new Map();

      for (const line of lines) {
        const lineAmount = Number(line.line_subtotal || 0);
        const taxAmount = Number(line.line_tax_amount || 0);

        let debitAccountId = line.expense_account_id;
        if (line.item_type === "inventory") {
          debitAccountId = line.inventory_account_id ||
            await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.inventory);
        }

        debitByAccount.set(
          debitAccountId,
          Number((Number(debitByAccount.get(debitAccountId) || 0) + lineAmount).toFixed(2))
        );

        if (taxAmount > 0) {
          const inputTaxAccountId = line.input_tax_account_id ||
            await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.inputTax);

          inputTaxByAccount.set(
            inputTaxAccountId,
            Number((Number(inputTaxByAccount.get(inputTaxAccountId) || 0) + taxAmount).toFixed(2))
          );
        }
      }

      const totalBillAmount = Number(bill.total_amount);
      const journalLines = [];

      for (const [accountId, amount] of debitByAccount.entries()) {
        if (amount <= 0) continue;
        journalLines.push({
          accountId,
          debit: amount,
          credit: 0,
          description: `Expense/Inventory for Purchase Bill ${bill.bill_number}`,
          vendorId: bill.vendor_id
        });
      }

      for (const [accountId, amount] of inputTaxByAccount.entries()) {
        if (amount <= 0) continue;
        journalLines.push({
          accountId,
          debit: amount,
          credit: 0,
          description: `Input tax for Purchase Bill ${bill.bill_number}`,
          vendorId: bill.vendor_id
        });
      }

      journalLines.push({
        accountId: apAccountId,
        debit: 0,
        credit: totalBillAmount,
        description: `AP for Purchase Bill ${bill.bill_number}`,
        vendorId: bill.vendor_id
      });

      const entry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postingDate,
        sourceType: "purchase_bill",
        sourceId: bill.id,
        memo: memo || `Posting purchase bill ${bill.bill_number}`,
        createdByUserId: actorUserId,
        lines: journalLines
      });

      await conn.execute(
        `UPDATE purchase_bills
            SET posted_journal_entry_id = ?,
                status = CASE WHEN status = 'draft' THEN 'received' ELSE status END,
                updated_at = NOW()
          WHERE id = ?`,
        [entry.id, bill.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "purchase_bill",
        entityId: bill.id,
        actionType: "post",
        reason: "Purchase bill posted",
        beforeState: { posted_journal_entry_id: null },
        afterState: { posted_journal_entry_id: entry.id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return entry;
    });
  }

  async getPaymentContext(conn, companyId, paymentId) {
    const payment = await this.queryOne(
      conn,
      `SELECT *
         FROM payments
        WHERE id = ?
          AND company_id = ?
        FOR UPDATE`,
      [paymentId, companyId]
    );

    if (!payment) {
      throw new Error("Payment not found");
    }
    if (payment.posted_journal_entry_id) {
      throw new Error("Payment already posted to journal");
    }

    const allocations = await this.queryAll(
      conn,
      `SELECT *
         FROM payment_allocations
        WHERE payment_id = ?
        ORDER BY id ASC`,
      [paymentId]
    );

    return { payment, allocations };
  }

  async postPaymentReceived(params) {
    const { companyId, paymentId, actorUserId, entryDate = null, memo = null, requestMeta = {} } = params;

    return this.withTransaction(async (conn) => {
      const { payment, allocations } = await this.getPaymentContext(conn, companyId, paymentId);

      if (payment.direction !== "inbound") {
        throw new Error("Payment direction must be inbound for payment received posting");
      }
      if (payment.counterparty_type !== "customer" || !payment.customer_id) {
        throw new Error("Inbound payment must be linked to a customer");
      }

      const allocatedTotal = Number(
        allocations.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0).toFixed(2)
      );
      const paymentTotal = Number(Number(payment.amount_total).toFixed(2));

      if (allocatedTotal !== paymentTotal) {
        throw new Error("Payment received must be fully allocated before posting");
      }

      const customer = await this.queryOne(
        conn,
        `SELECT receivable_account_id FROM customers WHERE id = ? AND company_id = ?`,
        [payment.customer_id, companyId]
      );
      if (!customer) {
        throw new Error("Customer for payment not found");
      }

      const arAccountId = customer.receivable_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.ar);

      const postingDate = entryDate || payment.payment_date;
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postingDate);

      const journalLines = [
        {
          accountId: payment.cash_account_id,
          debit: paymentTotal,
          credit: 0,
          description: `Cash received payment ${payment.payment_number}`,
          customerId: payment.customer_id
        },
        {
          accountId: arAccountId,
          debit: 0,
          credit: paymentTotal,
          description: `AR settlement payment ${payment.payment_number}`,
          customerId: payment.customer_id
        }
      ];

      const entry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postingDate,
        sourceType: "payment",
        sourceId: payment.id,
        memo: memo || `Posting inbound payment ${payment.payment_number}`,
        createdByUserId: actorUserId,
        lines: journalLines
      });

      await conn.execute(
        `UPDATE payments
            SET posted_journal_entry_id = ?,
                unapplied_amount = 0.00,
                status = 'posted',
                updated_at = NOW()
          WHERE id = ?`,
        [entry.id, payment.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "payment",
        entityId: payment.id,
        actionType: "post",
        reason: "Inbound payment posted",
        beforeState: { posted_journal_entry_id: null, status: payment.status },
        afterState: { posted_journal_entry_id: entry.id, status: "posted" },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return entry;
    });
  }

  async postPaymentMade(params) {
    const { companyId, paymentId, actorUserId, entryDate = null, memo = null, requestMeta = {} } = params;

    return this.withTransaction(async (conn) => {
      const { payment, allocations } = await this.getPaymentContext(conn, companyId, paymentId);

      if (payment.direction !== "outbound") {
        throw new Error("Payment direction must be outbound for payment made posting");
      }
      if (payment.counterparty_type !== "vendor" || !payment.vendor_id) {
        throw new Error("Outbound payment must be linked to a vendor");
      }

      const allocatedTotal = Number(
        allocations.reduce((sum, row) => sum + Number(row.allocated_amount || 0), 0).toFixed(2)
      );
      const paymentTotal = Number(Number(payment.amount_total).toFixed(2));

      if (allocatedTotal !== paymentTotal) {
        throw new Error("Payment made must be fully allocated before posting");
      }

      const vendor = await this.queryOne(
        conn,
        `SELECT payable_account_id FROM vendors WHERE id = ? AND company_id = ?`,
        [payment.vendor_id, companyId]
      );
      if (!vendor) {
        throw new Error("Vendor for payment not found");
      }

      const apAccountId = vendor.payable_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.ap);

      const postingDate = entryDate || payment.payment_date;
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postingDate);

      const journalLines = [
        {
          accountId: apAccountId,
          debit: paymentTotal,
          credit: 0,
          description: `AP settlement payment ${payment.payment_number}`,
          vendorId: payment.vendor_id
        },
        {
          accountId: payment.cash_account_id,
          debit: 0,
          credit: paymentTotal,
          description: `Cash paid payment ${payment.payment_number}`,
          vendorId: payment.vendor_id
        }
      ];

      const entry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postingDate,
        sourceType: "payment",
        sourceId: payment.id,
        memo: memo || `Posting outbound payment ${payment.payment_number}`,
        createdByUserId: actorUserId,
        lines: journalLines
      });

      await conn.execute(
        `UPDATE payments
            SET posted_journal_entry_id = ?,
                unapplied_amount = 0.00,
                status = 'posted',
                updated_at = NOW()
          WHERE id = ?`,
        [entry.id, payment.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "payment",
        entityId: payment.id,
        actionType: "post",
        reason: "Outbound payment posted",
        beforeState: { posted_journal_entry_id: null, status: payment.status },
        afterState: { posted_journal_entry_id: entry.id, status: "posted" },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return entry;
    });
  }

  async postInventoryMovement(params) {
    const { companyId, stockMovementId, actorUserId, entryDate = null, memo = null, requestMeta = {} } = params;

    return this.withTransaction(async (conn) => {
      const movement = await this.queryOne(
        conn,
        `SELECT sm.*, i.inventory_account_id, i.cogs_account_id
           FROM stock_movements sm
           JOIN items i ON i.id = sm.item_id
          WHERE sm.id = ?
            AND sm.company_id = ?
          FOR UPDATE`,
        [stockMovementId, companyId]
      );

      if (!movement) {
        throw new Error("Stock movement not found");
      }
      if (movement.journal_entry_id) {
        throw new Error("Stock movement already linked to journal entry");
      }

      const totalCost = Number(movement.total_cost || 0);
      if (totalCost <= 0) {
        throw new Error("Stock movement requires positive total_cost for posting");
      }

      const inventoryAccountId = movement.inventory_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.inventory);
      const cogsAccountId = movement.cogs_account_id ||
        await this.resolveAccountIdByCode(conn, companyId, this.defaultAccountCodes.cogs);

      const postingDate = entryDate || String(movement.movement_date).slice(0, 10);
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postingDate);

      let journalLines;

      if (movement.movement_type === "sale_issue") {
        journalLines = [
          {
            accountId: cogsAccountId,
            debit: totalCost,
            credit: 0,
            description: `COGS for stock movement ${movement.id}`,
            itemId: movement.item_id
          },
          {
            accountId: inventoryAccountId,
            debit: 0,
            credit: totalCost,
            description: `Inventory reduction for stock movement ${movement.id}`,
            itemId: movement.item_id
          }
        ];
      } else if (movement.movement_type === "sales_return") {
        journalLines = [
          {
            accountId: inventoryAccountId,
            debit: totalCost,
            credit: 0,
            description: `Inventory increase for sales return ${movement.id}`,
            itemId: movement.item_id
          },
          {
            accountId: cogsAccountId,
            debit: 0,
            credit: totalCost,
            description: `COGS reversal for sales return ${movement.id}`,
            itemId: movement.item_id
          }
        ];
      } else if (movement.movement_type === "adjustment_out" || movement.movement_type === "adjustment_in") {
        if (movement.movement_type === "adjustment_out" || Number(movement.quantity_delta) < 0) {
          const adjExpenseAccountId = await this.resolveAccountIdByCode(
            conn,
            companyId,
            this.defaultAccountCodes.inventoryAdjustmentExpense
          );
          journalLines = [
            {
              accountId: adjExpenseAccountId,
              debit: totalCost,
              credit: 0,
              description: `Inventory shrinkage adjustment ${movement.id}`,
              itemId: movement.item_id
            },
            {
              accountId: inventoryAccountId,
              debit: 0,
              credit: totalCost,
              description: `Inventory write-down adjustment ${movement.id}`,
              itemId: movement.item_id
            }
          ];
        } else {
          const adjGainAccountId = await this.resolveAccountIdByCode(
            conn,
            companyId,
            this.defaultAccountCodes.inventoryAdjustmentGain
          );
          journalLines = [
            {
              accountId: inventoryAccountId,
              debit: totalCost,
              credit: 0,
              description: `Inventory gain adjustment ${movement.id}`,
              itemId: movement.item_id
            },
            {
              accountId: adjGainAccountId,
              debit: 0,
              credit: totalCost,
              description: `Inventory gain recognition ${movement.id}`,
              itemId: movement.item_id
            }
          ];
        }
      } else {
        throw new Error(`Unsupported movement_type for journal posting: ${movement.movement_type}`);
      }

      const entry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postingDate,
        sourceType: "stock_movement",
        sourceId: movement.id,
        memo: memo || `Posting stock movement ${movement.id}`,
        createdByUserId: actorUserId,
        lines: journalLines
      });

      await conn.execute(
        `UPDATE stock_movements
            SET journal_entry_id = ?
          WHERE id = ?`,
        [entry.id, movement.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "stock_movement",
        entityId: movement.id,
        actionType: "post",
        reason: `Inventory movement posted (${movement.movement_type})`,
        beforeState: { journal_entry_id: null },
        afterState: { journal_entry_id: entry.id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return entry;
    });
  }

  async reverseJournalEntry(params) {
    const {
      companyId,
      journalEntryId,
      actorUserId,
      reversalDate,
      reason,
      requestMeta = {}
    } = params;

    if (!reason) {
      throw new Error("Reversal requires a reason");
    }

    return this.withTransaction(async (conn) => {
      const original = await this.queryOne(
        conn,
        `SELECT *
           FROM journal_entries
          WHERE id = ?
            AND company_id = ?
          FOR UPDATE`,
        [journalEntryId, companyId]
      );

      if (!original) {
        throw new Error("Journal entry not found");
      }
      if (original.posting_status !== "posted") {
        throw new Error("Only posted entries can be reversed");
      }
      if (original.reversed_entry_id) {
        throw new Error("Journal entry already reversed");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT * FROM journal_lines WHERE journal_entry_id = ? ORDER BY line_no ASC`,
        [journalEntryId]
      );

      if (!lines.length) {
        throw new Error("Cannot reverse entry with no lines");
      }

      const postDate = reversalDate || new Date().toISOString().slice(0, 10);
      const fiscalPeriodId = await this.getOpenFiscalPeriodId(conn, companyId, postDate);

      const reversalLines = lines.map((line) => ({
        accountId: line.account_id,
        debit: Number(line.credit_amount),
        credit: Number(line.debit_amount),
        description: `Reversal of JE ${original.entry_number} line ${line.line_no}`,
        customerId: line.customer_id,
        vendorId: line.vendor_id,
        itemId: line.item_id,
        taxCodeId: line.tax_code_id
      }));

      const reversalEntry = await this.createAndPostJournalEntry(conn, {
        companyId,
        fiscalPeriodId,
        entryDate: postDate,
        sourceType: "adjustment",
        sourceId: original.id,
        memo: `Reversal of ${original.entry_number}: ${reason}`,
        createdByUserId: actorUserId,
        lines: reversalLines
      });

      await conn.execute(
        `UPDATE journal_entries
            SET posting_status = 'reversed',
                reversed_entry_id = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [reversalEntry.id, original.id]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "journal_entry",
        entityId: original.id,
        actionType: "reverse",
        reason,
        beforeState: { posting_status: original.posting_status, reversed_entry_id: original.reversed_entry_id },
        afterState: { posting_status: "reversed", reversed_entry_id: reversalEntry.id },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null
      });

      return {
        originalEntryId: original.id,
        reversalEntryId: reversalEntry.id,
        reversalEntryNumber: reversalEntry.entry_number
      };
    });
  }
}

module.exports = {
  AccountingEngine
};
