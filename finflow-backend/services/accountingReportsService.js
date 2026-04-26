"use strict";

const { DEFAULT_ACCOUNT_CODES } = require("./chartOfAccountsService");

// TODO(accounting-refactor): report outputs are accounting-ledger based, but
// this service still carries compatibility heuristics such as table existence
// checks and account-code inference for partially migrated data. Remove those
// fallbacks after chart-of-accounts and document migrations are complete.
class AccountingReportsService {
  constructor(db, options = {}) {
    if (!db) throw new Error("AccountingReportsService requires a mysql connection");
    this.db = db;
    this.counterpartyService = options.counterpartyService || null;
    this.pool = options.pool || this.counterpartyService?.pool || null;
    this._tableExistsCache = new Map();
    this._companyScopeCache = new Map();
  }

  q(sql, params = []) {
    if (this.pool) {
      return this.pool.execute(sql, params).then(([rows]) => rows);
    }
    return new Promise((resolve, reject) => {
      this.db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
      });
    });
  }

  r2(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  qty(value) {
    return Number(Number(value || 0).toFixed(4));
  }

  dateRange(startDate, endDate) {
    const end = endDate || new Date().toISOString().slice(0, 10);
    const start = startDate || "1970-01-01";
    return { start, end };
  }

  moneyDiffByNormalBalance(row) {
    const debit = this.r2(row.debit_total);
    const credit = this.r2(row.credit_total);
    const normalBalance = row.normal_balance || (["asset", "expense"].includes(row.account_type) ? "debit" : "credit");
    return normalBalance === "debit" ? this.r2(debit - credit) : this.r2(credit - debit);
  }

  bucketByDays(days) {
    if (days <= 0) return "current";
    if (days <= 30) return "days_1_30";
    if (days <= 60) return "days_31_60";
    if (days <= 90) return "days_61_90";
    return "days_91_plus";
  }

  counterpartyRef(primaryId, secondaryId, legacyName = null) {
    if (primaryId) return String(primaryId);
    if (secondaryId) return String(secondaryId);
    const normalizedName = this.normalizeLegacyName(legacyName);
    return normalizedName ? `legacy:${normalizedName.toLowerCase()}` : "__unassigned__";
  }

  normalizeLegacyName(value) {
    return String(value || "").trim();
  }

  buildLegacyDisplayMetadata(counterpartyId, legacyName) {
    return {
      legacy_name_derived: !counterpartyId && !!this.normalizeLegacyName(legacyName),
      counterparty_name_source: counterpartyId ? "document_snapshot" : "legacy_name_fallback",
    };
  }

  normalizeStatement(lines, direction) {
    const sorted = [...lines].sort((a, b) => {
      const dateCompare = String(a.document_date).localeCompare(String(b.document_date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.document_no || "").localeCompare(String(b.document_no || ""));
    });

    let running_balance = 0;
    return sorted.map((row) => {
      running_balance = direction === "customer"
        ? this.r2(running_balance + row.debit_amount - row.credit_amount)
        : this.r2(running_balance + row.credit_amount - row.debit_amount);

      return {
        ...row,
        running_balance,
      };
    });
  }

  async tableExists(tableName) {
    if (this._tableExistsCache.has(tableName)) {
      return this._tableExistsCache.get(tableName);
    }

    const rows = await this.q(
      `SELECT COUNT(*) AS count_rows
         FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?`,
      [tableName]
    ).catch(() => [{ count_rows: 0 }]);

    const exists = Number(rows[0]?.count_rows || 0) > 0;
    this._tableExistsCache.set(tableName, exists);
    return exists;
  }

  async resolveCompanyId(scopeId) {
    if (!scopeId) {
      throw new Error("companyId is required for reporting");
    }

    if (this._companyScopeCache.has(scopeId)) {
      return this._companyScopeCache.get(scopeId);
    }

    const directCompany = await this.q(
      `SELECT id
         FROM companies
        WHERE id = ?
        LIMIT 1`,
      [scopeId]
    ).catch(() => []);

    if (directCompany[0]?.id) {
      this._companyScopeCache.set(scopeId, directCompany[0].id);
      return directCompany[0].id;
    }

    if (!this.counterpartyService) {
      this._companyScopeCache.set(scopeId, scopeId);
      return scopeId;
    }

    let resolvedCompanyId;
    try {
      resolvedCompanyId = await this.counterpartyService.resolveCompanyId(null, scopeId);
    } catch (_error) {
      // Transitional compatibility for older seeded/profile-scoped datasets.
      resolvedCompanyId = scopeId;
    }
    this._companyScopeCache.set(scopeId, resolvedCompanyId);
    return resolvedCompanyId;
  }

  async getJournalBalances(scopeId, { startDate = null, endDate = null, asOfDate = null, accountTypes = null } = {}) {
    const companyId = await this.resolveCompanyId(scopeId);
    const params = [companyId];
    let datePredicate = "";

    if (startDate && endDate) {
      datePredicate = "AND je.entry_date BETWEEN ? AND ?";
      params.push(startDate, endDate);
    } else if (asOfDate) {
      datePredicate = "AND je.entry_date <= ?";
      params.push(asOfDate);
    }

    const typePredicate = Array.isArray(accountTypes) && accountTypes.length
      ? `AND COALESCE(coa.account_type,
            CASE
              WHEN jl.account_code LIKE '1%' THEN 'asset'
              WHEN jl.account_code LIKE '2%' THEN 'liability'
              WHEN jl.account_code LIKE '3%' THEN 'equity'
              WHEN jl.account_code LIKE '4%' THEN 'income'
              WHEN jl.account_code LIKE '5%' THEN 'expense'
              ELSE NULL
            END
          ) IN (${accountTypes.map(() => "?").join(", ")})`
      : "";

    if (Array.isArray(accountTypes) && accountTypes.length) {
      params.push(...accountTypes);
    }

    const rows = await this.q(
      `SELECT
          COALESCE(coa.id, jl.account_id, jl.account_code) AS account_ref,
          COALESCE(coa.account_code, jl.account_code) AS account_code,
          COALESCE(coa.account_name, jl.account_code, 'Unmapped Account') AS account_name,
          COALESCE(
            coa.account_type,
            CASE
              WHEN jl.account_code LIKE '1%' THEN 'asset'
              WHEN jl.account_code LIKE '2%' THEN 'liability'
              WHEN jl.account_code LIKE '3%' THEN 'equity'
              WHEN jl.account_code LIKE '4%' THEN 'income'
              WHEN jl.account_code LIKE '5%' THEN 'expense'
              ELSE 'unclassified'
            END
          ) AS account_type,
          COALESCE(
            coa.normal_balance,
            CASE
              WHEN COALESCE(coa.account_type,
                CASE
                  WHEN jl.account_code LIKE '1%' THEN 'asset'
                  WHEN jl.account_code LIKE '5%' THEN 'expense'
                  ELSE 'credit'
                END
              ) IN ('asset','expense') THEN 'debit'
              ELSE 'credit'
            END
          ) AS normal_balance,
          COALESCE(SUM(COALESCE(jl.debit_amount, jl.debit, 0)), 0) AS debit_total,
          COALESCE(SUM(COALESCE(jl.credit_amount, jl.credit, 0)), 0) AS credit_total
       FROM journal_entries je
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       LEFT JOIN chart_of_accounts coa ON coa.id = jl.account_id
       WHERE je.company_id = ?
         AND COALESCE(je.posting_status, je.status) = 'posted'
         ${datePredicate}
         ${typePredicate}
       GROUP BY account_ref, account_code, account_name, account_type, normal_balance
       ORDER BY account_code ASC`,
      params
    );

    return rows.map((row) => ({
      ...row,
      debit_total: this.r2(row.debit_total),
      credit_total: this.r2(row.credit_total),
      closing_balance: this.moneyDiffByNormalBalance(row),
    }));
  }

  async getControlAccountBalance(scopeId, accountCode, asOfDate = null) {
    const balances = await this.getJournalBalances(scopeId, { asOfDate });
    const row = balances.find((entry) => entry.account_code === accountCode);
    return {
      account_code: accountCode,
      account_name: row?.account_name || accountCode,
      gl_balance: this.r2(row?.closing_balance || 0),
      account_type: row?.account_type || null,
    };
  }

  buildReconciliationPayload(reportType, asOfDate, controlAccount, subledgerBalance, details = {}, assumptions = []) {
    const glBalance = this.r2(controlAccount.gl_balance);
    const subledger = this.r2(subledgerBalance);
    const variance = this.r2(glBalance - subledger);

    return {
      report_type: reportType,
      report_date: asOfDate,
      gl_account: {
        account_code: controlAccount.account_code,
        account_name: controlAccount.account_name,
        gl_balance: glBalance,
      },
      subledger_balance: subledger,
      variance,
      is_reconciled: variance === 0,
      details,
      assumptions,
    };
  }

  async getTaxSubledgerTotals(scopeId, asOfDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const rows = await this.q(
      `SELECT
          tax_direction,
          tax_code_id,
          COALESCE(SUM(taxable_amount), 0) AS taxable_amount,
          COALESCE(SUM(tax_amount), 0) AS tax_amount
       FROM tax_transactions
       WHERE company_id = ?
         AND transaction_date <= ?
       GROUP BY tax_direction, tax_code_id
       ORDER BY tax_direction ASC, tax_code_id ASC`,
      [companyId, asOfDate]
    ).catch(() => []);

    const input_lines = [];
    const output_lines = [];
    let input_total = 0;
    let output_total = 0;

    for (const row of rows) {
      const normalized = {
        tax_direction: row.tax_direction,
        tax_code_id: row.tax_code_id,
        taxable_amount: this.r2(row.taxable_amount),
        tax_amount: this.r2(Math.abs(row.tax_amount)),
      };

      if (row.tax_direction === "input") {
        input_total = this.r2(input_total + normalized.tax_amount);
        input_lines.push(normalized);
      } else if (row.tax_direction === "output") {
        output_total = this.r2(output_total + normalized.tax_amount);
        output_lines.push(normalized);
      }
    }

    return {
      input_total,
      output_total,
      input_lines,
      output_lines,
    };
  }

  async getAdvanceSubledgerTotals(scopeId, asOfDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const rows = await this.q(
      `SELECT
          type,
          COALESCE(counterparty_id, customer_id, vendor_id) AS counterparty_id,
          counterparty_name,
          COALESCE(SUM(unapplied_amount), 0) AS unapplied_amount
       FROM payments
       WHERE company_id = ?
         AND status = 'posted'
         AND payment_date <= ?
         AND COALESCE(unapplied_amount, 0) != 0
       GROUP BY type, COALESCE(counterparty_id, customer_id, vendor_id), counterparty_name
       ORDER BY type ASC, counterparty_name ASC`,
      [companyId, asOfDate]
    ).catch(() => []);

    const customer_advances = [];
    const vendor_prepayments = [];
    let customer_total = 0;
    let vendor_total = 0;

    for (const row of rows) {
      const line = {
        counterparty_id: row.counterparty_id || null,
        counterparty_name: row.counterparty_name || null,
        unapplied_amount: this.r2(row.unapplied_amount),
      };

      if (row.type === "incoming") {
        customer_total = this.r2(customer_total + line.unapplied_amount);
        customer_advances.push(line);
      } else if (row.type === "outgoing") {
        vendor_total = this.r2(vendor_total + line.unapplied_amount);
        vendor_prepayments.push(line);
      }
    }

    return {
      customer_total,
      vendor_total,
      customer_advances,
      vendor_prepayments,
    };
  }

  async getGrniSubledgerTotals(scopeId, asOfDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const rows = await this.q(
      `SELECT
          grl.id AS goods_receipt_line_id,
          grl.goods_receipt_id,
          grh.receipt_no,
          grh.receipt_date,
          grl.item_id,
          grl.description,
          grl.received_quantity,
          grl.unit_cost,
          COALESCE(SUM(
            CASE
              WHEN pbh.status IN ('posted','partially_paid','paid','overdue')
              THEN pbl.quantity
              ELSE 0
            END
          ), 0) AS billed_quantity
       FROM goods_receipt_lines grl
       JOIN goods_receipt_headers grh ON grh.id = grl.goods_receipt_id
       LEFT JOIN purchase_bill_lines pbl ON pbl.goods_receipt_line_id = grl.id
       LEFT JOIN purchase_bill_headers pbh
         ON pbh.id = pbl.purchase_bill_id
        AND pbh.company_id = grh.company_id
       WHERE grh.company_id = ?
         AND grh.status = 'posted'
         AND grh.receipt_date <= ?
       GROUP BY
         grl.id,
         grl.goods_receipt_id,
         grh.receipt_no,
         grh.receipt_date,
         grl.item_id,
         grl.description,
         grl.received_quantity,
         grl.unit_cost
       ORDER BY grh.receipt_date ASC, grh.receipt_no ASC, grl.id ASC`,
      [companyId, asOfDate]
    ).catch(() => []);

    const lines = [];
    let total = 0;

    for (const row of rows) {
      const received_quantity = this.qty(row.received_quantity);
      const billed_quantity = this.qty(row.billed_quantity);
      const outstanding_quantity = this.qty(received_quantity - billed_quantity);
      if (outstanding_quantity <= 0) {
        continue;
      }

      const unit_cost = this.r2(row.unit_cost);
      const outstanding_amount = this.r2(outstanding_quantity * unit_cost);
      total = this.r2(total + outstanding_amount);
      lines.push({
        goods_receipt_id: row.goods_receipt_id,
        goods_receipt_line_id: row.goods_receipt_line_id,
        receipt_no: row.receipt_no,
        receipt_date: row.receipt_date,
        item_id: row.item_id || null,
        description: row.description || null,
        received_quantity,
        billed_quantity,
        outstanding_quantity,
        unit_cost,
        outstanding_amount,
      });
    }

    return {
      total,
      lines,
    };
  }

  async trialBalance(scopeId, startDate, endDate) {
    const { start, end } = this.dateRange(startDate, endDate);
    const rows = await this.getJournalBalances(scopeId, { startDate: start, endDate: end });

    const lines = rows.map((row) => ({
      account_ref: row.account_ref,
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      normal_balance: row.normal_balance,
      debit_total: row.debit_total,
      credit_total: row.credit_total,
      closing_balance: row.closing_balance,
      closing_side: row.normal_balance,
      closing_amount: this.r2(Math.abs(row.closing_balance)),
    }));

    const total_debits = this.r2(lines.reduce((sum, line) => sum + line.debit_total, 0));
    const total_credits = this.r2(lines.reduce((sum, line) => sum + line.credit_total, 0));
    const difference = this.r2(total_debits - total_credits);

    return {
      period: { start_date: start, end_date: end },
      lines,
      totals: {
        total_debits,
        total_credits,
      },
      validation: {
        journal_balanced: difference === 0,
        difference,
      },
    };
  }

  async profitAndLoss(scopeId, startDate, endDate) {
    const { start, end } = this.dateRange(startDate, endDate);
    const rows = await this.getJournalBalances(scopeId, {
      startDate: start,
      endDate: end,
      accountTypes: ["income", "expense"],
    });

    const income_lines = rows
      .filter((row) => row.account_type === "income")
      .map((row) => ({
        account_ref: row.account_ref,
        account_code: row.account_code,
        account_name: row.account_name,
        amount: this.r2(row.credit_total - row.debit_total),
      }));

    const expense_lines = rows
      .filter((row) => row.account_type === "expense")
      .map((row) => ({
        account_ref: row.account_ref,
        account_code: row.account_code,
        account_name: row.account_name,
        amount: this.r2(row.debit_total - row.credit_total),
      }));

    const total_income = this.r2(income_lines.reduce((sum, row) => sum + row.amount, 0));
    const total_expenses = this.r2(expense_lines.reduce((sum, row) => sum + row.amount, 0));
    const net_profit = this.r2(total_income - total_expenses);

    return {
      period: { start_date: start, end_date: end },
      income_lines,
      expense_lines,
      totals: {
        total_income,
        total_expenses,
        net_profit,
      },
      validation: {
        income_minus_expenses_equals_net_profit: this.r2(total_income - total_expenses - net_profit) === 0,
      },
    };
  }

  async balanceSheet(scopeId, asOfDate) {
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const rows = await this.getJournalBalances(scopeId, { asOfDate: as_of_date });

    const assets = [];
    const liabilities = [];
    const equity = [];
    const income = [];
    const expenses = [];

    for (const row of rows) {
      const amount = this.r2(Math.abs(row.closing_balance));
      const entry = {
        account_ref: row.account_ref,
        account_code: row.account_code,
        account_name: row.account_name,
        amount,
      };

      if (row.account_type === "asset") assets.push(entry);
      else if (row.account_type === "liability") liabilities.push(entry);
      else if (row.account_type === "equity") equity.push(entry);
      else if (row.account_type === "income") income.push(entry);
      else if (row.account_type === "expense") expenses.push(entry);
    }

    const total_assets = this.r2(assets.reduce((sum, row) => sum + row.amount, 0));
    const total_liabilities = this.r2(liabilities.reduce((sum, row) => sum + row.amount, 0));
    const contributed_equity = this.r2(equity.reduce((sum, row) => sum + row.amount, 0));
    const current_earnings = this.r2(
      income.reduce((sum, row) => sum + row.amount, 0) - expenses.reduce((sum, row) => sum + row.amount, 0)
    );
    const total_equity = this.r2(contributed_equity + current_earnings);
    const equation_gap = this.r2(total_assets - (total_liabilities + total_equity));

    return {
      as_of_date,
      assets,
      liabilities,
      equity,
      current_earnings,
      totals: {
        total_assets,
        total_liabilities,
        total_equity,
      },
      validation: {
        accounting_equation_holds: equation_gap === 0,
        equation_gap,
      },
    };
  }

  buildAgingPayload(lines, as_of_date, report_type) {
    const buckets = {
      current: 0,
      days_1_30: 0,
      days_31_60: 0,
      days_61_90: 0,
      days_91_plus: 0,
      total: 0,
    };

    for (const row of lines) {
      const amount = this.r2(row.outstanding_amount);
      const bucketName = this.bucketByDays(Number(row.days_overdue || 0));
      buckets[bucketName] = this.r2(buckets[bucketName] + amount);
      buckets.total = this.r2(buckets.total + amount);
    }

    return {
      report_type,
      as_of_date,
      buckets,
      lines,
      validation: {
        bucket_total_matches_lines: this.r2(buckets.total - lines.reduce((s, row) => s + this.r2(row.outstanding_amount), 0)) === 0,
      },
    };
  }

  async getSalesCreditAdjustments(scopeId, as_of_date) {
    const companyId = await this.resolveCompanyId(scopeId);
    const hasCreditNotes = await this.tableExists("sales_credit_note_headers");
    if (!hasCreditNotes) {
      return [];
    }

    return this.q(
      `SELECT
          cn.id AS document_id,
          cn.related_sales_invoice_id,
          COALESCE(cn.counterparty_id, cn.customer_id) AS counterparty_id,
          cn.customer_id,
          cn.customer_name,
          cn.credit_note_number AS document_no,
          cn.credit_note_date AS document_date,
          cn.total_amount
       FROM sales_credit_note_headers cn
       WHERE cn.company_id = ?
         AND cn.status = 'posted'
         AND cn.credit_note_date <= ?`,
      [companyId, as_of_date]
    ).catch(() => []);
  }

  async getPurchaseDebitAdjustments(scopeId, as_of_date) {
    const companyId = await this.resolveCompanyId(scopeId);
    const hasDebitNotes = await this.tableExists("purchase_debit_note_headers");
    if (!hasDebitNotes) {
      return [];
    }

    return this.q(
      `SELECT
          dn.id AS document_id,
          dn.related_purchase_bill_id,
          COALESCE(dn.counterparty_id, dn.vendor_id) AS counterparty_id,
          dn.vendor_id,
          dn.vendor_name,
          dn.debit_note_number AS document_no,
          dn.debit_note_date AS document_date,
          dn.total_amount
       FROM purchase_debit_note_headers dn
       WHERE dn.company_id = ?
         AND dn.status = 'posted'
         AND dn.debit_note_date <= ?`,
      [companyId, as_of_date]
    ).catch(() => []);
  }

  async arAging(scopeId, asOfDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const creditNotes = await this.getSalesCreditAdjustments(companyId, as_of_date);
    const creditByInvoice = creditNotes.reduce((map, row) => {
      if (!row.related_sales_invoice_id) return map;
      map.set(String(row.related_sales_invoice_id), this.r2((map.get(String(row.related_sales_invoice_id)) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());
    const unappliedCreditByCustomer = creditNotes.reduce((map, row) => {
      if (row.related_sales_invoice_id) return map;
      const key = this.counterpartyRef(row.counterparty_id, row.customer_id, row.customer_name);
      map.set(key, this.r2((map.get(key) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());

    const rows = await this.q(
      `SELECT
          si.id AS document_id,
          si.invoice_no AS document_no,
          COALESCE(si.counterparty_id, si.customer_id) AS counterparty_id,
          si.customer_id,
          si.customer_name,
          si.invoice_date AS document_date,
          si.due_date,
          si.total_amount AS document_amount,
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' AND p.payment_date <= ? THEN pa.allocated_amount ELSE 0 END), 0) AS applied_amount
       FROM sales_invoice_headers si
       LEFT JOIN payment_allocations pa ON pa.sales_invoice_id = si.id OR pa.invoice_id = si.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE (si.company_id = ? OR (si.company_id IS NULL AND si.user_id = ?))
         AND si.posted_journal_entry_id IS NOT NULL
         AND si.status != 'void'
         AND si.invoice_date <= ?
       GROUP BY si.id, si.invoice_no, COALESCE(si.counterparty_id, si.customer_id), si.customer_id, si.customer_name, si.invoice_date, si.due_date, si.total_amount
       ORDER BY si.due_date ASC, si.invoice_date ASC`,
      [as_of_date, companyId, scopeId, as_of_date]
    );

    const lines = rows
      .map((row) => {
        const counterpartyRef = this.counterpartyRef(row.counterparty_id, row.customer_id, row.customer_name);
        const relatedCreditNotes = this.r2(creditByInvoice.get(String(row.document_id)) || 0);
        const unappliedCustomerCredits = this.r2(unappliedCreditByCustomer.get(counterpartyRef) || 0);
        const document_amount = this.r2(row.document_amount);
        const applied_amount = this.r2(row.applied_amount);
        const outstanding_amount = this.r2(document_amount - applied_amount - relatedCreditNotes);
        return {
          document_id: row.document_id,
          document_no: row.document_no,
          counterparty_id: row.counterparty_id || row.customer_id || null,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          counterparty_ref: counterpartyRef,
          document_date: row.document_date,
          due_date: row.due_date,
          document_amount,
          credit_note_adjustments_for_document: relatedCreditNotes,
          unapplied_credit_note_adjustments_for_customer: unappliedCustomerCredits,
          applied_amount,
          outstanding_amount: outstanding_amount < 0 ? 0 : outstanding_amount,
          days_overdue: Math.max(0, Math.floor((new Date(as_of_date).getTime() - new Date(row.due_date).getTime()) / 86400000)),
          ...this.buildLegacyDisplayMetadata(row.counterparty_id || row.customer_id || null, row.customer_name),
        };
      })
      .filter((row) => row.outstanding_amount > 0);

    return this.buildAgingPayload(lines, as_of_date, "ar_aging");
  }

  async apAging(scopeId, asOfDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const debitNotes = await this.getPurchaseDebitAdjustments(companyId, as_of_date);
    const debitByBill = debitNotes.reduce((map, row) => {
      if (!row.related_purchase_bill_id) return map;
      map.set(String(row.related_purchase_bill_id), this.r2((map.get(String(row.related_purchase_bill_id)) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());
    const unappliedDebitByVendor = debitNotes.reduce((map, row) => {
      if (row.related_purchase_bill_id) return map;
      const key = this.counterpartyRef(row.counterparty_id, row.vendor_id, row.vendor_name);
      map.set(key, this.r2((map.get(key) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());

    const rows = await this.q(
      `SELECT
          pb.id AS document_id,
          pb.bill_no AS document_no,
          COALESCE(pb.counterparty_id, pb.vendor_id) AS counterparty_id,
          pb.vendor_id,
          pb.vendor_name,
          pb.bill_date AS document_date,
          pb.due_date,
          pb.total_amount AS document_amount,
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' AND p.payment_date <= ? THEN pa.allocated_amount ELSE 0 END), 0) AS applied_amount
       FROM purchase_bill_headers pb
       LEFT JOIN payment_allocations pa ON pa.purchase_bill_id = pb.id OR pa.purchase_id = pb.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE (pb.company_id = ? OR (pb.company_id IS NULL AND pb.user_id = ?))
         AND pb.posted_journal_entry_id IS NOT NULL
         AND pb.status != 'void'
         AND pb.bill_date <= ?
       GROUP BY pb.id, pb.bill_no, COALESCE(pb.counterparty_id, pb.vendor_id), pb.vendor_id, pb.vendor_name, pb.bill_date, pb.due_date, pb.total_amount
       ORDER BY pb.due_date ASC, pb.bill_date ASC`,
      [as_of_date, companyId, scopeId, as_of_date]
    );

    const lines = rows
      .map((row) => {
        const counterpartyRef = this.counterpartyRef(row.counterparty_id, row.vendor_id, row.vendor_name);
        const relatedDebitNotes = this.r2(debitByBill.get(String(row.document_id)) || 0);
        const unappliedVendorDebits = this.r2(unappliedDebitByVendor.get(counterpartyRef) || 0);
        const document_amount = this.r2(row.document_amount);
        const applied_amount = this.r2(row.applied_amount);
        const outstanding_amount = this.r2(document_amount - applied_amount - relatedDebitNotes);
        return {
          document_id: row.document_id,
          document_no: row.document_no,
          counterparty_id: row.counterparty_id || row.vendor_id || null,
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          counterparty_ref: counterpartyRef,
          document_date: row.document_date,
          due_date: row.due_date,
          document_amount,
          debit_note_adjustments_for_document: relatedDebitNotes,
          unapplied_debit_note_adjustments_for_vendor: unappliedVendorDebits,
          applied_amount,
          outstanding_amount: outstanding_amount < 0 ? 0 : outstanding_amount,
          days_overdue: Math.max(0, Math.floor((new Date(as_of_date).getTime() - new Date(row.due_date).getTime()) / 86400000)),
          ...this.buildLegacyDisplayMetadata(row.counterparty_id || row.vendor_id || null, row.vendor_name),
        };
      })
      .filter((row) => row.outstanding_amount > 0);

    return this.buildAgingPayload(lines, as_of_date, "ap_aging");
  }

  async customerStatement(scopeId, customerId, startDate, endDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const { start, end } = this.dateRange(startDate, endDate);
    const hasCreditNotes = await this.tableExists("sales_credit_note_headers");

    const invoices = await this.q(
      `SELECT
          id AS document_id,
          invoice_no AS document_no,
          invoice_date AS document_date,
          due_date,
          total_amount AS amount,
          notes
       FROM sales_invoice_headers
       WHERE (company_id = ? OR (company_id IS NULL AND user_id = ?))
         AND COALESCE(counterparty_id, customer_id) = ?
         AND posted_journal_entry_id IS NOT NULL
         AND status != 'void'
         AND invoice_date BETWEEN ? AND ?`,
      [companyId, scopeId, customerId, start, end]
    );

    const payments = await this.q(
      `SELECT
          p.id AS document_id,
          p.payment_number AS document_no,
          p.payment_date AS document_date,
          NULL AS due_date,
          COALESCE(SUM(pa.allocated_amount), 0) AS amount,
          p.notes
       FROM payments p
       LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
       WHERE p.company_id = ?
         AND COALESCE(p.counterparty_id, p.customer_id) = ?
         AND p.type = 'incoming'
         AND p.status = 'posted'
         AND p.payment_date BETWEEN ? AND ?
       GROUP BY p.id, p.payment_number, p.payment_date, p.notes`,
      [companyId, customerId, start, end]
    );

    const creditNotes = hasCreditNotes
      ? await this.q(
        `SELECT
            id AS document_id,
            credit_note_number AS document_no,
            credit_note_date AS document_date,
            NULL AS due_date,
            total_amount AS amount,
            reason AS notes
         FROM sales_credit_note_headers
         WHERE company_id = ?
           AND COALESCE(counterparty_id, customer_id) = ?
           AND status = 'posted'
           AND credit_note_date BETWEEN ? AND ?`,
        [companyId, customerId, start, end]
      ).catch(() => [])
      : [];

    const lines = [
      ...invoices.map((row) => ({
        ...row,
        entry_type: "invoice",
        counterparty_id: customerId,
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
      ...payments.map((row) => ({
        ...row,
        entry_type: "payment",
        counterparty_id: customerId,
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
      ...creditNotes.map((row) => ({
        ...row,
        entry_type: "credit_note",
        counterparty_id: customerId,
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
    ];
    const statement_lines = this.normalizeStatement(lines, "customer");
    const running_balance = statement_lines.at(-1)?.running_balance || 0;

    return {
      counterparty_id: customerId,
      customer_id: customerId,
      period: { start_date: start, end_date: end },
      lines: statement_lines,
      closing_balance: this.r2(running_balance),
      validation: {
        closing_balance_matches_lines: this.r2(running_balance - statement_lines.reduce((sum, row) => sum + row.debit_amount - row.credit_amount, 0)) === 0,
      },
    };
  }

  async vendorStatement(scopeId, vendorId, startDate, endDate) {
    const companyId = await this.resolveCompanyId(scopeId);
    const { start, end } = this.dateRange(startDate, endDate);
    const hasDebitNotes = await this.tableExists("purchase_debit_note_headers");

    const bills = await this.q(
      `SELECT
          id AS document_id,
          bill_no AS document_no,
          bill_date AS document_date,
          due_date,
          total_amount AS amount,
          notes
       FROM purchase_bill_headers
       WHERE (company_id = ? OR (company_id IS NULL AND user_id = ?))
         AND COALESCE(counterparty_id, vendor_id) = ?
         AND posted_journal_entry_id IS NOT NULL
         AND status != 'void'
         AND bill_date BETWEEN ? AND ?`,
      [companyId, scopeId, vendorId, start, end]
    );

    const payments = await this.q(
      `SELECT
          p.id AS document_id,
          p.payment_number AS document_no,
          p.payment_date AS document_date,
          NULL AS due_date,
          COALESCE(SUM(pa.allocated_amount), 0) AS amount,
          p.notes
       FROM payments p
       LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
       WHERE p.company_id = ?
         AND COALESCE(p.counterparty_id, p.vendor_id) = ?
         AND p.type = 'outgoing'
         AND p.status = 'posted'
         AND p.payment_date BETWEEN ? AND ?
       GROUP BY p.id, p.payment_number, p.payment_date, p.notes`,
      [companyId, vendorId, start, end]
    );

    const debitNotes = hasDebitNotes
      ? await this.q(
        `SELECT
            id AS document_id,
            debit_note_number AS document_no,
            debit_note_date AS document_date,
            NULL AS due_date,
            total_amount AS amount,
            reason AS notes
         FROM purchase_debit_note_headers
         WHERE company_id = ?
           AND COALESCE(counterparty_id, vendor_id) = ?
           AND status = 'posted'
           AND debit_note_date BETWEEN ? AND ?`,
        [companyId, vendorId, start, end]
      ).catch(() => [])
      : [];

    const lines = [
      ...bills.map((row) => ({
        ...row,
        entry_type: "bill",
        counterparty_id: vendorId,
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
      ...payments.map((row) => ({
        ...row,
        entry_type: "payment",
        counterparty_id: vendorId,
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
      ...debitNotes.map((row) => ({
        ...row,
        entry_type: "debit_note",
        counterparty_id: vendorId,
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
    ];
    const statement_lines = this.normalizeStatement(lines, "vendor");
    const running_balance = statement_lines.at(-1)?.running_balance || 0;

    return {
      counterparty_id: vendorId,
      vendor_id: vendorId,
      period: { start_date: start, end_date: end },
      lines: statement_lines,
      closing_balance: this.r2(running_balance),
      validation: {
        closing_balance_matches_lines: this.r2(running_balance - statement_lines.reduce((sum, row) => sum + row.credit_amount - row.debit_amount, 0)) === 0,
      },
    };
  }

  async stockSummary(scopeId, asOfDate = null) {
    const companyId = await this.resolveCompanyId(scopeId);
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const rows = await this.q(
      `SELECT
          sm.item_id,
          i.name AS item_name,
          i.sku,
          sm.warehouse_id,
          w.name AS warehouse_name,
          w.code AS warehouse_code,
          COALESCE(SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END), 0) AS qty_in,
          COALESCE(SUM(CASE WHEN sm.quantity_delta < 0 THEN ABS(sm.quantity_delta) ELSE 0 END), 0) AS qty_out,
          COALESCE(SUM(sm.quantity_delta), 0) AS on_hand_qty,
          COALESCE(SUM(
            CASE
              WHEN sm.quantity_delta >= 0 THEN COALESCE(sm.total_cost, sm.unit_cost * sm.quantity_delta, 0)
              ELSE -COALESCE(sm.total_cost, ABS(sm.unit_cost * sm.quantity_delta), 0)
            END
          ), 0) AS on_hand_value
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE sm.company_id = ?
         AND DATE(sm.created_at) <= ?
       GROUP BY sm.item_id, i.name, i.sku, sm.warehouse_id, w.name, w.code
       ORDER BY i.name ASC, w.name ASC`,
      [companyId, as_of_date]
    );

    const lines = rows.map((row) => ({
      ...row,
      qty_in: this.qty(row.qty_in),
      qty_out: this.qty(row.qty_out),
      on_hand_qty: this.qty(row.on_hand_qty),
      on_hand_value: this.r2(row.on_hand_value),
      average_unit_cost: this.qty(Number(row.on_hand_qty || 0) !== 0 ? Number(row.on_hand_value || 0) / Number(row.on_hand_qty || 0) : 0),
    }));

    return {
      as_of_date,
      lines,
      totals: {
        total_items: lines.length,
        total_on_hand_qty: this.qty(lines.reduce((sum, row) => sum + row.on_hand_qty, 0)),
        total_on_hand_value: this.r2(lines.reduce((sum, row) => sum + row.on_hand_value, 0)),
      },
      validation: {
        negative_stock_lines: lines.filter((row) => row.on_hand_qty < 0).map((row) => ({
          item_id: row.item_id,
          warehouse_id: row.warehouse_id,
          on_hand_qty: row.on_hand_qty,
        })),
      },
    };
  }

  async stockLedger(scopeId, itemId, warehouseId = null, startDate = null, endDate = null) {
    const companyId = await this.resolveCompanyId(scopeId);
    const { start, end } = this.dateRange(startDate, endDate);
    const params = [companyId, itemId, start, end];
    const warehousePredicate = warehouseId ? "AND sm.warehouse_id = ?" : "";
    if (warehouseId) {
      params.push(warehouseId);
    }

    const rows = await this.q(
      `SELECT
          sm.*,
          i.name AS item_name,
          i.sku,
          w.name AS warehouse_name,
          w.code AS warehouse_code
       FROM stock_movements sm
       JOIN items i ON i.id = sm.item_id
       JOIN warehouses w ON w.id = sm.warehouse_id
       WHERE sm.company_id = ?
         AND sm.item_id = ?
         AND DATE(sm.created_at) BETWEEN ? AND ?
         ${warehousePredicate}
       ORDER BY sm.created_at ASC, sm.id ASC`,
      params
    );

    let running_quantity = 0;
    let running_value = 0;
    const lines = rows.map((row) => {
      const qtyDelta = Number(row.quantity_delta || 0);
      const valueDelta = qtyDelta >= 0
        ? Number(row.total_cost || (Number(row.unit_cost || 0) * qtyDelta) || 0)
        : -Number(row.total_cost || Math.abs(Number(row.unit_cost || 0) * qtyDelta) || 0);

      running_quantity = this.qty(running_quantity + qtyDelta);
      running_value = this.r2(running_value + valueDelta);

      return {
        ...row,
        quantity_delta: this.qty(qtyDelta),
        unit_cost: this.qty(row.unit_cost),
        total_cost: this.r2(row.total_cost),
        running_quantity,
        running_value,
      };
    });

    return {
      item_id: itemId,
      warehouse_id: warehouseId,
      period: { start_date: start, end_date: end },
      lines,
      totals: {
        total_movements: lines.length,
        closing_quantity: this.qty(lines.length ? lines[lines.length - 1].running_quantity : 0),
        closing_value: this.r2(lines.length ? lines[lines.length - 1].running_value : 0),
      },
    };
  }

  async arControlReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [aging, controlAccount] = await Promise.all([
      this.arAging(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.accountsReceivable, report_date),
    ]);

    return this.buildReconciliationPayload(
      "ar_control_reconciliation",
      report_date,
      controlAccount,
      aging.buckets.total,
      {
        open_documents: aging.lines.length,
        aging_buckets: aging.buckets,
        sample_lines: aging.lines.slice(0, 20),
      },
      [
        "AR subledger is derived from posted sales invoices less posted allocations and linked posted sales credit notes.",
        "Legacy invoice compatibility fields may still exist, but this reconciliation prefers accounting document balances.",
      ]
    );
  }

  async apControlReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [aging, controlAccount] = await Promise.all([
      this.apAging(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.accountsPayable, report_date),
    ]);

    return this.buildReconciliationPayload(
      "ap_control_reconciliation",
      report_date,
      controlAccount,
      aging.buckets.total,
      {
        open_documents: aging.lines.length,
        aging_buckets: aging.buckets,
        sample_lines: aging.lines.slice(0, 20),
      },
      [
        "AP subledger is derived from posted purchase bills less posted allocations and linked posted purchase debit notes.",
        "Unapplied supplier advances are excluded here and reconciled separately against the vendor advances asset account.",
      ]
    );
  }

  async inventoryControlReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [stockSummary, controlAccount] = await Promise.all([
      this.stockSummary(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.inventory, report_date),
    ]);

    return this.buildReconciliationPayload(
      "inventory_control_reconciliation",
      report_date,
      controlAccount,
      stockSummary.totals.total_on_hand_value,
      {
        stock_summary_totals: stockSummary.totals,
        negative_stock_lines: stockSummary.validation.negative_stock_lines,
        sample_lines: stockSummary.lines.slice(0, 20),
      },
      [
        "Inventory subledger is derived from stock movements and weighted-average style movement valuation.",
        "Legacy inventory.stock_quantity is transitional display data only and is intentionally ignored here.",
      ]
    );
  }

  async taxControlReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [taxSubledger, outputControl, inputControl] = await Promise.all([
      this.getTaxSubledgerTotals(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.outputVatPayable, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.inputVat, report_date),
    ]);

    const output = this.buildReconciliationPayload(
      "output_tax_reconciliation",
      report_date,
      outputControl,
      taxSubledger.output_total,
      {
        tax_direction: "output",
        lines: taxSubledger.output_lines,
      },
      [
        "Output tax subledger is derived from tax_transactions for posted sales invoices and sales credit notes.",
      ]
    );

    const input = this.buildReconciliationPayload(
      "input_tax_reconciliation",
      report_date,
      inputControl,
      taxSubledger.input_total,
      {
        tax_direction: "input",
        lines: taxSubledger.input_lines,
      },
      [
        "Input tax subledger is derived from tax_transactions for posted purchase bills and purchase debit notes.",
      ]
    );

    return {
      report_type: "tax_control_reconciliation",
      report_date,
      output_tax: output,
      input_tax: input,
      validation: {
        fully_reconciled: output.is_reconciled && input.is_reconciled,
      },
    };
  }

  async advancesReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [advanceSubledger, customerAdvancesControl, vendorAdvancesControl] = await Promise.all([
      this.getAdvanceSubledgerTotals(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.customerAdvances, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.vendorAdvances, report_date),
    ]);

    const customer_advances = this.buildReconciliationPayload(
      "customer_advances_reconciliation",
      report_date,
      customerAdvancesControl,
      advanceSubledger.customer_total,
      {
        lines: advanceSubledger.customer_advances,
      },
      [
        "Customer advances are derived from posted incoming payments with unapplied balances.",
      ]
    );

    const vendor_prepayments = this.buildReconciliationPayload(
      "vendor_prepayments_reconciliation",
      report_date,
      vendorAdvancesControl,
      advanceSubledger.vendor_total,
      {
        lines: advanceSubledger.vendor_prepayments,
      },
      [
        "Vendor prepayments are derived from posted outgoing payments with unapplied balances.",
      ]
    );

    return {
      report_type: "advances_reconciliation",
      report_date,
      customer_advances,
      vendor_prepayments,
      validation: {
        fully_reconciled: customer_advances.is_reconciled && vendor_prepayments.is_reconciled,
      },
    };
  }

  async grniControlReconciliation(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [grniSubledger, controlAccount] = await Promise.all([
      this.getGrniSubledgerTotals(scopeId, report_date),
      this.getControlAccountBalance(scopeId, DEFAULT_ACCOUNT_CODES.goodsReceivedNotInvoiced, report_date),
    ]);

    return this.buildReconciliationPayload(
      "grni_control_reconciliation",
      report_date,
      controlAccount,
      grniSubledger.total,
      {
        open_receipt_lines: grniSubledger.lines.length,
        sample_lines: grniSubledger.lines.slice(0, 20),
      },
      [
        "GRNI subledger is derived from posted goods receipt lines less quantities billed on posted purchase bills linked to those receipt lines.",
        "First-version GRNI clearing assumes GRN-linked purchase bills clear GRNI at the original goods receipt unit cost; purchase price variance handling is not yet implemented.",
      ]
    );
  }

  async reconciliationSummary(scopeId, asOfDate = null) {
    const report_date = asOfDate || new Date().toISOString().slice(0, 10);
    const [ar, ap, inventory, grni, tax, advances] = await Promise.all([
      this.arControlReconciliation(scopeId, report_date),
      this.apControlReconciliation(scopeId, report_date),
      this.inventoryControlReconciliation(scopeId, report_date),
      this.grniControlReconciliation(scopeId, report_date),
      this.taxControlReconciliation(scopeId, report_date),
      this.advancesReconciliation(scopeId, report_date),
    ]);

    return {
      report_type: "reconciliation_summary",
      report_date,
      reports: {
        ar,
        ap,
        inventory,
        grni,
        tax,
        advances,
      },
      validation: {
        fully_reconciled: [
          ar.is_reconciled,
          ap.is_reconciled,
          inventory.is_reconciled,
          grni.is_reconciled,
          tax.validation.fully_reconciled,
          advances.validation.fully_reconciled,
        ].every(Boolean),
      },
    };
  }
}

module.exports = {
  AccountingReportsService,
};
