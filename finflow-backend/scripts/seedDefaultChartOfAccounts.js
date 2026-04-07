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

    let targets = [];

    if (companyId) {
      targets = [{ id: companyId, legal_name: companyId }];
    } else {
      try {
        const [rows] = await pool.execute(`SELECT id, legal_name FROM companies ORDER BY legal_name ASC`);
        targets = rows;
      } catch (e) {
        if (e.code !== "ER_NO_SUCH_TABLE") throw e;
        console.warn("[COA_SEED] Table companies not found — falling back to profile-scoped company ids.");
      }

      if (!targets.length) {
        const [profiles] = await pool.execute(
          `SELECT id, COALESCE(business_name, name, email) AS label FROM profiles ORDER BY email ASC`
        );
        targets = profiles.map((p) => ({ id: p.id, legal_name: p.label || p.id }));
      }
    }

    if (!targets.length) {
      throw new Error(
        companyId
          ? `No seed target for company id: ${companyId}`
          : "No companies or profiles found. Sign up at least one user before seeding chart_of_accounts."
      );
    }

    for (const row of targets) {
      const result = await service.seedDefaultAccountsForCompany(row.id);
      console.log(
        `[COA_SEEDED] scope=${row.legal_name || row.id} id=${row.id} codes=${result.seededAccountCodes.length}`
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
