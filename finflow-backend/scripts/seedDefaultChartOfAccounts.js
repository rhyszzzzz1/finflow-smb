"use strict";

const path = require("path");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");
const { ChartOfAccountsService } = require("../services/chartOfAccountsService");

dotenv.config({ path: path.join(__dirname, "../../.env") });

async function main() {
  const companyIdArg = process.argv.find((arg) => arg.startsWith("--company-id="));
  const companyId = companyIdArg ? companyIdArg.split("=")[1] : null;

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflow_smb",
    waitForConnections: true,
    connectionLimit: 5,
  });

  try {
    const service = new ChartOfAccountsService(pool);

    const [companyRows] = companyId
      ? await pool.execute(`SELECT id, legal_name FROM companies WHERE id = ?`, [companyId])
      : await pool.execute(`SELECT id, legal_name FROM companies ORDER BY legal_name ASC`);

    if (!companyRows.length) {
      throw new Error(
        companyId
          ? `Company not found: ${companyId}`
          : "No companies found. Create or backfill companies before seeding chart_of_accounts."
      );
    }

    for (const company of companyRows) {
      const result = await service.seedDefaultAccountsForCompany(company.id);
      console.log(
        `[COA_SEEDED] company=${company.legal_name || company.id} codes=${result.seededAccountCodes.length}`
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[COA_SEED_ERROR]", error.message);
  process.exit(1);
});
