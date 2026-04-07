"use strict";

class TaxService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("TaxService requires a mysql2/promise pool");
    }
    if (!options.counterpartyService) {
      throw new Error("TaxService requires a counterpartyService");
    }
    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
  }

  async queryAll(conn, sql, params = []) {
    const executor = conn || this.pool;
    const [rows] = await executor.execute(sql, params);
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  money(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS tax_codes (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(100) NOT NULL,
        tax_type ENUM('vat','zero_rated','exempt','non_taxable') NOT NULL DEFAULT 'vat',
        rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        output_tax_account_id VARCHAR(36) NULL,
        input_tax_account_id VARCHAR(36) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tax_code_user (user_id, code)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS tax_transactions (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        tax_code_id VARCHAR(36) NOT NULL,
        source_type ENUM('sales_invoice_line','purchase_bill_line','sales_credit_note_line','purchase_debit_note_line','manual_journal') NOT NULL,
        source_id VARCHAR(36) NOT NULL,
        source_line_id VARCHAR(36) NULL,
        tax_direction ENUM('output','input') NOT NULL,
        counterparty_id VARCHAR(36) NULL,
        counterparty_name VARCHAR(255) NULL,
        document_number VARCHAR(50) NULL,
        transaction_date DATE NOT NULL,
        taxable_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_journal_entry_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_tax_transactions_company_date (company_id, transaction_date),
        KEY idx_tax_transactions_tax_code (tax_code_id),
        KEY idx_tax_transactions_source (source_type, source_id)
      )
      `,
      `ALTER TABLE tax_codes ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE tax_codes ADD COLUMN IF NOT EXISTS tax_type ENUM('vat','zero_rated','exempt','non_taxable') NOT NULL DEFAULT 'vat'`,
      `ALTER TABLE tax_codes ADD COLUMN IF NOT EXISTS output_tax_account_id VARCHAR(36) NULL`,
      `ALTER TABLE tax_codes ADD COLUMN IF NOT EXISTS input_tax_account_id VARCHAR(36) NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Mixed transitional schemas may already exist.
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async getTaxCodeById(conn, actorUserId, taxCodeId) {
    if (!taxCodeId) return null;

    const companyId = await this.resolveCompanyId(conn, actorUserId);
    const modern = await this.queryOne(
      conn,
      `SELECT *
         FROM tax_codes
        WHERE id = ?
          AND (company_id = ? OR company_id IS NULL)
        LIMIT 1`,
      [taxCodeId, companyId]
    ).catch(() => null);

    if (modern) {
      return modern;
    }

    return this.queryOne(
      conn,
      `SELECT *
         FROM tax_codes
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [taxCodeId, actorUserId]
    ).catch(() => null);
  }

  async getTaxRate(conn, actorUserId, taxCodeId) {
    const taxCode = await this.getTaxCodeById(conn, actorUserId, taxCodeId);
    return Number(taxCode?.rate_percent || 0);
  }

  async calculateLineTax(conn, actorUserId, input) {
    const taxCode = input.tax_code_id
      ? await this.getTaxCodeById(conn, actorUserId, input.tax_code_id)
      : null;

    const taxType = taxCode?.tax_type || "non_taxable";
    const ratePercent = input.tax_rate !== undefined && input.tax_rate !== null
      ? Number(input.tax_rate)
      : Number(taxCode?.rate_percent || 0);

    const taxableAmount = this.money(input.taxable_amount);
    let taxAmount = 0;

    if (taxType === "vat") {
      taxAmount = this.money((taxableAmount * ratePercent) / 100);
    }

    return {
      tax_code_id: taxCode?.id || input.tax_code_id || null,
      tax_type: taxType,
      tax_rate: ratePercent,
      taxable_amount: taxableAmount,
      tax_amount: taxAmount,
      output_tax_account_id: taxCode?.output_tax_account_id || null,
      input_tax_account_id: taxCode?.input_tax_account_id || null,
    };
  }

  async buildOutputTaxPostings(conn, actorUserId, lines) {
    const grouped = new Map();

    for (const line of lines) {
      const taxCode = line.tax_code_id
        ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id)
        : null;
      const amount = this.money(line.line_tax_amount);
      if (!taxCode || amount <= 0 || taxCode.tax_type !== "vat") continue;

      const key = taxCode.output_tax_account_id || "2200-TAX-OUT";
      const current = grouped.get(key) || { accountId: taxCode.output_tax_account_id || null, amount: 0 };
      current.amount = this.money(current.amount + amount);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([key, value]) => ({
      accountId: value.accountId,
      accountCode: value.accountId ? undefined : key,
      amount: value.amount,
    }));
  }

  async buildInputTaxPostings(conn, actorUserId, lines) {
    const grouped = new Map();

    for (const line of lines) {
      const taxCode = line.tax_code_id
        ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id)
        : null;
      const amount = this.money(line.line_tax_amount);
      if (!taxCode || amount <= 0 || taxCode.tax_type !== "vat") continue;

      const key = taxCode.input_tax_account_id || "1300-TAX-IN";
      const current = grouped.get(key) || { accountId: taxCode.input_tax_account_id || null, amount: 0 };
      current.amount = this.money(current.amount + amount);
      grouped.set(key, current);
    }

    return Array.from(grouped.entries()).map(([key, value]) => ({
      accountId: value.accountId,
      accountCode: value.accountId ? undefined : key,
      amount: value.amount,
    }));
  }

  async recordTaxTransactionsForSalesInvoice(conn, actorUserId, payload) {
    const { companyId, header, lines, postedJournalEntryId } = payload;
    for (const line of lines) {
      const taxCode = line.tax_code_id
        ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id)
        : null;
      if (!taxCode) continue;

      const taxableAmount = this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0));
      const taxAmount = this.money(line.line_tax_amount);

      await conn.execute(
        `INSERT INTO tax_transactions
          (id, company_id, tax_code_id, source_type, source_id, source_line_id, tax_direction, counterparty_id, counterparty_name,
           document_number, transaction_date, taxable_amount, tax_amount, posted_journal_entry_id)
         VALUES (UUID(), ?, ?, 'sales_invoice_line', ?, ?, 'output', ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          taxCode.id,
          header.id,
          line.id,
          header.counterparty_id || header.customer_id || null,
          header.customer_name || null,
          header.invoice_no,
          header.invoice_date,
          taxableAmount,
          taxAmount,
          postedJournalEntryId || null,
        ]
      );
    }
  }

  async recordTaxTransactionsForPurchaseBill(conn, actorUserId, payload) {
    const { companyId, header, lines, postedJournalEntryId } = payload;
    for (const line of lines) {
      const taxCode = line.tax_code_id
        ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id)
        : null;
      if (!taxCode) continue;

      const taxableAmount = this.money(Number(line.line_subtotal || 0) - Number(line.discount_amount || 0));
      const taxAmount = this.money(line.line_tax_amount);

      await conn.execute(
        `INSERT INTO tax_transactions
          (id, company_id, tax_code_id, source_type, source_id, source_line_id, tax_direction, counterparty_id, counterparty_name,
           document_number, transaction_date, taxable_amount, tax_amount, posted_journal_entry_id)
         VALUES (UUID(), ?, ?, 'purchase_bill_line', ?, ?, 'input', ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          taxCode.id,
          header.id,
          line.id,
          header.counterparty_id || header.vendor_id || null,
          header.vendor_name || null,
          header.bill_no,
          header.bill_date,
          taxableAmount,
          taxAmount,
          postedJournalEntryId || null,
        ]
      );
    }
  }

  async recordTaxTransactionsForSalesCreditNote(conn, actorUserId, payload) {
    const { companyId, header, lines, postedJournalEntryId } = payload;
    for (const line of lines) {
      const taxCode = line.tax_code_id ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id) : null;
      if (!taxCode) continue;

      const taxableAmount = this.money(-Math.abs(Number(line.taxable_amount || line.line_subtotal || 0)));
      const taxAmount = this.money(-Math.abs(Number(line.line_tax_amount || 0)));

      await conn.execute(
        `INSERT INTO tax_transactions
          (id, company_id, tax_code_id, source_type, source_id, source_line_id, tax_direction, counterparty_id, counterparty_name,
           document_number, transaction_date, taxable_amount, tax_amount, posted_journal_entry_id)
         VALUES (UUID(), ?, ?, 'sales_credit_note_line', ?, ?, 'output', ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          taxCode.id,
          header.id,
          line.id,
          header.counterparty_id || header.customer_id || null,
          header.customer_name || null,
          header.credit_note_number,
          header.credit_note_date,
          taxableAmount,
          taxAmount,
          postedJournalEntryId || null,
        ]
      );
    }
  }

  async recordTaxTransactionsForPurchaseDebitNote(conn, actorUserId, payload) {
    const { companyId, header, lines, postedJournalEntryId } = payload;
    for (const line of lines) {
      const taxCode = line.tax_code_id ? await this.getTaxCodeById(conn, actorUserId, line.tax_code_id) : null;
      if (!taxCode) continue;

      const taxableAmount = this.money(-Math.abs(Number(line.taxable_amount || line.line_subtotal || 0)));
      const taxAmount = this.money(-Math.abs(Number(line.line_tax_amount || 0)));

      await conn.execute(
        `INSERT INTO tax_transactions
          (id, company_id, tax_code_id, source_type, source_id, source_line_id, tax_direction, counterparty_id, counterparty_name,
           document_number, transaction_date, taxable_amount, tax_amount, posted_journal_entry_id)
         VALUES (UUID(), ?, ?, 'purchase_debit_note_line', ?, ?, 'input', ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          taxCode.id,
          header.id,
          line.id,
          header.counterparty_id || header.vendor_id || null,
          header.vendor_name || null,
          header.debit_note_number,
          header.debit_note_date,
          taxableAmount,
          taxAmount,
          postedJournalEntryId || null,
        ]
      );
    }
  }
}

module.exports = {
  TaxService,
};
