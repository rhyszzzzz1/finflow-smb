"use strict";

const crypto = require("crypto");

class AccountingControlService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("AccountingControlService requires a mysql2/promise pool");
    }
    this.pool = pool;
    this.allowSoftLockedBackdatedPosting = Boolean(options.allowSoftLockedBackdatedPosting);
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

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS fiscal_periods (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        period_name VARCHAR(100) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        status ENUM('open','soft_locked','closed') NOT NULL DEFAULT 'open',
        allow_backdated_posting TINYINT(1) NOT NULL DEFAULT 0,
        closed_at TIMESTAMP NULL DEFAULT NULL,
        closed_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_fiscal_periods_company_name (company_id, period_name),
        UNIQUE KEY uq_fiscal_periods_company_dates (company_id, start_date, end_date),
        KEY idx_fiscal_periods_company_status (company_id, status)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS document_sequences (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        fiscal_period_id VARCHAR(36) NULL,
        document_type ENUM('sales_invoice','sales_credit_note','purchase_bill','payment','journal_entry') NOT NULL,
        prefix VARCHAR(30) NOT NULL,
        next_number BIGINT UNSIGNED NOT NULL DEFAULT 1,
        reset_rule ENUM('never','yearly','period') NOT NULL DEFAULT 'yearly',
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_document_sequences_scope (company_id, fiscal_period_id, document_type, prefix)
      )
      `,
      `ALTER TABLE fiscal_periods MODIFY COLUMN status ENUM('open','soft_locked','closed') NOT NULL DEFAULT 'open'`,
      `ALTER TABLE fiscal_periods ADD COLUMN IF NOT EXISTS allow_backdated_posting TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE document_sequences MODIFY COLUMN document_type ENUM('sales_invoice','sales_credit_note','purchase_bill','payment','journal_entry') NOT NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Mixed transitional environments may already differ.
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    const company = await this.queryOne(
      conn,
      `SELECT id
         FROM companies
        WHERE legacy_profile_id = ?
           OR owner_profile_id = ?
        LIMIT 1`,
      [actorUserId, actorUserId]
    ).catch(() => null);
    return company?.id || actorUserId;
  }

  async ensureFiscalPeriodForDate(conn, companyId, entryDate) {
    const existing = await this.queryOne(
      conn,
      `SELECT *
         FROM fiscal_periods
        WHERE company_id = ?
          AND ? BETWEEN start_date AND end_date
        ORDER BY start_date DESC
        LIMIT 1
        FOR UPDATE`,
      [companyId, entryDate]
    );

    if (existing) {
      return existing;
    }

    const year = String(entryDate).slice(0, 4);
    const id = crypto.randomUUID();
    const created = {
      id,
      company_id: companyId,
      period_name: `FY ${year}`,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      status: "open",
      allow_backdated_posting: 0,
    };

    await conn.execute(
      `INSERT INTO fiscal_periods
        (id, company_id, period_name, start_date, end_date, status, allow_backdated_posting)
       VALUES (?, ?, ?, ?, ?, 'open', 0)`,
      [created.id, created.company_id, created.period_name, created.start_date, created.end_date]
    );

    return created;
  }

  async validatePostingDate(conn, companyId, entryDate, options = {}) {
    const period = await this.ensureFiscalPeriodForDate(conn, companyId, entryDate);
    const allowSoftLocked = options.allowSoftLockedBackdatedPosting ?? this.allowSoftLockedBackdatedPosting;

    if (period.status === "closed") {
      throw new Error(`Posting period is closed for ${entryDate}`);
    }

    if (period.status === "soft_locked" && !allowSoftLocked && !Number(period.allow_backdated_posting || 0)) {
      throw new Error(`Posting period is soft-locked for ${entryDate}`);
    }

    return period;
  }

  async nextDocumentNumber(conn, payload) {
    const { companyId, documentType, entryDate, prefix, resetRule = "yearly" } = payload;
    if (!companyId || !documentType || !entryDate) {
      throw new Error("companyId, documentType, and entryDate are required");
    }

    const period = await this.ensureFiscalPeriodForDate(conn, companyId, entryDate);
    const year = String(entryDate).slice(0, 4);
    const yyyymmdd = String(entryDate).replace(/-/g, "");
    const defaultPrefixes = {
      sales_invoice: `SI-${year}-`,
      sales_credit_note: `SCN-${year}-`,
      purchase_bill: `PB-${year}-`,
      payment: `PAY-${year}-`,
      journal_entry: `JE-${yyyymmdd}-`,
    };
    const resolvedPrefix = prefix || defaultPrefixes[documentType];
    const scopedFiscalPeriodId = resetRule === "period" ? period.id : null;

    let sequence = await this.queryOne(
      conn,
      `SELECT *
         FROM document_sequences
        WHERE company_id = ?
          AND document_type = ?
          AND prefix = ?
          AND ((fiscal_period_id IS NULL AND ? IS NULL) OR fiscal_period_id = ?)
        LIMIT 1
        FOR UPDATE`,
      [companyId, documentType, resolvedPrefix, scopedFiscalPeriodId, scopedFiscalPeriodId]
    );

    if (!sequence) {
      sequence = {
        id: crypto.randomUUID(),
        next_number: 1,
      };
      await conn.execute(
        `INSERT INTO document_sequences
          (id, company_id, fiscal_period_id, document_type, prefix, next_number, reset_rule, is_active)
         VALUES (?, ?, ?, ?, ?, 1, ?, 1)`,
        [sequence.id, companyId, scopedFiscalPeriodId, documentType, resolvedPrefix, resetRule]
      );
    }

    const nextNumber = Number(sequence.next_number || 1);
    await conn.execute(
      `UPDATE document_sequences
          SET next_number = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      [nextNumber + 1, sequence.id]
    );

    return {
      sequenceId: sequence.id,
      fiscalPeriodId: period.id,
      documentNumber: `${resolvedPrefix}${String(nextNumber).padStart(6, "0")}`,
    };
  }
}

module.exports = {
  AccountingControlService,
};
