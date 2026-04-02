"use strict";

const crypto = require("crypto");

const DEFAULT_ACCOUNT_CODES = {
  cashOnHand: "1010-CASH",
  bank: "1020-BANK",
  accountsReceivable: "1100-AR",
  inventory: "1200-INVENTORY",
  inputVat: "1300-TAX-IN",
  accountsPayable: "2100-AP",
  outputVatPayable: "2200-TAX-OUT",
  ownersCapital: "3100-OWNER-CAPITAL",
  retainedEarnings: "3200-RETAINED-EARNINGS",
  salesRevenue: "4100-SALES",
  discountsReceived: "4200-DISC-RECEIVED",
  inventoryAdjustmentGain: "4300-INV-ADJ-GAIN",
  purchases: "5100-PURCHASES",
  costOfGoodsSold: "5200-COGS",
  discountsAllowed: "5300-DISC-ALLOWED",
  inventoryAdjustmentLoss: "5400-INV-ADJ-LOSS",
};

const DEFAULT_ACCOUNT_TREE = [
  {
    code: "1000-ASSETS",
    name: "Assets",
    type: "asset",
    normalBalance: "debit",
    allowPosting: false,
    children: [
      {
        code: "1010-CASH",
        name: "Cash on Hand",
        type: "asset",
        normalBalance: "debit",
        configurableKey: "cashOnHand",
      },
      {
        code: "1020-BANK",
        name: "Bank Accounts",
        type: "asset",
        normalBalance: "debit",
        isControlAccount: true,
        configurableKey: "bank",
      },
      {
        code: "1100-AR",
        name: "Accounts Receivable",
        type: "asset",
        normalBalance: "debit",
        isControlAccount: true,
        configurableKey: "accountsReceivable",
      },
      {
        code: "1200-INVENTORY",
        name: "Inventory",
        type: "asset",
        normalBalance: "debit",
        isControlAccount: true,
        configurableKey: "inventory",
      },
      {
        code: "1300-TAX-IN",
        name: "Input VAT",
        type: "asset",
        normalBalance: "debit",
        isControlAccount: true,
        configurableKey: "inputVat",
      },
    ],
  },
  {
    code: "2000-LIABILITIES",
    name: "Liabilities",
    type: "liability",
    normalBalance: "credit",
    allowPosting: false,
    children: [
      {
        code: "2100-AP",
        name: "Accounts Payable",
        type: "liability",
        normalBalance: "credit",
        isControlAccount: true,
        configurableKey: "accountsPayable",
      },
      {
        code: "2200-TAX-OUT",
        name: "Output VAT Payable",
        type: "liability",
        normalBalance: "credit",
        isControlAccount: true,
        configurableKey: "outputVatPayable",
      },
    ],
  },
  {
    code: "3000-EQUITY",
    name: "Equity",
    type: "equity",
    normalBalance: "credit",
    allowPosting: false,
    children: [
      {
        code: "3100-OWNER-CAPITAL",
        name: "Owner's Capital",
        type: "equity",
        normalBalance: "credit",
        configurableKey: "ownersCapital",
      },
      {
        code: "3200-RETAINED-EARNINGS",
        name: "Retained Earnings",
        type: "equity",
        normalBalance: "credit",
        configurableKey: "retainedEarnings",
      },
    ],
  },
  {
    code: "4000-INCOME",
    name: "Income",
    type: "income",
    normalBalance: "credit",
    allowPosting: false,
    children: [
      {
        code: "4100-SALES",
        name: "Sales Revenue",
        type: "income",
        normalBalance: "credit",
        configurableKey: "salesRevenue",
      },
      {
        code: "4200-DISC-RECEIVED",
        name: "Discounts Received",
        type: "income",
        normalBalance: "credit",
        configurableKey: "discountsReceived",
      },
      {
        code: "4300-INV-ADJ-GAIN",
        name: "Inventory Adjustment Gain",
        type: "income",
        normalBalance: "credit",
        configurableKey: "inventoryAdjustmentGain",
      },
    ],
  },
  {
    code: "5000-EXPENSES",
    name: "Expenses",
    type: "expense",
    normalBalance: "debit",
    allowPosting: false,
    children: [
      {
        code: "5100-PURCHASES",
        name: "Purchases",
        type: "expense",
        normalBalance: "debit",
        configurableKey: "purchases",
      },
      {
        code: "5200-COGS",
        name: "Cost of Goods Sold",
        type: "expense",
        normalBalance: "debit",
        configurableKey: "costOfGoodsSold",
      },
      {
        code: "5300-DISC-ALLOWED",
        name: "Discounts Allowed",
        type: "expense",
        normalBalance: "debit",
        configurableKey: "discountsAllowed",
      },
      {
        code: "5400-INV-ADJ-LOSS",
        name: "Inventory Adjustment Loss",
        type: "expense",
        normalBalance: "debit",
        configurableKey: "inventoryAdjustmentLoss",
      },
    ],
  },
];

