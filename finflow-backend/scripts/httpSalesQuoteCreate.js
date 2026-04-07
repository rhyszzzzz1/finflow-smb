"use strict";

/**
 * Hit the running Express app (same as browser) with a valid JWT and quote payload.
 * Requires: backend already listening (e.g. PORT 5000), .env with JWT_SECRET + DB.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const mysql = require("mysql2/promise");
const jwt = require("jsonwebtoken");

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-change-me";

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
  });
  const [pairs] = await pool.execute(
    "SELECT id AS client_id, user_id AS owner_id FROM clients LIMIT 1"
  );
  await pool.end();
  if (!pairs.length) {
    console.error("No clients row");
    process.exit(1);
  }
  const customerId = pairs[0].client_id;
  const actorUserId = pairs[0].owner_id;

  const token = jwt.sign(
    { id: actorUserId, email: "repro@local.test" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  const payload = {
    customer_id: customerId,
    quote_date: "2026-04-05",
    valid_until: "2026-04-05",
    notes: null,
    lines: [
      {
        description: "http repro",
        quantity: 1,
        ordered_quantity: 1,
        received_quantity: 1,
        unit_price: 1111,
      },
    ],
  };

  const url = `http://127.0.0.1:${PORT}/api/accounting/sales-quotes`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.text();
  console.log("HTTP", res.status, body.slice(0, 500));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
