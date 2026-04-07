"use strict";

/**
 * Seeds 10 demo tenant profiles with password login (no OTP / email verification flow).
 * Skips rhysmaharjan10@gmail.com — that account is never created or modified here.
 * Re-runs skip emails that already exist in `profiles`.
 *
 * Usage: npm run seed:dummy-tenants
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");

const { ChartOfAccountsService } = require("../services/chartOfAccountsService");
const { CounterpartyService } = require("../services/counterpartyService");
const { TaxService } = require("../services/taxService");
const { InventoryLedgerService } = require("../services/inventoryLedgerService");

dotenv.config({ path: path.join(__dirname, "../../.env") });

const EXCLUDED_EMAIL_LOWER = "rhysmaharjan10@gmail.com";
const SHARED_PASSWORD = "FinFlowDemo2026!";
const CREDENTIALS_FILE = path.join(__dirname, "dummy-tenant-credentials.json");

const newId = () => crypto.randomUUID();

const TENANT_BLUEPRINTS = [
  { email: "demo-tenant-01@finflow.local", name: "Asha Sharma", business: "Himalaya General Suppliers" },
  { email: "demo-tenant-02@finflow.local", name: "Bikash Thapa", business: "Pokhara Fresh Mart" },
  { email: "demo-tenant-03@finflow.local", name: "Chitra Gurung", business: "Everest Hardware & Tools" },
  { email: "demo-tenant-04@finflow.local", name: "Dipak K.C.", business: "Valley Electronics Nepal" },
  { email: "demo-tenant-05@finflow.local", name: "Elena Tamang", business: "GreenLeaf Agro Traders" },
  { email: "demo-tenant-06@finflow.local", name: "Firoz Ansari", business: "Metro Textiles & Garments" },
  { email: "demo-tenant-07@finflow.local", name: "Gita Maharjan", business: "Kathmandu Stationery House" },
  { email: "demo-tenant-08@finflow.local", name: "Hari Pradhan", business: "BuildRight Construction Supply" },
  { email: "demo-tenant-09@finflow.local", name: "Indira Basnet", business: "Sunrise Home & Kitchen" },
  { email: "demo-tenant-10@finflow.local", name: "Jeevan Rai", business: "Terai Grain & Oil Mills" },
];

/** At least 10 distinct products; opening qty kept high for demos */
const PRODUCT_CATALOG = [
  { name: "Organic Basmati Rice 25kg", sku: "DEMO-GRAIN-01", category: "Food", purchase: 3200, sell: 3890, openingQty: 220 },
  { name: "Cold-Pressed Mustard Oil 1L", sku: "DEMO-OIL-01", category: "Food", purchase: 285, sell: 350, openingQty: 380 },
  { name: "Whole Milk Powder 500g", sku: "DEMO-DAIRY-01", category: "Food", purchase: 420, sell: 495, openingQty: 310 },
  { name: "LED Bulb 12W (pack of 4)", sku: "DEMO-ELEC-01", category: "Electrical", purchase: 680, sell: 899, openingQty: 260 },
  { name: "Stainless Steel Cookware Set", sku: "DEMO-KIT-01", category: "Kitchen", purchase: 4500, sell: 5490, openingQty: 95 },
  { name: "Notebook A4 Ruled (10pc)", sku: "DEMO-STA-01", category: "Stationery", purchase: 320, sell: 450, openingQty: 500 },
  { name: "Cotton T-Shirt Unisex L", sku: "DEMO-APP-01", category: "Apparel", purchase: 450, sell: 790, openingQty: 400 },
  { name: "Galvanized Roofing Sheet", sku: "DEMO-BLD-01", category: "Building", purchase: 920, sell: 1150, openingQty: 180 },
  { name: "Fertilizer NPK 25kg", sku: "DEMO-AGR-01", category: "Agriculture", purchase: 2800, sell: 3250, openingQty: 150 },
  { name: "Dishwasher Liquid 2L", sku: "DEMO-HHM-01", category: "Household", purchase: 195, sell: 275, openingQty: 340 },
  { name: "Aluminium Laptop Stand", sku: "DEMO-ACC-01", category: "Electronics", purchase: 1200, sell: 1790, openingQty: 175 },
  { name: "Wooden Office Chair", sku: "DEMO-FUR-01", category: "Furniture", purchase: 8500, sell: 11200, openingQty: 72 },
];

