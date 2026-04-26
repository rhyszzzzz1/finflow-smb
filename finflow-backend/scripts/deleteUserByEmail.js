"use strict";

/**
 * Hard-delete a profile and tenant-scoped rows that block FK constraints.
 * Usage: node scripts/deleteUserByEmail.js <email>
 * Loads DB config from repo-root .env (same as index.js).
 */

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

const rootEnv = path.join(__dirname, "../../.env");
if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

const emailArg = process.argv[2];
if (!emailArg || !String(emailArg).includes("@")) {
  console.error("Usage: node scripts/deleteUserByEmail.js <email>");
  process.exit(1);
}

const email = String(emailArg).trim().toLowerCase();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    waitForConnections: true,
    connectionLimit: 1,
  });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(`SELECT id, email, name FROM profiles WHERE LOWER(TRIM(email)) = ? LIMIT 2`, [email]);
    if (!rows.length) {
      console.error(`No profile found for email: ${email}`);
      process.exitCode = 1;
      return;
    }
    if (rows.length > 1) {
      console.error("Multiple profiles matched; aborting.");
      process.exitCode = 1;
      return;
    }

    const { id: userId, name } = rows[0];
    console.log(`Deleting profile ${userId} (${rows[0].email}) name=${name || "-"}`);

    await conn.beginTransaction();

    // stock_movements: created_by_user_id -> profiles is ON DELETE RESTRICT
    const [sm] = await conn.execute(
      `DELETE FROM stock_movements WHERE company_id = ? OR created_by_user_id = ?`,
      [userId, userId]
    );
    console.log(`  stock_movements removed: ${sm.affectedRows ?? 0}`);

    await conn.execute(`DELETE FROM pending_signups WHERE LOWER(TRIM(email)) = ?`, [email]);

    const [del] = await conn.execute(`DELETE FROM profiles WHERE id = ?`, [userId]);
    if (!del.affectedRows) {
      throw new Error("DELETE profiles affected 0 rows");
    }

    await conn.commit();
    console.log("Done. Profile and cascading children removed (where MySQL CASCADE applies).");
  } catch (e) {
    await conn.rollback();
    console.error("Failed:", e.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

main();
