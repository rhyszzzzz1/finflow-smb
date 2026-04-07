"use strict";

const crypto = require("crypto");
const { sqlParams } = require("../utils/sqlParams");

/**
 * Coerces mysql2 DATE / JS Date / ISO-ish strings to `YYYY-MM-DD` for fiscal logic and JE numbering.
 * Prevents `String(new Date())` prefixes like `JE-Sun Apr 05 2026...` that blow VARCHAR(30)/(50) limits
 * and collide after truncation (duplicate uq_entry_no_user).
 * @param {string|Date} entryDate
 * @returns {string}
 */
function normalizeEntryDateForAccounting(entryDate) {
  if (entryDate == null || entryDate === "") {
    throw new Error("entryDate is required");
  }
  if (entryDate instanceof Date) {
    if (Number.isNaN(entryDate.getTime())) throw new Error("Invalid entryDate");
    const y = entryDate.getUTCFullYear();
    const m = String(entryDate.getUTCMonth() + 1).padStart(2, "0");
    const d = String(entryDate.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(entryDate).trim();
  const isoHead = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoHead) return isoHead[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
    const d = String(parsed.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  throw new Error(`Unparseable entryDate: ${s.slice(0, 80)}`);
}

class AccountingControlService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("AccountingControlService requires a mysql2/promise pool");
    }
    if (!options.counterpartyService) {
      throw new Error("AccountingControlService requires a counterpartyService");
    }
    this.pool = pool;
    this.counterpartyService = options.counterpartyService;
    this.allowSoftLockedBackdatedPosting = Boolean(options.allowSoftLockedBackdatedPosting);
  }

  async queryAll(conn, sql, params = []) {
    const executor = conn || this.pool;
    const [rows] = await executor.execute(sql, sqlParams(params));
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
        document_type VARCHAR(64) NOT NULL,
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
      `ALTER TABLE document_sequences MODIFY COLUMN document_type VARCHAR(64) NOT NULL`,
      `ALTER TABLE document_sequences MODIFY COLUMN prefix VARCHAR(64) NOT NULL`,
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
    return this.counterpartyService.resolveCompanyId(conn, actorUserId);
  }

  async ensureFiscalPeriodForDate(conn, companyId, entryDate) {
    const entryDateNorm = normalizeEntryDateForAccounting(entryDate);
    const existing = await this.queryOne(
      conn,
      `SELECT *
         FROM fiscal_periods
        WHERE company_id = ?
          AND ? BETWEEN start_date AND end_date
        ORDER BY start_date DESC
        LIMIT 1
        FOR UPDATE`,
      [companyId, entryDateNorm]
    );

    if (existing) {
      return existing;
    }

    const year = entryDateNorm.slice(0, 4);
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
      sqlParams([created.id, created.company_id, created.period_name, created.start_date, created.end_date])
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

    const entryDateNorm = normalizeEntryDateForAccounting(entryDate);
    const period = await this.ensureFiscalPeriodForDate(conn, companyId, entryDateNorm);
    const year = entryDateNorm.slice(0, 4);
    const yyyymmdd = entryDateNorm.replace(/-/g, "");
    const defaultPrefixes = {
      sales_invoice: `SI-${year}-`,
      sales_quote: `SQ-${year}-`,
      sales_order: `SO-${year}-`,
      sales_credit_note: `SCN-${year}-`,
      purchase_bill: `PB-${year}-`,
      purchase_order: `PO-${year}-`,
      purchase_debit_note: `PDN-${year}-`,
      goods_receipt: `GR-${year}-`,
      payment: `PAY-${year}-`,
      journal_entry: `JE-${yyyymmdd}-`,
    };
    let resolvedPrefix = prefix || defaultPrefixes[documentType];
    if (documentType === "journal_entry") {
      resolvedPrefix = `JE-${yyyymmdd}-`;
    }
    if (!resolvedPrefix) {
      const slug = String(documentType || "DOC")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "")
        .slice(0, 6) || "DOC";
      resolvedPrefix = `${slug}-${year}-`;
    }
    const scopedFiscalPeriodId = resetRule === "period" ? (period.id ?? null) : null;

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
        sqlParams([sequence.id, companyId, scopedFiscalPeriodId, documentType, resolvedPrefix, resetRule])
      );
    }

    const nextNumber = Number(sequence.next_number || 1);
    await conn.execute(
      `UPDATE document_sequences
          SET next_number = ?,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ?`,
      sqlParams([nextNumber + 1, sequence.id])
    );

    return {
      sequenceId: sequence.id,
      fiscalPeriodId: period.id ?? null,
      documentNumber: `${resolvedPrefix}${String(nextNumber).padStart(6, "0")}`,
      entryDate: entryDateNorm,
    };
  }

  /** @param {string|Date} entryDate */
  normalizeEntryDate(entryDate) {
    return normalizeEntryDateForAccounting(entryDate);
  }
}

module.exports = {
  AccountingControlService,
  normalizeEntryDateForAccounting,
};
