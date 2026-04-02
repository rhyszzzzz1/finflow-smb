"use strict";

class AccountingReportsService {
  constructor(db) {
    if (!db) throw new Error("AccountingReportsService requires a mysql connection");
    this.db = db;
    this._tableExistsCache = new Map();
  }

  q(sql, params = []) {
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

  async getJournalBalances(userId, { startDate = null, endDate = null, asOfDate = null, accountTypes = null } = {}) {
    const params = [userId];
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
       WHERE COALESCE(je.company_id, je.user_id) = ?
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

  async trialBalance(userId, startDate, endDate) {
    const { start, end } = this.dateRange(startDate, endDate);
    const rows = await this.getJournalBalances(userId, { startDate: start, endDate: end });

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

  async profitAndLoss(userId, startDate, endDate) {
    const { start, end } = this.dateRange(startDate, endDate);
    const rows = await this.getJournalBalances(userId, {
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

  async balanceSheet(userId, asOfDate) {
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const rows = await this.getJournalBalances(userId, { asOfDate: as_of_date });

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

  async getSalesCreditAdjustments(userId, as_of_date) {
    const hasCreditNotes = await this.tableExists("sales_credit_note_headers");
    if (!hasCreditNotes) {
      return [];
    }

    return this.q(
      `SELECT
          cn.id AS document_id,
          cn.customer_id,
          cn.customer_name,
          cn.credit_note_number AS document_no,
          cn.credit_note_date AS document_date,
          cn.total_amount
       FROM sales_credit_note_headers cn
       WHERE cn.user_id = ?
         AND cn.status = 'posted'
         AND cn.credit_note_date <= ?`,
      [userId, as_of_date]
    ).catch(() => []);
  }

  async getPurchaseDebitAdjustments(userId, as_of_date) {
    const hasDebitNotes = await this.tableExists("purchase_debit_note_headers");
    if (!hasDebitNotes) {
      return [];
    }

    return this.q(
      `SELECT
          dn.id AS document_id,
          dn.vendor_id,
          dn.vendor_name,
          dn.debit_note_number AS document_no,
          dn.debit_note_date AS document_date,
          dn.total_amount
       FROM purchase_debit_note_headers dn
       WHERE dn.user_id = ?
         AND dn.status = 'posted'
         AND dn.debit_note_date <= ?`,
      [userId, as_of_date]
    ).catch(() => []);
  }

  async arAging(userId, asOfDate) {
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const creditNotes = await this.getSalesCreditAdjustments(userId, as_of_date);
    const creditByCustomer = creditNotes.reduce((map, row) => {
      const key = row.customer_id || "__unassigned__";
      map.set(key, this.r2((map.get(key) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());

    const rows = await this.q(
      `SELECT
          si.id AS document_id,
          si.invoice_no AS document_no,
          si.customer_id,
          si.customer_name,
          si.invoice_date AS document_date,
          si.due_date,
          si.total_amount AS document_amount,
          COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' AND p.payment_date <= ? THEN pa.allocated_amount ELSE 0 END), 0) AS applied_amount
       FROM sales_invoice_headers si
       LEFT JOIN payment_allocations pa ON pa.sales_invoice_id = si.id OR pa.invoice_id = si.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE si.user_id = ?
         AND si.posted_journal_entry_id IS NOT NULL
         AND si.status != 'void'
         AND si.invoice_date <= ?
       GROUP BY si.id, si.invoice_no, si.customer_id, si.customer_name, si.invoice_date, si.due_date, si.total_amount
       ORDER BY si.due_date ASC, si.invoice_date ASC`,
      [as_of_date, userId, as_of_date]
    );

    const lines = rows
      .map((row) => {
        const customerCredit = this.r2(creditByCustomer.get(row.customer_id || "__unassigned__") || 0);
        const document_amount = this.r2(row.document_amount);
        const applied_amount = this.r2(row.applied_amount);
        const outstanding_amount = this.r2(document_amount - applied_amount);
        return {
          document_id: row.document_id,
          document_no: row.document_no,
          customer_id: row.customer_id,
          customer_name: row.customer_name,
          document_date: row.document_date,
          due_date: row.due_date,
          document_amount,
          credit_note_adjustments_for_customer: customerCredit,
          applied_amount,
          outstanding_amount,
          days_overdue: Math.max(0, Math.floor((new Date(as_of_date).getTime() - new Date(row.due_date).getTime()) / 86400000)),
        };
      })
      .filter((row) => row.outstanding_amount > 0);

    return this.buildAgingPayload(lines, as_of_date, "ar_aging");
  }

  async apAging(userId, asOfDate) {
    const as_of_date = asOfDate || new Date().toISOString().slice(0, 10);
    const debitNotes = await this.getPurchaseDebitAdjustments(userId, as_of_date);
    const debitByVendor = debitNotes.reduce((map, row) => {
      const key = row.vendor_id || "__unassigned__";
      map.set(key, this.r2((map.get(key) || 0) + Number(row.total_amount || 0)));
      return map;
    }, new Map());

    const rows = await this.q(
      `SELECT
          pb.id AS document_id,
          pb.bill_no AS document_no,
          pb.vendor_id,
          pb.vendor_name,
          pb.bill_date AS document_date,
          pb.due_date,
          pb.total_amount AS document_amount,
          COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' AND p.payment_date <= ? THEN pa.allocated_amount ELSE 0 END), 0) AS applied_amount
       FROM purchase_bill_headers pb
       LEFT JOIN payment_allocations pa ON pa.purchase_bill_id = pb.id OR pa.purchase_id = pb.id
       LEFT JOIN payments p ON p.id = pa.payment_id
       WHERE pb.user_id = ?
         AND pb.posted_journal_entry_id IS NOT NULL
         AND pb.status != 'void'
         AND pb.bill_date <= ?
       GROUP BY pb.id, pb.bill_no, pb.vendor_id, pb.vendor_name, pb.bill_date, pb.due_date, pb.total_amount
       ORDER BY pb.due_date ASC, pb.bill_date ASC`,
      [as_of_date, userId, as_of_date]
    );

    const lines = rows
      .map((row) => {
        const vendorDebit = this.r2(debitByVendor.get(row.vendor_id || "__unassigned__") || 0);
        const document_amount = this.r2(row.document_amount);
        const applied_amount = this.r2(row.applied_amount);
        const outstanding_amount = this.r2(document_amount - applied_amount);
        return {
          document_id: row.document_id,
          document_no: row.document_no,
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          document_date: row.document_date,
          due_date: row.due_date,
          document_amount,
          debit_note_adjustments_for_vendor: vendorDebit,
          applied_amount,
          outstanding_amount,
          days_overdue: Math.max(0, Math.floor((new Date(as_of_date).getTime() - new Date(row.due_date).getTime()) / 86400000)),
        };
      })
      .filter((row) => row.outstanding_amount > 0);

    return this.buildAgingPayload(lines, as_of_date, "ap_aging");
  }

  async customerStatement(userId, customerId, startDate, endDate) {
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
       WHERE user_id = ?
         AND customer_id = ?
         AND posted_journal_entry_id IS NOT NULL
         AND status != 'void'
         AND invoice_date BETWEEN ? AND ?`,
      [userId, customerId, start, end]
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
         AND p.customer_id = ?
         AND p.type = 'incoming'
         AND p.status = 'posted'
         AND p.payment_date BETWEEN ? AND ?
       GROUP BY p.id, p.payment_number, p.payment_date, p.notes`,
      [userId, customerId, start, end]
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
         WHERE user_id = ?
           AND customer_id = ?
           AND status = 'posted'
           AND credit_note_date BETWEEN ? AND ?`,
        [userId, customerId, start, end]
      ).catch(() => [])
      : [];

    const lines = [
      ...invoices.map((row) => ({
        ...row,
        entry_type: "invoice",
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
      ...payments.map((row) => ({
        ...row,
        entry_type: "payment",
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
      ...creditNotes.map((row) => ({
        ...row,
        entry_type: "credit_note",
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
    ].sort((a, b) => {
      const dateCompare = String(a.document_date).localeCompare(String(b.document_date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.document_no || "").localeCompare(String(b.document_no || ""));
    });

    let running_balance = 0;
    const statement_lines = lines.map((row) => {
      running_balance = this.r2(running_balance + row.debit_amount - row.credit_amount);
      return {
        ...row,
        running_balance,
      };
    });

    return {
      customer_id: customerId,
      period: { start_date: start, end_date: end },
      lines: statement_lines,
      closing_balance: this.r2(running_balance),
      validation: {
        closing_balance_matches_lines: this.r2(running_balance - statement_lines.reduce((sum, row) => sum + row.debit_amount - row.credit_amount, 0)) === 0,
      },
    };
  }

  async vendorStatement(userId, vendorId, startDate, endDate) {
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
       WHERE user_id = ?
         AND vendor_id = ?
         AND posted_journal_entry_id IS NOT NULL
         AND status != 'void'
         AND bill_date BETWEEN ? AND ?`,
      [userId, vendorId, start, end]
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
         AND p.vendor_id = ?
         AND p.type = 'outgoing'
         AND p.status = 'posted'
         AND p.payment_date BETWEEN ? AND ?
       GROUP BY p.id, p.payment_number, p.payment_date, p.notes`,
      [userId, vendorId, start, end]
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
         WHERE user_id = ?
           AND vendor_id = ?
           AND status = 'posted'
           AND debit_note_date BETWEEN ? AND ?`,
        [userId, vendorId, start, end]
      ).catch(() => [])
      : [];

    const lines = [
      ...bills.map((row) => ({
        ...row,
        entry_type: "bill",
        debit_amount: 0,
        credit_amount: this.r2(row.amount),
      })),
      ...payments.map((row) => ({
        ...row,
        entry_type: "payment",
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
      ...debitNotes.map((row) => ({
        ...row,
        entry_type: "debit_note",
        debit_amount: this.r2(row.amount),
        credit_amount: 0,
      })),
    ].sort((a, b) => {
      const dateCompare = String(a.document_date).localeCompare(String(b.document_date));
      if (dateCompare !== 0) return dateCompare;
      return String(a.document_no || "").localeCompare(String(b.document_no || ""));
    });

    let running_balance = 0;
    const statement_lines = lines.map((row) => {
      running_balance = this.r2(running_balance + row.credit_amount - row.debit_amount);
      return {
        ...row,
        running_balance,
      };
    });

    return {
      vendor_id: vendorId,
      period: { start_date: start, end_date: end },
      lines: statement_lines,
      closing_balance: this.r2(running_balance),
      validation: {
        closing_balance_matches_lines: this.r2(running_balance - statement_lines.reduce((sum, row) => sum + row.credit_amount - row.debit_amount, 0)) === 0,
      },
    };
  }

  async stockSummary(userId, asOfDate = null) {
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
      [userId, as_of_date]
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

  async stockLedger(userId, itemId, warehouseId = null, startDate = null, endDate = null) {
    const { start, end } = this.dateRange(startDate, endDate);
    const params = [userId, itemId, start, end];
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
}

module.exports = {
  AccountingReportsService,
};
