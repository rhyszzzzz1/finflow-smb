"use strict";

/**
 * End-to-end repro: create a sales quote using real MySQL + same pool instrumentation as index.js.
 * Run: node scripts/reproSalesQuoteCreate.js
 */

const path = require("path");
const crypto = require("crypto");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const mysql = require("mysql2/promise");
const { instrumentMysqlPromiseExecutable } = require("../utils/sqlParams");
const { instrumentLegacyWriteGuards } = require("../utils/legacyWriteGuard");
const { CounterpartyService } = require("../services/counterpartyService");
const { AccountingControlService } = require("../services/accountingControlService");
const { SalesQuoteService } = require("../services/salesQuoteService");
const { AuditService } = require("../services/auditService");
const { BusinessRelationshipService } = require("../services/businessRelationshipService");

const newId = () => crypto.randomUUID();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    waitForConnections: true,
    connectionLimit: 2,
  });

  instrumentMysqlPromiseExecutable(pool);
  instrumentLegacyWriteGuards(pool, () => ({ origin: "reproSalesQuoteCreate", operation: "test" }));

  const counterpartyService = new CounterpartyService(pool, { idFactory: newId });
  const accountingControlService = new AccountingControlService(pool, {
    counterpartyService,
    allowSoftLockedBackdatedPosting: false,
  });
  const salesOrderStub = {
    async createFromQuote() {
      throw new Error("stub");
    },
  };
  const auditService = new AuditService(pool, { idFactory: newId });
  const businessRelationshipService = new BusinessRelationshipService(pool, { idFactory: newId });
  const salesQuoteService = new SalesQuoteService(pool, {
    counterpartyService,
    accountingControlService,
    salesOrderService: salesOrderStub,
    businessRelationshipService,
    auditService,
    idFactory: newId,
  });

  await salesQuoteService.ensureSchema();
  await accountingControlService.ensureSchema();
  await counterpartyService.ensureSchema();
  await auditService.ensureSchema();
  await businessRelationshipService.ensureSchema();

  const conn = await pool.getConnection();
  let actorUserId;
  let customerId;
  try {
    const [pairs] = await conn.execute(
      "SELECT id AS client_id, user_id AS owner_id FROM clients LIMIT 1"
    );
    if (!pairs.length) {
      console.error("No clients in DB — cannot repro (need at least one clients row).");
      process.exit(1);
    }
    customerId = pairs[0].client_id;
    actorUserId = pairs[0].owner_id;
  } finally {
    conn.release();
  }

  const payload = {
    customer_id: customerId,
    quote_date: "2026-04-05",
    valid_until: "2026-04-05",
    notes: null,
    lines: [
      {
        description: "repro line",
        quantity: 1,
        ordered_quantity: 1,
        received_quantity: 1,
        unit_price: 1111,
      },
    ],
  };

  console.log("Creating draft as user", actorUserId, "client", customerId);
  const created = await salesQuoteService.createDraft(actorUserId, payload, {});
  console.log("OK quote_no=", created.quote_no, "id=", created.id);
  await pool.end();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
