"use strict";

/**
 * Ensures a profile exists with is_admin=1 and the given password.
 * Uses root .env (same as index.js parent folder).
 *
 * Usage: node scripts/ensureAdmin.js [email] [password] [name]
 * Example: node scripts/ensureAdmin.js admin@finflow.com 123456 Admin
 */

const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

async function main() {
  const email = (process.argv[2] || "admin@finflow.com").toLowerCase().trim();
  const password = process.argv[3] || "123456";
  const name = (process.argv[4] || "Admin").trim();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    multipleStatements: true,
  });

  try {
    await conn.query("ALTER TABLE profiles ADD COLUMN is_admin TINYINT(1) DEFAULT 0").catch(() => {});
  } catch (_e) {
    /* column may already exist */
  }

  const hash = await bcrypt.hash(String(password).trim(), 10);

  const [existing] = await conn.execute("SELECT id FROM profiles WHERE email = ?", [email]);
  if (existing.length) {
    await conn.execute(
      "UPDATE profiles SET is_admin = 1, password_hash = ?, name = COALESCE(NULLIF(?, ''), name) WHERE email = ?",
      [hash, name, email]
    );
    console.log(`OK: updated ${email} — is_admin=1 and password set.`);
  } else {
    const id = crypto.randomUUID();
    await conn.execute(
      "INSERT INTO profiles (id, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
      [id, name, email, hash]
    );
    console.log(`OK: created admin ${email}.`);
  }

  await conn.end();
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