class ChartOfAccountsService {
  constructor(pool) {
    if (!pool) {
      throw new Error("ChartOfAccountsService requires a mysql2/promise pool");
    }
    this.pool = pool;
  }

  static getDefaultAccountCodes() {
    return { ...DEFAULT_ACCOUNT_CODES };
  }

  static getDefaultAccountTree() {
    return JSON.parse(JSON.stringify(DEFAULT_ACCOUNT_TREE));
  }

  static getConfigurableAccountKeys() {
    return [
      "cashOnHand",
      "bank",
      "accountsReceivable",
      "inventory",
      "inputVat",
      "accountsPayable",
      "outputVatPayable",
      "salesRevenue",
      "purchases",
      "costOfGoodsSold",
      "discountsAllowed",
      "discountsReceived",
      "ownersCapital",
      "retainedEarnings",
    ];
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

  async withTransaction(work) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }

  async ensureBaseSchema() {
    await this.pool.execute(`
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
        UNIQUE KEY uq_chart_of_accounts_company_name (company_id, account_name),
        KEY idx_chart_of_accounts_company_type (company_id, account_type),
        KEY idx_chart_of_accounts_parent (parent_account_id)
      )
    `);
  }

  async seedDefaultAccountsForCompany(companyId) {
    if (!companyId) {
      throw new Error("companyId is required to seed chart of accounts");
    }

    await this.ensureBaseSchema();

    return this.withTransaction(async (conn) => {
      const codeToId = new Map();
      const insertedCodes = [];

      const upsertNode = async (node, parentId = null) => {
        const existing = await this.queryOne(
          conn,
          `SELECT id
             FROM chart_of_accounts
            WHERE company_id = ?
              AND account_code = ?
            LIMIT 1`,
          [companyId, node.code]
        );

        const id = existing?.id || crypto.randomUUID();

        await conn.execute(
          `INSERT INTO chart_of_accounts
            (id, company_id, parent_account_id, account_code, account_name, account_type, normal_balance,
             is_system, is_control_account, allow_posting, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             parent_account_id = VALUES(parent_account_id),
             account_name = VALUES(account_name),
             account_type = VALUES(account_type),
             normal_balance = VALUES(normal_balance),
             is_system = VALUES(is_system),
             is_control_account = VALUES(is_control_account),
             allow_posting = VALUES(allow_posting),
             is_active = VALUES(is_active),
             updated_at = CURRENT_TIMESTAMP`,
          [
            id,
            companyId,
            parentId,
            node.code,
            node.name,
            node.type,
            node.normalBalance,
            node.isControlAccount ? 1 : 0,
            node.allowPosting === false ? 0 : 1,
          ]
        );

        codeToId.set(node.code, id);
        insertedCodes.push(node.code);

        for (const child of node.children || []) {
          await upsertNode(child, id);
        }
      };

      for (const root of DEFAULT_ACCOUNT_TREE) {
        await upsertNode(root, null);
      }

      return {
        companyId,
        seededAccountCodes: insertedCodes,
        defaults: await this.getCompanyDefaultAccounts(companyId, conn),
      };
    });
  }

  async getCompanyDefaultAccounts(companyId, conn = null) {
    const codes = Object.values(DEFAULT_ACCOUNT_CODES);
    const placeholders = codes.map(() => "?").join(", ");
    const rows = await this.queryAll(
      conn,
      `SELECT id, company_id, parent_account_id, account_code, account_name, account_type,
              normal_balance, is_system, is_control_account, allow_posting, is_active
         FROM chart_of_accounts
        WHERE company_id = ?
          AND account_code IN (${placeholders})
        ORDER BY account_code ASC`,
      [companyId, ...codes]
    );

    const byCode = new Map(rows.map((row) => [row.account_code, row]));
    const defaults = {};
    for (const [key, code] of Object.entries(DEFAULT_ACCOUNT_CODES)) {
      defaults[key] = byCode.get(code) || null;
    }
    return defaults;
  }

  async getAccountTree(companyId, conn = null) {
    const rows = await this.queryAll(
      conn,
      `SELECT id, parent_account_id, account_code, account_name, account_type, normal_balance,
              is_control_account, allow_posting, is_active
         FROM chart_of_accounts
        WHERE company_id = ?
        ORDER BY account_code ASC`,
      [companyId]
    );

    const nodeMap = new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          children: [],
        },
      ])
    );

    const roots = [];
    for (const row of rows) {
      const node = nodeMap.get(row.id);
      if (row.parent_account_id && nodeMap.has(row.parent_account_id)) {
        nodeMap.get(row.parent_account_id).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }
}

module.exports = {
  ChartOfAccountsService,
  DEFAULT_ACCOUNT_CODES,
  DEFAULT_ACCOUNT_TREE,
};