const CUSTOMER_SEEDS = [
  { displayName: "Walk-in Retail", email: "walkin@example.com" },
  { displayName: "Corner Store Pokhara", email: "corner.pokhara@example.com" },
  { displayName: "Hotel Annapurna Supplies", email: "procurement.annapurna@example.com" },
];

const VENDOR_SEEDS = [
  { displayName: "National Wholesale Depot", email: "orders@nwd.example.com" },
  { displayName: "City Import House", email: "imports@cih.example.com" },
];

async function profileExists(pool, email) {
  const [rows] = await pool.execute(`SELECT id FROM profiles WHERE email = ? LIMIT 1`, [email]);
  return rows[0] || null;
}

async function seedOneTenant({
  pool,
  ils,
  counterpartyService,
  chartOfAccountsService,
  blueprint,
  passwordHash,
}) {
  const email = blueprint.email.trim().toLowerCase();
  if (email === EXCLUDED_EMAIL_LOWER) {
    return { skipped: true, reason: "excluded-email" };
  }

  const existing = await profileExists(pool, email);
  if (existing) {
    return { skipped: true, reason: "already-exists", profileId: existing.id };
  }

  const profileId = newId();
  const settingsId = newId();
  const kycId = newId();
  const taxCodeId = newId();

  await pool.execute(
    `INSERT INTO profiles (id, name, email, password_hash, business_name, company_name, address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      blueprint.name,
      email,
      passwordHash,
      blueprint.business,
      blueprint.business,
      "Demo address, Kathmandu, Nepal",
    ]
  );

  await pool.execute(
    `INSERT INTO company_settings (id, user_id, company_name, gst_number, address, currency, region)
     VALUES (?, ?, ?, ?, ?, 'NPR', 'Nepal')`,
    [settingsId, profileId, blueprint.business, `PAN-DEMO-${profileId.slice(0, 8)}`, "Demo billing address"]
  );

  await pool.execute(
    `INSERT INTO kyc_status (id, user_id, status, submitted_at, reviewed_at)
     VALUES (?, ?, 'approved', NOW(), NOW())
     ON DUPLICATE KEY UPDATE status = 'approved', reviewed_at = NOW(), updated_at = NOW()`,
    [kycId, profileId]
  );

  await pool.execute(
    `INSERT INTO tax_codes (id, company_id, user_id, code, name, tax_type, rate_percent, is_active)
     VALUES (?, ?, ?, 'VAT13', 'VAT 13%', 'vat', 13.0000, 1)
     ON DUPLICATE KEY UPDATE rate_percent = VALUES(rate_percent), is_active = 1, updated_at = CURRENT_TIMESTAMP`,
    [taxCodeId, profileId, profileId]
  );

  await chartOfAccountsService.seedDefaultAccountsForCompany(profileId);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const c of CUSTOMER_SEEDS) {
      const cp = await counterpartyService.createCounterparty(conn, {
        companyId: profileId,
        roleType: "customer",
        displayName: c.displayName,
        legalName: c.displayName,
        email: c.email,
      });
      await conn.execute(
        `INSERT INTO clients (id, user_id, linked_profile_id, counterparty_id, client_name, email)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [newId(), profileId, cp.id, cp.display_name, cp.email || c.email]
      );
    }

    for (const v of VENDOR_SEEDS) {
      const cp = await counterpartyService.createCounterparty(conn, {
        companyId: profileId,
        roleType: "vendor",
        displayName: v.displayName,
        legalName: v.displayName,
        email: v.email,
      });
      await conn.execute(
        `INSERT INTO vendors (id, user_id, linked_profile_id, counterparty_id, vendor_name, email)
         VALUES (?, ?, NULL, ?, ?, ?)`,
        [newId(), profileId, cp.id, cp.display_name, cp.email || v.email]
      );
    }

    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  const warehouseId = await ils.ensureDefaultWarehouse(profileId, newId);
  const primaryVendorName = VENDOR_SEEDS[0].displayName;

  for (const p of PRODUCT_CATALOG) {
    const item = await ils.findOrCreateItem({
      companyId: profileId,
      name: p.name,
      sku: p.sku,
      description: `${p.category} — demo SKU`,
      defaultPurchasePrice: p.purchase,
      defaultSellingPrice: p.sell,
      newId,
    });

    await ils.createOpeningBalance({
      companyId: profileId,
      itemId: item.id,
      quantity: p.openingQty,
      unitCost: p.purchase,
      warehouseId,
      createdByUserId: profileId,
      newId,
    });

    const invRowId = newId();
    await pool.execute(
      `INSERT INTO inventory
        (id, user_id, item_id, warehouse_id, linked_vendor_profile_id, vendor_product_id, product_name, sku, category, description,
         stock_quantity, purchase_price, selling_price, tax_rate, vendor_name, payment_type, linked_purchase_id)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, 13, ?, 'credit', NULL)`,
      [
        invRowId,
        profileId,
        item.id,
        warehouseId,
        p.name,
        p.sku,
        p.category,
        `${p.category} — demo SKU`,
        p.openingQty,
        p.purchase,
        p.sell,
        primaryVendorName,
      ]
    );
  }

  return {
    skipped: false,
    profileId,
    email,
    businessName: blueprint.business,
    displayName: blueprint.name,
  };
}

