"use strict";

const crypto = require("crypto");

class JournalService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("JournalService requires a mysql2/promise pool");
    }
    if (!options.accountingControlService) {
      throw new Error("JournalService requires an accountingControlService");
    }
    this.pool = pool;
    this.accountingControlService = options.accountingControlService;
    this.auditService = options.auditService || null;
  }

  static get SOURCE_TYPES() {
    return [
      "sales_invoice",
      "sales_credit_note",
      "purchase_bill",
      "purchase_debit_note",
      "payment",
      "inventory_adjustment",
      "manual_journal",
      "opening_balance",
    ];
  }

  static get VALIDATION_RULES() {
    return [
      "A journal entry must contain at least two lines.",
      "Each line must have exactly one non-zero side: debit or credit.",
      "Debit and credit amounts cannot be negative.",
      "Total debits must equal total credits before posting.",
      "Posted journal entries are immutable and cannot be edited in place.",
      "Corrections must use reversal entries linked through reversed_entry_id.",
      "Each journal entry must be linked to a source_type and source_id where applicable.",
      "All journal creation, posting, and reversal operations run inside database transactions.",
    ];
  }

  static get EXAMPLE_JOURNALS() {
    return {
      sales_invoice: {
        memo: "Post sales invoice SI-0001",
        lines: [
          { accountCode: "1100-AR", debit: 1130.0, credit: 0 },
          { accountCode: "4100-SALES", debit: 0, credit: 1000.0 },
          { accountCode: "2200-TAX-OUT", debit: 0, credit: 130.0 },
        ],
      },
      sales_credit_note: {
        memo: "Post sales credit note SCN-0001",
        lines: [
          { accountCode: "4100-SALES", debit: 500.0, credit: 0 },
          { accountCode: "2200-TAX-OUT", debit: 65.0, credit: 0 },
          { accountCode: "1100-AR", debit: 0, credit: 565.0 },
        ],
      },
      purchase_bill: {
        memo: "Post purchase bill PB-0001",
        lines: [
          { accountCode: "1200-INVENTORY", debit: 1000.0, credit: 0 },
          { accountCode: "1300-TAX-IN", debit: 130.0, credit: 0 },
          { accountCode: "2100-AP", debit: 0, credit: 1130.0 },
        ],
      },
      purchase_debit_note: {
        memo: "Post purchase debit note PDN-0001",
        lines: [
          { accountCode: "2100-AP", debit: 565.0, credit: 0 },
          { accountCode: "1200-INVENTORY", debit: 0, credit: 500.0 },
          { accountCode: "1300-TAX-IN", debit: 0, credit: 65.0 },
        ],
      },
      payment: {
        memo: "Post incoming payment PAY-0001",
        lines: [
          { accountCode: "1020-BANK", debit: 1130.0, credit: 0 },
          { accountCode: "1100-AR", debit: 0, credit: 1130.0 },
        ],
      },
      inventory_adjustment: {
        memo: "Post inventory shrinkage adjustment",
        lines: [
          { accountCode: "5400-INV-ADJ-LOSS", debit: 250.0, credit: 0 },
          { accountCode: "1200-INVENTORY", debit: 0, credit: 250.0 },
        ],
      },
      manual_journal: {
        memo: "Record monthly bank charge",
        lines: [
          { accountCode: "5100-PURCHASES", debit: 25.0, credit: 0 },
          { accountCode: "1020-BANK", debit: 0, credit: 25.0 },
        ],
      },
      opening_balance: {
        memo: "Opening balances on go-live",
        lines: [
          { accountCode: "1010-CASH", debit: 5000.0, credit: 0 },
          { accountCode: "3100-OWNER-CAPITAL", debit: 0, credit: 5000.0 },
        ],
      },
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
      } catch (_rollbackError) {
        // Preserve the original error.
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

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS chart_of_accounts (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        parent_account_id VARCHAR(36) NULL,
        account_code VARCHAR(20) NOT NULL,
        account_name VARCHAR(150) NOT NULL,
        account_type ENUM('asset','liability','equity','income','expense') NOT NULL,
        normal_balance ENUM('debit','credit') NOT NULL,
        is_system TINYINT(1) NOT NULL DEFAULT 0,
        is_control_account TINYINT(1) NOT NULL DEFAULT 0,
        allow_posting TINYINT(1) NOT NULL DEFAULT 1,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_chart_of_accounts_company_code (company_id, account_code),
        KEY idx_chart_of_accounts_company_type (company_id, account_type)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        fiscal_period_id VARCHAR(36) NULL,
        user_id VARCHAR(36) NULL,
        entry_number VARCHAR(50) NULL,
        entry_no VARCHAR(50) NULL,
        entry_date DATE NOT NULL,
        source_type VARCHAR(50) NOT NULL,
        source_id VARCHAR(36) NULL,
        posting_status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft',
        status ENUM('posted','reversed') NULL,
        memo VARCHAR(255) NULL,
        created_by_user_id VARCHAR(36) NULL,
        posted_by_user_id VARCHAR(36) NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        reversed_entry_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_journal_entries_company_date (company_id, entry_date),
        KEY idx_journal_entries_source (source_type, source_id)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS journal_lines (
        id VARCHAR(36) PRIMARY KEY,
        journal_entry_id VARCHAR(36) NOT NULL,
        line_no INT NOT NULL DEFAULT 1,
        line_order INT NULL,
        account_id VARCHAR(36) NULL,
        account_code VARCHAR(40) NULL,
        customer_id VARCHAR(36) NULL,
        vendor_id VARCHAR(36) NULL,
        item_id VARCHAR(36) NULL,
        tax_code_id VARCHAR(36) NULL,
        description VARCHAR(255) NULL,
        debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        debit DECIMAL(14,2) NULL,
        credit DECIMAL(14,2) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_journal_lines_entry_line (journal_entry_id, line_no),
        KEY idx_journal_lines_account_id (account_id),
        KEY idx_journal_lines_account_code (account_code)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS audit_logs (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        actor_user_id VARCHAR(36) NULL,
        entity_type VARCHAR(100) NULL,
        entity_id VARCHAR(36) NULL,
        action_type VARCHAR(50) NULL,
        reason VARCHAR(255) NULL,
        before_state JSON NULL,
        after_state JSON NULL,
        ip_address VARCHAR(45) NULL,
        user_agent TEXT NULL,
        action VARCHAR(100) NULL,
        route VARCHAR(255) NULL,
        method VARCHAR(10) NULL,
        request_body JSON NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS fiscal_period_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS entry_number VARCHAR(50) NULL`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS posting_status ENUM('draft','posted','reversed') NOT NULL DEFAULT 'draft'`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS posted_by_user_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS line_no INT NOT NULL DEFAULT 1`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS account_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS customer_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS vendor_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS item_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS tax_code_id VARCHAR(36) NULL`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS debit_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(14,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_user_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS entity_id VARCHAR(36) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS action_type VARCHAR(50) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason VARCHAR(255) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS before_state JSON NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS after_state JSON NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL`,
      `ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Keep schema upgrades resilient across mixed environments.
      }
    }
  }

  normalizeMoney(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  assertValidSourceType(sourceType) {
    if (!JournalService.SOURCE_TYPES.includes(sourceType)) {
      throw new Error(`Unsupported source_type: ${sourceType}`);
    }
  }

  async resolveAccountId(conn, companyId, line) {
    if (line.accountId) {
      const account = await this.queryOne(
        conn,
        `SELECT id, allow_posting, is_active
           FROM chart_of_accounts
          WHERE id = ?
            AND company_id = ?
          LIMIT 1`,
        [line.accountId, companyId]
      );
      if (!account) throw new Error(`Account not found: ${line.accountId}`);
      if (!account.is_active) throw new Error(`Account is inactive: ${line.accountId}`);
      if (!account.allow_posting) throw new Error(`Account does not allow posting: ${line.accountId}`);
      return account.id;
    }

    if (!line.accountCode) {
      throw new Error("Each journal line requires accountId or accountCode");
    }

    const account = await this.queryOne(
      conn,
      `SELECT id, allow_posting, is_active
         FROM chart_of_accounts
        WHERE company_id = ?
          AND account_code = ?
        LIMIT 1`,
      [companyId, line.accountCode]
    );
    if (!account) throw new Error(`Account not found for code: ${line.accountCode}`);
    if (!account.is_active) throw new Error(`Account is inactive for code: ${line.accountCode}`);
    if (!account.allow_posting) throw new Error(`Account does not allow posting for code: ${line.accountCode}`);
    return account.id;
  }

  validateJournalBalance(lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
      throw new Error("A journal entry must contain at least two lines");
    }

    let debitTotal = 0;
    let creditTotal = 0;

    for (const [index, line] of lines.entries()) {
      const debit = this.normalizeMoney(line.debit);
      const credit = this.normalizeMoney(line.credit);

      if (debit < 0 || credit < 0) {
        throw new Error(`Line ${index + 1}: debit/credit cannot be negative`);
      }

      const hasDebit = debit > 0;
      const hasCredit = credit > 0;
      if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
        throw new Error(`Line ${index + 1}: exactly one of debit or credit must be non-zero`);
      }

      debitTotal += debit;
      creditTotal += credit;
    }

    debitTotal = this.normalizeMoney(debitTotal);
    creditTotal = this.normalizeMoney(creditTotal);

    if (debitTotal !== creditTotal) {
      throw new Error(`Journal is out of balance: debit=${debitTotal}, credit=${creditTotal}`);
    }

    return {
      balanced: true,
      debitTotal,
      creditTotal,
    };
  }

  async insertAuditLog(conn, payload) {
    if (this.auditService) {
      await this.auditService.logAction(
        {
          actorUserId: payload.actorUserId || null,
          companyId: payload.companyId || null,
          entityType: payload.entityType,
          entityId: payload.entityId,
          actionType: payload.actionType,
          reason: payload.reason || null,
          oldValues: payload.beforeState || null,
          newValues: payload.afterState || null,
          ipAddress: payload.ipAddress || null,
          userAgent: payload.userAgent || null,
        },
        conn
      );
      return;
    }

    const {
      companyId,
      actorUserId = null,
      entityType,
      entityId = null,
      actionType,
      reason = null,
      beforeState = null,
      afterState = null,
      ipAddress = null,
      userAgent = null,
    } = payload;

    try {
      await conn.execute(
        `INSERT INTO audit_logs
          (id, company_id, actor_user_id, entity_type, entity_id, action_type, reason, before_state, after_state, ip_address, user_agent)
         VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          companyId,
          actorUserId,
          entityType,
          entityId ? String(entityId) : null,
          actionType,
          reason,
          beforeState ? JSON.stringify(beforeState) : null,
          afterState ? JSON.stringify(afterState) : null,
          ipAddress,
          userAgent,
        ]
      );
    } catch (_error) {
      // Keep journaling resilient while the repo is still migrating audit schemas.
    }
  }

  async createJournalEntry(payload) {
    const {
      companyId,
      sourceType,
      sourceId = null,
      entryDate,
      memo = null,
      createdByUserId = null,
      lines = [],
      requestMeta = {},
    } = payload;

    if (!companyId) throw new Error("companyId is required");
    if (!entryDate) throw new Error("entryDate is required");
    this.assertValidSourceType(sourceType);
    this.validateJournalBalance(lines);

    return this.withTransaction(async (conn) => {
      const period = await this.accountingControlService.validatePostingDate(conn, companyId, entryDate);
      const numbering = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "journal_entry",
        entryDate,
        prefix: `JE-${String(entryDate).replace(/-/g, "")}-`,
        resetRule: "never",
      });
      const journalEntryId = crypto.randomUUID();

      await conn.execute(
        `INSERT INTO journal_entries
          (id, company_id, fiscal_period_id, user_id, entry_number, entry_no, entry_date, source_type, source_id, posting_status, status, memo, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'posted', ?, ?)`,
        [
          journalEntryId,
          companyId,
          period.id,
          createdByUserId,
          numbering.documentNumber,
          numbering.documentNumber,
          entryDate,
          sourceType,
          sourceId,
          memo,
          createdByUserId,
        ]
      );

      await this.createJournalLines(conn, {
        companyId,
        journalEntryId,
        lines,
      });

      const entry = await this.queryOne(
        conn,
        `SELECT *
           FROM journal_entries
          WHERE id = ?`,
        [journalEntryId]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId: createdByUserId,
        entityType: "journal_entry",
        entityId: journalEntryId,
        actionType: "create_draft",
        reason: "Draft journal entry created",
        afterState: { sourceType, sourceId, entryNumber: numbering.documentNumber },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
      });

      return entry;
    });
  }

  async createJournalLines(conn, payload) {
    const {
      companyId,
      journalEntryId,
      lines,
    } = payload;

    if (!conn) {
      throw new Error("createJournalLines must be called with an active transaction connection");
    }

    this.validateJournalBalance(lines);

    const entry = await this.queryOne(
      conn,
      `SELECT id, posting_status
         FROM journal_entries
        WHERE id = ?
          AND company_id = ?
        LIMIT 1`,
      [journalEntryId, companyId]
    );

    if (!entry) throw new Error("Journal entry not found");
    if (entry.posting_status !== "draft") {
      throw new Error("Cannot add or modify lines on a non-draft journal entry");
    }

    await conn.execute(`DELETE FROM journal_lines WHERE journal_entry_id = ?`, [journalEntryId]);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const accountId = await this.resolveAccountId(conn, companyId, line);
      await conn.execute(
        `INSERT INTO journal_lines
          (id, journal_entry_id, line_no, line_order, account_id, account_code, customer_id, vendor_id, item_id, tax_code_id, description, debit_amount, credit_amount, debit, credit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          journalEntryId,
          i + 1,
          i + 1,
          accountId,
          line.accountCode || null,
          line.customerId || null,
          line.vendorId || null,
          line.itemId || null,
          line.taxCodeId || null,
          line.description || null,
          this.normalizeMoney(line.debit),
          this.normalizeMoney(line.credit),
          this.normalizeMoney(line.debit),
          this.normalizeMoney(line.credit),
        ]
      );
    }
  }

  async postJournalEntry(params) {
    const {
      companyId,
      journalEntryId,
      actorUserId = null,
      requestMeta = {},
    } = params;

    if (!companyId || !journalEntryId) {
      throw new Error("companyId and journalEntryId are required");
    }

    return this.withTransaction(async (conn) => {
      const entry = await this.queryOne(
        conn,
        `SELECT *
           FROM journal_entries
          WHERE id = ?
            AND company_id = ?
          FOR UPDATE`,
        [journalEntryId, companyId]
      );

      if (!entry) throw new Error("Journal entry not found");
      if (entry.posting_status !== "draft") {
        throw new Error("Only draft journal entries can be posted");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT jl.*, coa.account_code
           FROM journal_lines jl
           JOIN chart_of_accounts coa ON coa.id = jl.account_id
          WHERE jl.journal_entry_id = ?
          ORDER BY jl.line_no ASC`,
        [journalEntryId]
      );

      this.validateJournalBalance(
        lines.map((line) => ({
          debit: line.debit_amount,
          credit: line.credit_amount,
        }))
      );

      await conn.execute(
        `UPDATE journal_entries
            SET posting_status = 'posted',
                status = 'posted',
                posted_by_user_id = ?,
                posted_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [actorUserId, journalEntryId]
      );

      const posted = await this.queryOne(
        conn,
        `SELECT *
           FROM journal_entries
          WHERE id = ?`,
        [journalEntryId]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "journal_entry",
        entityId: journalEntryId,
        actionType: "post",
        reason: "Journal entry posted",
        beforeState: { posting_status: entry.posting_status },
        afterState: { posting_status: "posted" },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
      });

      return posted;
    });
  }

  async reverseJournalEntry(params) {
    const {
      companyId,
      journalEntryId,
      actorUserId = null,
      reversalDate,
      reason,
      requestMeta = {},
    } = params;

    if (!companyId || !journalEntryId) {
      throw new Error("companyId and journalEntryId are required");
    }
    if (!reason) {
      throw new Error("A reversal reason is required");
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

      if (!original) throw new Error("Journal entry not found");
      if (original.posting_status !== "posted") {
        throw new Error("Only posted journal entries can be reversed");
      }
      if (original.reversed_entry_id) {
        throw new Error("Journal entry has already been reversed");
      }

      const lines = await this.queryAll(
        conn,
        `SELECT jl.*, coa.account_code
           FROM journal_lines jl
           JOIN chart_of_accounts coa ON coa.id = jl.account_id
          WHERE jl.journal_entry_id = ?
          ORDER BY jl.line_no ASC`,
        [journalEntryId]
      );

      if (!lines.length) {
        throw new Error("Cannot reverse a journal entry with no lines");
      }

      const postDate = reversalDate || new Date().toISOString().slice(0, 10);
      const period = await this.accountingControlService.validatePostingDate(conn, companyId, postDate);
      const reversalEntryId = crypto.randomUUID();
      const reversalNumbering = await this.accountingControlService.nextDocumentNumber(conn, {
        companyId,
        documentType: "journal_entry",
        entryDate: postDate,
        prefix: `JE-${String(postDate).replace(/-/g, "")}-`,
        resetRule: "never",
      });

      await conn.execute(
        `INSERT INTO journal_entries
          (id, company_id, fiscal_period_id, user_id, entry_number, entry_no, entry_date, source_type, source_id, posting_status, status, memo, created_by_user_id, posted_by_user_id, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'posted', 'posted', ?, ?, ?, NOW())`,
        [
          reversalEntryId,
          companyId,
          period.id,
          actorUserId,
          reversalNumbering.documentNumber,
          reversalNumbering.documentNumber,
          postDate,
          original.source_type,
          original.source_id,
          `Reversal of ${original.entry_number}: ${reason}`,
          actorUserId,
          actorUserId,
        ]
      );

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        await conn.execute(
          `INSERT INTO journal_lines
            (id, journal_entry_id, line_no, line_order, account_id, account_code, customer_id, vendor_id, item_id, tax_code_id, description, debit_amount, credit_amount, debit, credit)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            reversalEntryId,
            i + 1,
            i + 1,
            line.account_id,
            line.account_code || null,
            line.customer_id,
            line.vendor_id,
            line.item_id,
            line.tax_code_id,
            `Reversal of ${line.description || original.entry_number}`,
            this.normalizeMoney(line.credit_amount),
            this.normalizeMoney(line.debit_amount),
            this.normalizeMoney(line.credit_amount),
            this.normalizeMoney(line.debit_amount),
          ]
        );
      }

      await conn.execute(
        `UPDATE journal_entries
            SET posting_status = 'reversed',
                status = 'reversed',
                reversed_entry_id = ?,
                updated_at = NOW()
          WHERE id = ?`,
        [reversalEntryId, journalEntryId]
      );

      await this.insertAuditLog(conn, {
        companyId,
        actorUserId,
        entityType: "journal_entry",
        entityId: journalEntryId,
        actionType: "reverse",
        reason,
        beforeState: { posting_status: original.posting_status, reversed_entry_id: original.reversed_entry_id },
        afterState: { posting_status: "reversed", reversed_entry_id: reversalEntryId },
        ipAddress: requestMeta.ipAddress || null,
        userAgent: requestMeta.userAgent || null,
      });

      return {
        originalEntryId: journalEntryId,
        reversalEntryId,
        reversalEntryNumber: reversalNumbering.documentNumber,
      };
    });
  }
}

module.exports = {
  JournalService,
};