async function main() {
  const pool = mysqlPromise.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflow_smb",
    waitForConnections: true,
    connectionLimit: 5,
  });

  const counterpartyService = new CounterpartyService(pool, { idFactory: newId });
  const taxService = new TaxService(pool, { counterpartyService });
  const chartOfAccountsService = new ChartOfAccountsService(pool);

  const legacyConn = mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflow_smb",
  });

  await new Promise((resolve, reject) => {
    legacyConn.connect((err) => (err ? reject(err) : resolve()));
  });

  const ils = new InventoryLedgerService(legacyConn, { accountingEngine: null });

  try {
    await chartOfAccountsService.ensureBaseSchema();
    await counterpartyService.ensureSchema();
    await taxService.ensureSchema();
    await ils.ensureSchema();

    const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
    const results = [];
    const credentials = {
      generatedAt: new Date().toISOString(),
      sharedPassword: SHARED_PASSWORD,
      excludedFromSeeding: EXCLUDED_EMAIL_LOWER,
      note: "Demo tenants only. Rotate or delete before any production use.",
      tenants: [],
    };

    for (const blueprint of TENANT_BLUEPRINTS) {
      const r = await seedOneTenant({
        pool,
        ils,
        counterpartyService,
        chartOfAccountsService,
        blueprint,
        passwordHash,
      });
      results.push({ email: blueprint.email, ...r });
      if (!r.skipped && r.email) {
        credentials.tenants.push({
          email: r.email,
          password: SHARED_PASSWORD,
          name: r.displayName,
          businessName: r.businessName,
          profileId: r.profileId,
        });
      }
    }

    fs.writeFileSync(CREDENTIALS_FILE, `${JSON.stringify(credentials, null, 2)}\n`, "utf8");

    console.log("\n[seedDummyTenants] Done.");
    for (const r of results) {
      if (r.skipped) {
        console.log(`  SKIP ${r.email || "?"} — ${r.reason}${r.profileId ? ` (${r.profileId})` : ""}`);
      } else {
        console.log(`  OK   ${r.email}  (${r.businessName})`);
      }
    }
    console.log(`\nCredentials written to: ${CREDENTIALS_FILE}\n`);
  } finally {
    legacyConn.end();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[seedDummyTenants] FAILED:", err.message);
  process.exit(1);
});
