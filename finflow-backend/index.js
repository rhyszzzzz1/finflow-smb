// ============================================================
// FinFlow SMB - Express Backend Server
// Port: 5000 | DB: MySQL (XAMPP/MariaDB)
// ============================================================
const express = require("express");
const mysql = require("mysql2");
const mysqlPromise = require("mysql2/promise");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { InventoryLedgerService } = require("./services/inventoryLedgerService");
const { AccountingEngine } = require("./services/accountingEngine");
const { JournalService } = require("./services/journalService");
const { InvoicePurchaseService } = require("./services/invoicePurchaseService");
const { AccountingReportsService } = require("./services/accountingReportsService");
const { SalesInvoiceService } = require("./services/salesInvoiceService");
const { PurchaseBillService } = require("./services/purchaseBillService");
const { SettlementService } = require("./services/settlementService");
const { TaxService } = require("./services/taxService");
const { AccountingControlService } = require("./services/accountingControlService");
const { AuditService } = require("./services/auditService");
const { PaymentModel } = require("./models/paymentModel");
const { PaymentService } = require("./services/paymentService");
const { PaymentController } = require("./controllers/paymentController");
const { SalesInvoiceController } = require("./controllers/salesInvoiceController");
const { PurchaseBillController } = require("./controllers/purchaseBillController");
const { InventoryController } = require("./controllers/inventoryController");
const { InventoryRepository } = require("./repositories/inventoryRepository");
const { InventoryService } = require("./services/inventoryService");
const { createPaymentRoutes } = require("./routes/paymentRoutes");
const { createSalesInvoiceRoutes } = require("./routes/salesInvoiceRoutes");
const { createPurchaseBillRoutes } = require("./routes/purchaseBillRoutes");
const { createInventoryRoutes } = require("./routes/inventoryRoutes");
const { createAuditRequestMiddleware } = require("./middleware/auditRequestMiddleware");

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET;
const OTP_EXPIRY_MINUTES = parseInt(process.env.SIGNUP_OTP_EXPIRY_MINUTES || "10", 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:8081,http://localhost:8080,http://localhost:5173,http://127.0.0.1:8081,http://127.0.0.1:8080,http://127.0.0.1:5173";
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || "gmail";
const SMTP_HOST = process.env.SMTP_HOST || (EMAIL_PROVIDER === "gmail" ? "smtp.gmail.com" : "");
const SMTP_PORT = parseInt(process.env.SMTP_PORT || (EMAIL_PROVIDER === "gmail" ? "587" : "587"), 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || process.env.GMAIL_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || "";

if (NODE_ENV === "production") {
    const required = ["JWT_SECRET", "DB_HOST", "DB_USER", "DB_NAME", "CORS_ORIGIN"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
}

if (!JWT_SECRET) {
    console.warn("[SECURITY_WARN] JWT_SECRET is not set. Set JWT_SECRET before production deployment.");
}

// ── Middleware ─────────────────────────────────────────────
const allowedOrigins = CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("CORS origin not allowed"));
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve KYC uploads
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ── Multer ─────────────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `kyc_${req.user ? req.user.id : "anon"}_${Date.now()}${ext}`);
    },
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /\.(jpe?g|png|pdf)$/i.test(file.originalname);
        cb(ok ? null : new Error("Only JPEG, PNG and PDF files allowed"), ok);
    },
});

// ── UUID Helper ────────────────────────────────────────────
function newId() {
    return crypto.randomUUID();
}

function hashOtp(otp) {
    return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function safeJson(value) {
    try {
        return JSON.stringify(value ?? null);
    } catch (_e) {
        return JSON.stringify({ error: "non-serializable" });
    }
}

function getRequestMeta(req) {
    return req.requestMeta || {
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        route: req.originalUrl || req.path || null,
        method: req.method || null,
        requestBody: req.body || null,
    };
}

function extractUserIdFromToken(req) {
    const auth = req.headers["authorization"];
    const token = auth && auth.split(" ")[1];
    if (!token || !JWT_SECRET) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded?.id || null;
    } catch (_e) {
        return null;
    }
}

function isEmailDeliveryConfigured() {
    return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM);
}

function getEmailConfigStatus() {
    return {
        configured: isEmailDeliveryConfigured(),
        provider: EMAIL_PROVIDER,
        host: SMTP_HOST || null,
        port: SMTP_PORT || null,
        secure: SMTP_SECURE,
        from: SMTP_FROM || null,
        missing: [
            !SMTP_HOST ? "SMTP_HOST" : null,
            !SMTP_USER ? (process.env.GMAIL_USER ? "GMAIL_APP_PASSWORD" : "SMTP_USER") : null,
            !SMTP_PASS ? (process.env.GMAIL_USER ? "GMAIL_APP_PASSWORD" : "SMTP_PASS") : null,
            !SMTP_FROM ? "SMTP_FROM" : null,
        ].filter(Boolean),
    };
}

function createMailer() {
    if (!isEmailDeliveryConfigured()) {
        throw new Error("Email delivery is not configured. Configure Gmail with GMAIL_USER and GMAIL_APP_PASSWORD, or set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.");
    }

    return nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
}

async function sendSignupOtpEmail(email, name, otp) {
    const transporter = createMailer();

    await transporter.sendMail({
        from: SMTP_FROM,
        to: email,
        subject: "Your FinFlow signup verification code",
        text: [
            `Hello ${name || "there"},`,
            "",
            `Your FinFlow verification code is: ${otp}`,
            `This code will expire in ${OTP_EXPIRY_MINUTES} minutes.`,
            "",
            "If you did not request this, you can ignore this email.",
        ].join("\n"),
    });
}

// ── MySQL Connection ───────────────────────────────────────
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    multipleStatements: true,
});

const accountingPool = mysqlPromise.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
});
const dbPromise = db.promise();

const accountingEngine = new AccountingEngine(accountingPool);
const auditService = new AuditService(accountingPool, { idFactory: newId });
const accountingControlService = new AccountingControlService(accountingPool, {
    allowSoftLockedBackdatedPosting: String(process.env.ALLOW_SOFT_LOCKED_BACKDATED_POSTING || "false").toLowerCase() === "true",
});
const journalService = new JournalService(accountingPool, {
    accountingControlService,
    auditService,
});
const taxService = new TaxService(accountingPool);
const inventoryLedgerService = new InventoryLedgerService(db, { accountingEngine });
const invoicePurchaseService = new InvoicePurchaseService(db);
const salesInvoiceService = new SalesInvoiceService(accountingPool, {
    journalService,
    taxService,
    accountingControlService,
    inventoryLedgerService,
    auditService,
    idFactory: newId,
});
const purchaseBillService = new PurchaseBillService(accountingPool, {
    journalService,
    taxService,
    accountingControlService,
    inventoryLedgerService,
    auditService,
    idFactory: newId,
});
const settlementService = new SettlementService(accountingPool, {
    journalService,
    accountingControlService,
    auditService,
    idFactory: newId,
});
const accountingReportsService = new AccountingReportsService(db);
const paymentModel = new PaymentModel(settlementService);
const paymentService = new PaymentService(paymentModel, newId);
const paymentController = new PaymentController(paymentService);
const salesInvoiceController = new SalesInvoiceController(salesInvoiceService);
const purchaseBillController = new PurchaseBillController(purchaseBillService);
const inventoryRepository = new InventoryRepository(dbPromise);
const inventoryService = new InventoryService({
    inventoryRepository,
    inventoryLedgerService,
    idFactory: newId,
});
const inventoryController = new InventoryController(inventoryService, auditService);
const paymentRoutes = createPaymentRoutes({ authenticate, paymentController });
const salesInvoiceRoutes = createSalesInvoiceRoutes({ authenticate, salesInvoiceController });
const purchaseBillRoutes = createPurchaseBillRoutes({ authenticate, purchaseBillController });
const inventoryRoutes = createInventoryRoutes({ authenticate, inventoryController });

db.connect((err) => {
    if (err) {
        console.error("❌ MySQL connection failed:", err.message);
        process.exit(1);
    }
    console.log("✅ Connected to MySQL");
    initDB();
});

// ── Auth Middleware ────────────────────────────────────────
function authenticate(req, res, next) {
    const auth = req.headers["authorization"];
    const token = auth && auth.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (!err && decoded) {
            req.user = decoded;
            return next();
        }
        return res.status(401).json({ message: "Invalid or expired token" });
    });
}

// ── Admin Middleware ───────────────────────────────────────
function authenticateAdmin(req, res, next) {
    const auth = req.headers["authorization"];
    const token = auth && auth.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err || !decoded) return res.status(401).json({ message: "Invalid or expired token" });
        if (!decoded.is_admin) return res.status(403).json({ message: "Admin privileges required" });
        req.user = decoded;
        return next();
    });
}

// ── DB Init ────────────────────────────────────────────────
function initDB() {
    const sql = `
    CREATE TABLE IF NOT EXISTS profiles (
      id            VARCHAR(36)  PRIMARY KEY,
      name          VARCHAR(100),
      email         VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      company_name  VARCHAR(255),
      gst_number    VARCHAR(50),
      address       TEXT,
      business_name VARCHAR(255),
      is_admin      TINYINT(1)   DEFAULT 0,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS kyc_status (
      id               VARCHAR(36) PRIMARY KEY,
      user_id          VARCHAR(36) NOT NULL UNIQUE,
      status           ENUM('pending','approved','rejected') DEFAULT 'pending',
      rejection_reason TEXT,
      submitted_at     TIMESTAMP NULL DEFAULT NULL,
      reviewed_at      TIMESTAMP NULL DEFAULT NULL,
      reviewed_by      VARCHAR(36),
      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS kyc_documents (
      id            VARCHAR(36)  PRIMARY KEY,
      user_id       VARCHAR(36)  NOT NULL,
      document_type VARCHAR(100) NOT NULL,
      file_name     VARCHAR(255) NOT NULL,
      file_path     VARCHAR(500) NOT NULL,
      file_size     INT,
      mime_type     VARCHAR(100),
      uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS inventory (
      id             VARCHAR(36)    PRIMARY KEY,
      user_id        VARCHAR(36)    NOT NULL,
      linked_vendor_profile_id VARCHAR(36),
      vendor_product_id VARCHAR(36),
      linked_purchase_id VARCHAR(36),
      product_name   VARCHAR(255)   NOT NULL,
      sku            VARCHAR(100)   NOT NULL,
      category       VARCHAR(100),
      description    TEXT,
      stock_quantity INT            NOT NULL DEFAULT 0,
      purchase_price DECIMAL(12,2)  NOT NULL,
      selling_price  DECIMAL(12,2)  NOT NULL,
      tax_rate       DECIMAL(5,2)   DEFAULT 18,
      vendor_name    VARCHAR(255),
      payment_type   ENUM('cash','credit') DEFAULT 'cash',
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
      UNIQUE KEY unique_sku_per_user (user_id, sku)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id          VARCHAR(36)  PRIMARY KEY,
      user_id     VARCHAR(36)  NOT NULL,
      linked_profile_id VARCHAR(36),
      client_name VARCHAR(255) NOT NULL,
      email       VARCHAR(255),
      phone       VARCHAR(20),
      address     TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vendors (
      id          VARCHAR(36)  PRIMARY KEY,
      user_id     VARCHAR(36)  NOT NULL,
      linked_profile_id VARCHAR(36),
      vendor_name VARCHAR(255) NOT NULL,
      email       VARCHAR(255),
      phone       VARCHAR(20),
      address     TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS vendor_products (
      id            VARCHAR(36)   PRIMARY KEY,
      user_id       VARCHAR(36)   NOT NULL,
      product_name  VARCHAR(255)  NOT NULL,
      sku           VARCHAR(100)  NOT NULL,
      category      VARCHAR(100),
      description   TEXT,
      selling_price DECIMAL(12,2) NOT NULL,
      tax_rate      DECIMAL(5,2)  DEFAULT 18,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
      UNIQUE KEY unique_vendor_product_sku (user_id, sku)
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id           VARCHAR(36)   PRIMARY KEY,
      user_id      VARCHAR(36)   NOT NULL,
      invoice_no   VARCHAR(50)   NOT NULL,
      client_name  VARCHAR(255)  NOT NULL,
      amount       DECIMAL(14,2) NOT NULL,
      tax_amount   DECIMAL(14,2) DEFAULT 0,
      total_amount DECIMAL(14,2) NOT NULL,
      status       ENUM('pending','paid','overdue','cancelled') DEFAULT 'pending',
      invoice_date DATE          NOT NULL,
      due_date     DATE          NOT NULL,
      payment_date DATE,
      notes        TEXT,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS receivables (
      id          VARCHAR(36)   PRIMARY KEY,
      user_id     VARCHAR(36)   NOT NULL,
      client_name VARCHAR(255)  NOT NULL,
      invoice_id  VARCHAR(50),
      amount      DECIMAL(14,2) NOT NULL,
      due_date    DATE          NOT NULL,
      status      ENUM('pending','paid','overdue') DEFAULT 'pending',
      days_overdue INT DEFAULT 0,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payables (
      id           VARCHAR(36)   PRIMARY KEY,
      user_id      VARCHAR(36)   NOT NULL,
      vendor_name  VARCHAR(255)  NOT NULL,
      invoice_id   VARCHAR(50),
      amount       DECIMAL(14,2) NOT NULL,
      due_date     DATE          NOT NULL,
      status       ENUM('pending','paid','overdue') DEFAULT 'pending',
      days_overdue INT DEFAULT 0,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sales (
      id         VARCHAR(36)   PRIMARY KEY,
      user_id    VARCHAR(36)   NOT NULL,
      client_name VARCHAR(255) NOT NULL,
      amount     DECIMAL(14,2) NOT NULL,
      sale_date  DATE          NOT NULL,
      notes      TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id             VARCHAR(36)   PRIMARY KEY,
      user_id        VARCHAR(36)   NOT NULL,
      vendor_name    VARCHAR(255)  NOT NULL,
      product_name   VARCHAR(255)  NOT NULL,
      quantity       INT           NOT NULL DEFAULT 1,
      amount         DECIMAL(14,2) NOT NULL,
      purchase_date  DATE          NOT NULL,
      payment_type   ENUM('cash','credit') DEFAULT 'cash',
      payment_status ENUM('paid','pending') DEFAULT 'pending',
      notes          TEXT,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS company_settings (
      id           VARCHAR(36)  PRIMARY KEY,
      user_id      VARCHAR(36)  NOT NULL UNIQUE,
      company_name VARCHAR(255),
      gst_number   VARCHAR(50),
      address      TEXT,
      currency     VARCHAR(10)  DEFAULT 'NPR',
      region       VARCHAR(50)  DEFAULT 'Nepal',
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_roles (
      id         VARCHAR(36) PRIMARY KEY,
      user_id    VARCHAR(36) NOT NULL UNIQUE,
      role       VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pending_signups (
      email          VARCHAR(255) PRIMARY KEY,
      name           VARCHAR(100),
      password_hash  VARCHAR(255) NOT NULL,
      business_name  VARCHAR(255),
      otp_hash       VARCHAR(255) NOT NULL,
      otp_expires_at DATETIME NOT NULL,
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id             VARCHAR(36) PRIMARY KEY,
            user_id        VARCHAR(36) NULL,
            http_method    VARCHAR(10) NOT NULL,
            endpoint       VARCHAR(255) NOT NULL,
            status_code    INT NOT NULL,
            request_body   JSON NULL,
            created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL,
            KEY idx_audit_user_date (user_id, created_at)
        );
  `;
    db.query(sql, (err) => {
        if (err) console.error("? DB init error:", err.message);
        else {
            db.query("ALTER TABLE clients ADD COLUMN IF NOT EXISTS linked_profile_id VARCHAR(36) NULL", () => { });
            db.query("ALTER TABLE vendors ADD COLUMN IF NOT EXISTS linked_profile_id VARCHAR(36) NULL", () => { });
            db.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS linked_vendor_profile_id VARCHAR(36) NULL", () => { });
            db.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS vendor_product_id VARCHAR(36) NULL", () => { });
            db.query("ALTER TABLE inventory ADD COLUMN IF NOT EXISTS linked_purchase_id VARCHAR(36) NULL", () => { });
            db.query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status ENUM('draft','posted','void') NOT NULL DEFAULT 'posted'", () => { });
            db.query("ALTER TABLE purchases ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL", () => { });
            db.query("ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL", () => { });
            settlementService.ensureSchema().catch((schemaErr) => {
                console.error("[SETTLEMENT_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            inventoryLedgerService.ensureSchema().catch((schemaErr) => {
                console.error("[INVENTORY_LEDGER_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            invoicePurchaseService.ensureSchema().catch((schemaErr) => {
                console.error("[INVOICE_PURCHASE_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            auditService.ensureSchema().catch((schemaErr) => {
                console.error("[AUDIT_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            accountingControlService.ensureSchema().catch((schemaErr) => {
                console.error("[ACCOUNTING_CONTROL_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            journalService.ensureSchema().catch((schemaErr) => {
                console.error("[JOURNAL_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            taxService.ensureSchema().catch((schemaErr) => {
                console.error("[TAX_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            salesInvoiceService.ensureSchema().catch((schemaErr) => {
                console.error("[SALES_INVOICE_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            purchaseBillService.ensureSchema().catch((schemaErr) => {
                console.error("[PURCHASE_BILL_SCHEMA_INIT_ERROR]", schemaErr.message);
            });
            console.log("? Database tables ready");
        }
    });
}

app.use(createAuditRequestMiddleware(auditService, {
    resolveActorUserId: extractUserIdFromToken,
}));

app.get("/api/system/email-status", (_req, res) => {
    res.json(getEmailConfigStatus());
});

app.get("/api/accounts/registered", authenticate, (req, res) => {
    db.query(
        `SELECT id, name, email, business_name
         FROM profiles
         WHERE id <> ? AND is_admin = 0
         ORDER BY COALESCE(business_name, name, email) ASC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.use("/api", paymentRoutes);
app.use("/api/accounting", salesInvoiceRoutes);
app.use("/api/accounting", purchaseBillRoutes);
app.use("/api", inventoryRoutes);

// ===========================================================
// DATA MANAGEMENT
// ===========================================================

// Clear financial data for the logged-in user
app.delete("/api/data/clear-financials", authenticate, (req, res) => {
    auditService.logAction({
        actorUserId: req.user.id,
        companyId: req.user.id,
        entityType: "financial_data",
        actionType: "delete_attempt",
        reason: "Attempted use of disabled clear-financials endpoint",
        ipAddress: getRequestMeta(req).ipAddress,
        userAgent: getRequestMeta(req).userAgent,
        route: getRequestMeta(req).route,
        method: getRequestMeta(req).method,
    }).catch(() => { });
    res.status(410).json({ message: "Endpoint disabled in production-hardening mode" });
});

// ===========================================================
// AUTH ROUTES
// ===========================================================

// ── Register / Signup ──────────────────────────────────────
// Seed 10 default clients + 10 vendors for a brand-new user
function handleRegister(req, res) {
    const { name, email, password, businessName } = req.body;
    console.log(`[REGISTER] email=${email}`);

    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required" });

    if (!isEmailDeliveryConfigured()) {
        return res.status(500).json({
            message: "Signup email verification is not configured on the server. Configure Gmail with GMAIL_USER and GMAIL_APP_PASSWORD, or set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.",
        });
    }

    const normalEmail = email.toLowerCase().trim();
    const displayName = (name || normalEmail.split("@")[0]).trim();
    const otp = generateOtp();
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    db.query("SELECT id FROM profiles WHERE email = ?", [normalEmail], (checkErr, rows) => {
        if (checkErr) {
            console.error("[REGISTER] lookup error:", checkErr.message);
            return res.status(500).json({ message: "Could not start signup verification" });
        }

        if (rows.length) {
            return res.status(400).json({ message: "Email already registered" });
        }

        bcrypt.hash(String(password).trim(), 10, async (hashErr, passwordHash) => {
            if (hashErr) {
                console.error("[REGISTER] bcrypt error:", hashErr.message);
                return res.status(500).json({ message: "Could not start signup verification" });
            }

            try {
                await sendSignupOtpEmail(normalEmail, displayName, otp);
            } catch (mailErr) {
                console.error("[REGISTER] email error:", mailErr.message);
                return res.status(500).json({ message: mailErr.message || "Failed to send verification email" });
            }

            db.query(
                `INSERT INTO pending_signups (email, name, password_hash, business_name, otp_hash, otp_expires_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   name = VALUES(name),
                   password_hash = VALUES(password_hash),
                   business_name = VALUES(business_name),
                   otp_hash = VALUES(otp_hash),
                   otp_expires_at = VALUES(otp_expires_at)`,
                [normalEmail, displayName, passwordHash, businessName || null, otpHash, expiresAt],
                (saveErr) => {
                    if (saveErr) {
                        console.error("[REGISTER] pending signup error:", saveErr.message);
                        return res.status(500).json({ message: "Could not start signup verification" });
                    }

                    return res.status(200).json({
                        message: "Verification code sent to your email address",
                        requiresVerification: true,
                        email: normalEmail,
                    });
                }
            );
        });
    });
}

function handleVerifySignupOtp(req, res) {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalEmail = String(email).toLowerCase().trim();

    db.query("SELECT * FROM pending_signups WHERE email = ?", [normalEmail], (pendingErr, rows) => {
        if (pendingErr) {
            console.error("[VERIFY-OTP] lookup error:", pendingErr.message);
            return res.status(500).json({ message: "Verification failed" });
        }

        if (!rows.length) {
            return res.status(400).json({ message: "No pending signup found for this email" });
        }

        const pendingSignup = rows[0];
        const expiresAt = new Date(pendingSignup.otp_expires_at);

        if (expiresAt.getTime() < Date.now()) {
            return res.status(400).json({ message: "OTP has expired. Please request a new code." });
        }

        if (hashOtp(otp) !== pendingSignup.otp_hash) {
            return res.status(400).json({ message: "Invalid OTP" });
        }

        const id = newId();

        db.query(
            "INSERT INTO profiles (id, name, email, password_hash, business_name) VALUES (?, ?, ?, ?, ?)",
            [id, pendingSignup.name, normalEmail, pendingSignup.password_hash, pendingSignup.business_name || null],
            (insertErr) => {
                if (insertErr) {
                    console.error("[VERIFY-OTP] create user error:", insertErr.message);
                    if (insertErr.code === "ER_DUP_ENTRY") {
                        return res.status(400).json({ message: "Email already registered" });
                    }
                    return res.status(500).json({ message: "Could not create account" });
                }

                db.query(
                    "INSERT IGNORE INTO kyc_status (id, user_id, submitted_at) VALUES (?, ?, NOW())",
                    [newId(), id],
                    () => { }
                );

                db.query("DELETE FROM pending_signups WHERE email = ?", [normalEmail], () => { });

                const token = jwt.sign({ id, email: normalEmail }, JWT_SECRET, { expiresIn: "7d" });
                return res.status(201).json({
                    message: "Account created successfully",
                    token,
                    user: { id, name: pendingSignup.name, email: normalEmail },
                });
            }
        );
    });
}

function handleLogin(req, res) {
    const { email, password } = req.body;
    console.log(`[LOGIN] attempt email=${email}`);
    const requestMeta = getRequestMeta(req);

    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required" });

    const normalEmail = email.toLowerCase().trim();

    db.query(
        "SELECT * FROM profiles WHERE email = ?",
        [normalEmail],
        (dbErr, rows) => {
            if (dbErr) {
                console.error("[LOGIN] DB error:", dbErr.message);
                return res.status(500).json({ message: "Login error" });
            }

            console.log(`[LOGIN] found ${rows.length} row(s) for ${normalEmail}`);

            if (!rows.length) {
                auditService.logAction({
                    entityType: "auth_session",
                    actionType: "login",
                    reason: "Invalid credentials",
                    newValues: { email: normalEmail, outcome: "invalid_email" },
                    ipAddress: requestMeta.ipAddress,
                    userAgent: requestMeta.userAgent,
                    route: requestMeta.route,
                    method: requestMeta.method,
                    statusCode: 401,
                }).catch(() => { });
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const user = rows[0];

            bcrypt.compare(String(password).trim(), user.password_hash, (cmpErr, match) => {
                if (cmpErr) {
                    console.error("[LOGIN] bcrypt error:", cmpErr.message);
                    return res.status(500).json({ message: "Login error" });
                }

                console.log(`[LOGIN] password match=${match}`);

                if (!match) {
                    auditService.logAction({
                        actorUserId: user.id,
                        companyId: user.id,
                        entityType: "auth_session",
                        entityId: user.id,
                        actionType: "login",
                        reason: "Invalid credentials",
                        newValues: { email: normalEmail, outcome: "invalid_password" },
                        ipAddress: requestMeta.ipAddress,
                        userAgent: requestMeta.userAgent,
                        route: requestMeta.route,
                        method: requestMeta.method,
                        statusCode: 401,
                    }).catch(() => { });
                    return res.status(401).json({ message: "Invalid credentials" });
                }

                const token = jwt.sign(
                    { id: user.id, email: user.email },
                    JWT_SECRET,
                    { expiresIn: "7d" }
                );
                console.log(`[LOGIN] ✅ success ${normalEmail}`);
                auditService.logAction({
                    actorUserId: user.id,
                    companyId: user.id,
                    entityType: "auth_session",
                    entityId: user.id,
                    actionType: "login",
                    reason: "User login successful",
                    newValues: { email: user.email, outcome: "success", is_admin: !!user.is_admin },
                    ipAddress: requestMeta.ipAddress,
                    userAgent: requestMeta.userAgent,
                    route: requestMeta.route,
                    method: requestMeta.method,
                    statusCode: 200,
                }).catch(() => { });
                res.json({
                    message: "Login successful",
                    token,
                    user: { id: user.id, name: user.name, email: user.email, is_admin: user.is_admin },
                });
            });
        }
    );
}

// Register both URL patterns (api.ts uses /api/login, AuthContext uses /api/auth/login)
app.post("/api/register", handleRegister); // api.ts
app.post("/api/auth/signup", handleRegister); // AuthContext
app.post("/api/verify-signup-otp", handleVerifySignupOtp);
app.post("/api/auth/verify-signup-otp", handleVerifySignupOtp);

app.post("/api/login", handleLogin);    // api.ts
app.post("/api/auth/login", handleLogin);    // AuthContext

// ===========================================================
// VENDOR PRODUCT CATALOG
// ===========================================================

app.get("/api/vendor-products/mine", authenticate, (req, res) => {
    db.query(
        "SELECT * FROM vendor_products WHERE user_id = ? ORDER BY product_name ASC",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/vendor-products", authenticate, (req, res) => {
    const { product_name, sku, category, description, selling_price, tax_rate } = req.body;

    if (!product_name || !sku || selling_price === undefined) {
        return res.status(400).json({ message: "product_name, sku and selling_price are required" });
    }

    const id = newId();
    db.query(
        `INSERT INTO vendor_products
         (id, user_id, product_name, sku, category, description, selling_price, tax_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            req.user.id,
            product_name,
            sku,
            category || null,
            description || null,
            parseFloat(selling_price),
            tax_rate === undefined ? 18 : parseFloat(tax_rate),
        ],
        (err) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(400).json({ message: "SKU already exists in your catalog" });
                }
                return res.status(500).json({ message: err.message });
            }

            db.query("SELECT * FROM vendor_products WHERE id = ?", [id], (_e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/vendor-products/:id", authenticate, (req, res) => {
    const { product_name, sku, category, description, selling_price, tax_rate } = req.body;

    if (!product_name || !sku || selling_price === undefined) {
        return res.status(400).json({ message: "product_name, sku and selling_price are required" });
    }

    db.query(
        `UPDATE vendor_products
         SET product_name=?, sku=?, category=?, description=?, selling_price=?, tax_rate=?, updated_at=NOW()
         WHERE id=? AND user_id=?`,
        [
            product_name,
            sku,
            category || null,
            description || null,
            parseFloat(selling_price),
            tax_rate === undefined ? 18 : parseFloat(tax_rate),
            req.params.id,
            req.user.id,
        ],
        (err, result) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY") {
                    return res.status(400).json({ message: "SKU already exists in your catalog" });
                }
                return res.status(500).json({ message: err.message });
            }
            if (!result.affectedRows) return res.status(404).json({ message: "Catalog product not found" });
            db.query("SELECT * FROM vendor_products WHERE id = ?", [req.params.id], (_e, rows) => res.json(rows[0]));
        }
    );
});

app.delete("/api/vendor-products/:id", authenticate, (req, res) => {
    db.query(
        "DELETE FROM vendor_products WHERE id=? AND user_id=?",
        [req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Catalog product not found" });
            res.json({ message: "Catalog product deleted" });
        }
    );
});

app.get("/api/vendors/:linkedProfileId/products", authenticate, (req, res) => {
    const linkedProfileId = req.params.linkedProfileId;

    db.query(
        `SELECT vendor_name
         FROM vendors
         WHERE user_id = ? AND linked_profile_id = ?`,
        [req.user.id, linkedProfileId],
        (vendorErr, vendorRows) => {
            if (vendorErr) return res.status(500).json({ message: vendorErr.message });
            if (!vendorRows.length) return res.status(404).json({ message: "Vendor link not found" });

            db.query(
                `SELECT vp.*, ? AS vendor_name, ? AS linked_profile_id
                 FROM vendor_products vp
                 WHERE vp.user_id = ?
                 ORDER BY vp.product_name ASC`,
                [vendorRows[0].vendor_name, linkedProfileId, linkedProfileId],
                (err, rows) => {
                    if (err) return res.status(500).json({ message: err.message });
                    res.json(rows);
                }
            );
        }
    );
});

// ===========================================================
// INVENTORY
// ===========================================================

app.get("/api/inventory", authenticate, (req, res) => {
    db.query(
        "SELECT * FROM inventory WHERE user_id = ? ORDER BY created_at DESC",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.get("/api/stock/balances", authenticate, async (req, res) => {
    try {
        const rows = await inventoryLedgerService.getStockBalances(req.user.id);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/items", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM items WHERE company_id=? AND is_active=1 ORDER BY name ASC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/items", authenticate, async (req, res) => {
    try {
        const { name, sku, description, default_purchase_price, default_selling_price } = req.body;
        if (!name) return res.status(400).json({ message: "name is required" });

        const item = await inventoryLedgerService.findOrCreateItem({
            companyId: req.user.id,
            name,
            sku: sku || null,
            description: description || null,
            defaultPurchasePrice: Number(default_purchase_price || 0),
            defaultSellingPrice: Number(default_selling_price || 0),
            newId,
        });

        res.status(201).json(item);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.get("/api/warehouses", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM warehouses WHERE company_id=? AND is_active=1 ORDER BY is_default DESC, name ASC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/warehouses", authenticate, (req, res) => {
    const { name, code } = req.body;
    if (!name || !code) return res.status(400).json({ message: "name and code are required" });

    const id = newId();
    db.query(
        `INSERT INTO warehouses (id, company_id, name, code, is_default, is_active)
         VALUES (?, ?, ?, ?, 0, 1)`,
        [id, req.user.id, name, code],
        (err) => {
            if (err) return res.status(400).json({ message: err.message });
            db.query("SELECT * FROM warehouses WHERE id=?", [id], (_e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.post("/api/stock/adjustment", authenticate, async (req, res) => {
    try {
        const { item_id, quantity_delta, unit_cost, reason } = req.body;
        if (!item_id || quantity_delta === undefined) {
            return res.status(400).json({ message: "item_id and quantity_delta are required" });
        }

        const result = await inventoryLedgerService.applyAdjustment({
            companyId: req.user.id,
            itemId: item_id,
            quantityDelta: Number(quantity_delta),
            unitCost: unit_cost === undefined ? null : Number(unit_cost),
            reason: reason || "Manual inventory adjustment",
            createdByUserId: req.user.id,
            newId,
        });

        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post("/api/stock/transfer", authenticate, async (req, res) => {
    try {
        const { item_id, from_warehouse_id, to_warehouse_id, quantity, unit_cost, reason } = req.body;
        if (!item_id || !from_warehouse_id || !to_warehouse_id || !quantity) {
            return res.status(400).json({ message: "item_id, from_warehouse_id, to_warehouse_id and quantity are required" });
        }

        const result = await inventoryLedgerService.applyTransfer({
            companyId: req.user.id,
            itemId: item_id,
            fromWarehouseId: from_warehouse_id,
            toWarehouseId: to_warehouse_id,
            quantity: Number(quantity),
            unitCost: unit_cost === undefined ? null : Number(unit_cost),
            reason: reason || "Warehouse transfer",
            createdByUserId: req.user.id,
            newId,
        });

        res.status(201).json(result);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post("/api/inventory", authenticate, (req, res) => {
    const { linked_vendor_profile_id, vendor_product_id, stock_quantity, purchase_price, selling_price, payment_type } = req.body;

    if (!linked_vendor_profile_id || !vendor_product_id || purchase_price === undefined || selling_price === undefined) {
        return res.status(400).json({ message: "linked_vendor_profile_id, vendor_product_id, purchase_price and selling_price are required" });
    }

    db.query(
        `SELECT vendor_name
         FROM vendors
         WHERE user_id = ? AND linked_profile_id = ?`,
        [req.user.id, linked_vendor_profile_id],
        (vendorErr, vendorRows) => {
            if (vendorErr) return res.status(500).json({ message: vendorErr.message });
            if (!vendorRows.length) return res.status(400).json({ message: "Select a linked vendor account first" });

            db.query(
                `SELECT *
                 FROM vendor_products
                 WHERE id = ? AND user_id = ?`,
                [vendor_product_id, linked_vendor_profile_id],
                (productErr, productRows) => {
                    if (productErr) return res.status(500).json({ message: productErr.message });
                    if (!productRows.length) return res.status(400).json({ message: "Selected product is not available from that vendor" });

                    const vendorProduct = productRows[0];
                    const invId = newId();
                    const qty = parseInt(stock_quantity, 10) || 0;
                    const pType = payment_type || "cash";
                    const today = new Date().toISOString().slice(0, 10);
                    const totalCost = parseFloat(purchase_price) * qty;
                    const purchaseId = qty > 0 ? newId() : null;

                    db.query(
                        `INSERT INTO inventory
                         (id, user_id, linked_vendor_profile_id, vendor_product_id, linked_purchase_id,
                          product_name, sku, category, description, stock_quantity,
                          purchase_price, selling_price, tax_rate, vendor_name, payment_type)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            invId,
                            req.user.id,
                            linked_vendor_profile_id,
                            vendor_product_id,
                            purchaseId,
                            vendorProduct.product_name,
                            vendorProduct.sku,
                            vendorProduct.category || null,
                            vendorProduct.description || null,
                            qty,
                            parseFloat(purchase_price),
                            parseFloat(selling_price),
                            vendorProduct.tax_rate === undefined ? 18 : parseFloat(vendorProduct.tax_rate),
                            vendorRows[0].vendor_name,
                            pType,
                        ],
                        (err) => {
                            if (err) {
                                if (err.code === "ER_DUP_ENTRY") {
                                    return res.status(400).json({ message: "This product is already in your inventory" });
                                }
                                return res.status(500).json({ message: err.message });
                            }

                            if (purchaseId) {
                                const paidStatus = pType === "cash" ? "paid" : "pending";
                                db.query(
                                    `INSERT INTO purchases
                                     (id, user_id, vendor_name, product_name, quantity, amount,
                                      purchase_date, payment_type, payment_status)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        purchaseId,
                                        req.user.id,
                                        vendorRows[0].vendor_name,
                                        vendorProduct.product_name,
                                        qty,
                                        totalCost,
                                        today,
                                        pType,
                                        paidStatus,
                                    ],
                                    (pErr) => { if (pErr) console.error("[AUTO-PURCHASE]", pErr.message); }
                                );

                            }

                            db.query("SELECT * FROM inventory WHERE id = ?", [invId], (_e, rows) => res.status(201).json(rows[0]));
                        }
                    );
                }
            );
        }
    );
});

app.put("/api/inventory/:id", authenticate, (req, res) => {
    const { linked_vendor_profile_id, vendor_product_id, stock_quantity, purchase_price, selling_price, payment_type } = req.body;

    if (!linked_vendor_profile_id || !vendor_product_id || purchase_price === undefined || selling_price === undefined) {
        return res.status(400).json({ message: "linked_vendor_profile_id, vendor_product_id, purchase_price and selling_price are required" });
    }

    db.query(
        `SELECT vendor_name
         FROM vendors
         WHERE user_id = ? AND linked_profile_id = ?`,
        [req.user.id, linked_vendor_profile_id],
        (vendorErr, vendorRows) => {
            if (vendorErr) return res.status(500).json({ message: vendorErr.message });
            if (!vendorRows.length) return res.status(400).json({ message: "Select a linked vendor account first" });

            db.query(
                `SELECT *
                 FROM vendor_products
                 WHERE id = ? AND user_id = ?`,
                [vendor_product_id, linked_vendor_profile_id],
                (productErr, productRows) => {
                    if (productErr) return res.status(500).json({ message: productErr.message });
                    if (!productRows.length) return res.status(400).json({ message: "Selected product is not available from that vendor" });

                    const vendorProduct = productRows[0];

                    db.query(
                        `UPDATE inventory
                         SET linked_vendor_profile_id=?, vendor_product_id=?, product_name=?, sku=?, category=?, description=?,
                             stock_quantity=?, purchase_price=?, selling_price=?, tax_rate=?, vendor_name=?, payment_type=?, updated_at=NOW()
                         WHERE id=? AND user_id=?`,
                        [
                            linked_vendor_profile_id,
                            vendor_product_id,
                            vendorProduct.product_name,
                            vendorProduct.sku,
                            vendorProduct.category || null,
                            vendorProduct.description || null,
                            parseInt(stock_quantity, 10) || 0,
                            parseFloat(purchase_price),
                            parseFloat(selling_price),
                            vendorProduct.tax_rate === undefined ? 18 : parseFloat(vendorProduct.tax_rate),
                            vendorRows[0].vendor_name,
                            payment_type || "cash",
                            req.params.id,
                            req.user.id,
                        ],
                        (err, result) => {
                            if (err) {
                                if (err.code === "ER_DUP_ENTRY") {
                                    return res.status(400).json({ message: "This product is already in your inventory" });
                                }
                                return res.status(500).json({ message: err.message });
                            }
                            if (!result.affectedRows) return res.status(404).json({ message: "Item not found" });
                            db.query("SELECT * FROM inventory WHERE id = ?", [req.params.id], (_e, rows) => res.json(rows[0]));
                        }
                    );
                }
            );
        }
    );
});

app.delete("/api/inventory/:id", authenticate, (req, res) => {
    auditService.logAction({
        actorUserId: req.user.id,
        companyId: req.user.id,
        entityType: "inventory_item",
        entityId: req.params.id,
        actionType: "delete_attempt",
        reason: "Legacy inventory hard delete blocked",
        ipAddress: getRequestMeta(req).ipAddress,
        userAgent: getRequestMeta(req).userAgent,
        route: getRequestMeta(req).route,
        method: getRequestMeta(req).method,
    }).catch(() => { });
    return res.status(409).json({ message: "Inventory items cannot be hard deleted. Use stock adjustments or deactivate the item instead." });
});

app.post("/api/inventory", authenticate, (req, res) => {
    const { product_name, sku, category, description, stock_quantity,
        purchase_price, selling_price, tax_rate, vendor_name, payment_type } = req.body;

    if (!product_name || !sku || purchase_price === undefined || selling_price === undefined)
        return res.status(400).json({ message: "product_name, sku, purchase_price and selling_price are required" });

    const invId = newId();
    const qty = parseInt(stock_quantity) || 0;
    const pType = payment_type || "cash";
    const today = new Date().toISOString().slice(0, 10);
    const totalCost = parseFloat(purchase_price) * qty;
    const vName = vendor_name || "Unknown Vendor";

    db.query(
        `INSERT INTO inventory
      (id, user_id, product_name, sku, category, description, stock_quantity,
       purchase_price, selling_price, tax_rate, vendor_name, payment_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invId, req.user.id, product_name, sku, category || null, description || null,
            qty, purchase_price, selling_price, tax_rate || 18, vName, pType],
        (err) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY")
                    return res.status(400).json({ message: "SKU already exists for this account" });
                return res.status(500).json({ message: err.message });
            }

            // ── AUTO: upsert vendor into vendors table ──
            if (vName !== "Unknown Vendor") {
                db.query(
                    `INSERT IGNORE INTO vendors (id, user_id, vendor_name)
                     SELECT ?, ?, ? WHERE NOT EXISTS
                     (SELECT 1 FROM vendors WHERE user_id=? AND vendor_name=?)`,
                    [newId(), req.user.id, vName, req.user.id, vName], () => { }
                );
            }

            // ── AUTO: create purchase record ──
            if (qty > 0) {
                const purchaseId = newId();
                const paidStatus = pType === "cash" ? "paid" : "pending";
                db.query(
                    `INSERT INTO purchases
                     (id, user_id, vendor_name, product_name, quantity, amount,
                      purchase_date, payment_type, payment_status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [purchaseId, req.user.id, vName,
                        product_name, qty, totalCost, today, pType, paidStatus],
                    (pErr) => { if (pErr) console.error("[AUTO-PURCHASE]", pErr.message); }
                );

            }

            db.query("SELECT * FROM inventory WHERE id = ?", [invId], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/inventory/:id", authenticate, (req, res) => {
    const { product_name, sku, category, description, stock_quantity,
        purchase_price, selling_price, tax_rate, vendor_name, payment_type } = req.body;
    db.query(
        `UPDATE inventory
     SET product_name=?, sku=?, category=?, description=?, stock_quantity=?,
         purchase_price=?, selling_price=?, tax_rate=?, vendor_name=?, payment_type=?, updated_at=NOW()
     WHERE id=? AND user_id=?`,
        [product_name, sku, category || null, description || null, stock_quantity,
            purchase_price, selling_price, tax_rate, vendor_name || null, payment_type || "cash",
            req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Item not found" });
            db.query("SELECT * FROM inventory WHERE id = ?", [req.params.id], (e, rows) => res.json(rows[0]));
        }
    );
});

app.delete("/api/inventory/:id", authenticate, (req, res) => {
    auditService.logAction({
        actorUserId: req.user.id,
        companyId: req.user.id,
        entityType: "inventory_item",
        entityId: req.params.id,
        actionType: "delete_attempt",
        reason: "Legacy inventory hard delete blocked",
        ipAddress: getRequestMeta(req).ipAddress,
        userAgent: getRequestMeta(req).userAgent,
        route: getRequestMeta(req).route,
        method: getRequestMeta(req).method,
    }).catch(() => { });
    return res.status(409).json({ message: "Inventory items cannot be hard deleted. Use stock adjustments or deactivate the item instead." });
});

// ===========================================================
// INVOICES
// ===========================================================

app.get("/api/invoices", authenticate, (req, res) => {
    db.query(
        "SELECT * FROM invoices WHERE user_id = ? AND status!='cancelled' ORDER BY created_at DESC",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/invoices", authenticate, (req, res) => {
    const { invoice_no, client_name, amount, tax_amount, total_amount,
        status, invoice_date, due_date, notes, items } = req.body;

    if (!invoice_no || !client_name || !amount || !due_date)
        return res.status(400).json({ message: "invoice_no, client_name, amount and due_date are required" });

    const id = newId();
    const finalStatus = status || "pending";
    const finalTotal = parseFloat(total_amount || amount);
    const today = new Date().toISOString().slice(0, 10);

    db.query(
        `INSERT INTO invoices
      (id, user_id, invoice_no, client_name, amount, tax_amount, total_amount,
       status, invoice_date, due_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.id, invoice_no, client_name, amount, tax_amount || 0,
            finalTotal, finalStatus, invoice_date || today, due_date, notes || null],
        async (err) => {
            if (err) return res.status(500).json({ message: err.message });

            try {
                if (Array.isArray(items) && items.length) {
                    await inventoryLedgerService.applySaleIssue({
                        companyId: req.user.id,
                        invoiceId: id,
                        lines: items,
                        createdByUserId: req.user.id,
                        newId,
                        costingMethod: "weighted_average",
                    });
                }
            } catch (stockErr) {
                db.query("UPDATE invoices SET status='cancelled', deleted_at=NOW() WHERE id=? AND user_id=?", [id, req.user.id], () => {
                    return res.status(400).json({ message: stockErr.message });
                });
                return;
            }

            db.query("SELECT * FROM invoices WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/invoices/:id", authenticate, (req, res) => {
    const invoiceId = req.params.id;
    const userId = req.user.id;
    const { invoice_no, client_name, amount, tax_amount, total_amount,
        status, invoice_date, due_date, payment_date, notes } = req.body;
    const finalTotal = parseFloat(total_amount || amount);

    db.query(
        `UPDATE invoices
         SET invoice_no=?, client_name=?, amount=?, tax_amount=?, total_amount=?,
             status=?, invoice_date=?, due_date=?, payment_date=?, notes=?, updated_at=NOW()
         WHERE id=? AND user_id=?`,
        [invoice_no, client_name, amount, tax_amount || 0, finalTotal,
            status, invoice_date, due_date, payment_date || null, notes || null,
            invoiceId, userId],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Invoice not found" });
            db.query("SELECT * FROM invoices WHERE id = ?", [invoiceId], (e, rows) => res.json(rows[0]));
        }
    );
});

app.delete("/api/invoices/:id", authenticate, (req, res) => {
    db.query(
        "UPDATE invoices SET status='cancelled', deleted_at=NOW(), updated_at=NOW() WHERE id=? AND user_id=? AND status!='paid'",
        [req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Invoice not found" });
            res.json({ message: "Invoice cancelled" });
        }
    );
});

// ===========================================================
// SALES
// ===========================================================

app.get("/api/sales", authenticate, (req, res) => {
    db.query("SELECT * FROM sales WHERE user_id = ? ORDER BY sale_date DESC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.post("/api/sales", authenticate, (req, res) => {
    const { client_name, amount, sale_date, notes } = req.body;
    if (!client_name || !amount)
        return res.status(400).json({ message: "client_name and amount are required" });

    const id = newId();
    const today = new Date().toISOString().slice(0, 10);

    db.query(
        "INSERT INTO sales (id, user_id, client_name, amount, sale_date, notes) VALUES (?, ?, ?, ?, ?, ?)",
        [id, req.user.id, client_name, amount, sale_date || today, notes || null],
        (err) => {
            if (err) return res.status(500).json({ message: err.message });
            db.query("SELECT * FROM sales WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

// ===========================================================
// PURCHASES
// ===========================================================

app.get("/api/purchases", authenticate, (req, res) => {
    db.query("SELECT * FROM purchases WHERE user_id = ? AND COALESCE(status,'posted')!='void' ORDER BY purchase_date DESC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.post("/api/purchases", authenticate, (req, res) => {
    const { vendor_name, product_name, quantity, amount, purchase_date,
        payment_type, payment_status, notes, sku } = req.body;
    if (!vendor_name || !product_name || !amount)
        return res.status(400).json({ message: "vendor_name, product_name and amount are required" });

    const id = newId();
    const pType = payment_type || "cash";
    const pStat = pType === "cash" ? "paid" : (payment_status || "pending");
    const today = new Date().toISOString().slice(0, 10);

    db.query(
        `INSERT INTO purchases
      (id, user_id, vendor_name, product_name, quantity, amount, purchase_date,
       payment_type, payment_status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, req.user.id, vendor_name, product_name, quantity || 1, amount,
            purchase_date || today, pType, pStat, notes || null],
        async (err) => {
            if (err) return res.status(500).json({ message: err.message });

            try {
                await inventoryLedgerService.applyPurchaseReceipt({
                    companyId: req.user.id,
                    productName: product_name,
                    sku: sku || null,
                    quantity: Number(quantity || 1),
                    totalAmount: Number(amount),
                    purchaseId: id,
                    createdByUserId: req.user.id,
                    newId,
                });
            } catch (stockErr) {
                db.query("UPDATE purchases SET status='void', deleted_at=NOW() WHERE id=? AND user_id=?", [id, req.user.id], () => {
                    return res.status(400).json({ message: stockErr.message });
                });
                return;
            }

            db.query("SELECT * FROM purchases WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

// ===========================================================
// V2 SALES INVOICES / PURCHASE BILLS (LINE ITEM MODELS)
// ===========================================================

app.post("/api/v2/sales-invoices", authenticate, async (req, res) => {
    res.status(410).json({ message: "Legacy /api/v2 sales invoice draft endpoint disabled. Use /api/accounting/sales-invoices instead." });
});

app.post("/api/v2/purchase-bills", authenticate, async (req, res) => {
    res.status(410).json({ message: "Legacy /api/v2 purchase bill draft endpoint disabled. Use /api/accounting/purchase-bills instead." });
});

app.post("/api/v2/sales-invoices/:id/post", authenticate, async (req, res) => {
    res.status(410).json({ message: "Legacy /api/v2 sales invoice posting endpoint disabled. Use /api/accounting/sales-invoices/:id/post instead." });
});

app.post("/api/v2/purchase-bills/:id/post", authenticate, async (req, res) => {
    res.status(410).json({ message: "Legacy /api/v2 purchase bill posting endpoint disabled. Use /api/accounting/purchase-bills/:id/post instead." });
});

app.get("/api/v2/sales-invoices", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM sales_invoice_headers WHERE user_id=? ORDER BY created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.get("/api/v2/sales-invoices/:id/lines", authenticate, (req, res) => {
    db.query(
        `SELECT l.*
         FROM sales_invoice_lines l
         JOIN sales_invoice_headers h ON h.id = l.sales_invoice_id
         WHERE h.user_id=? AND h.id=?
         ORDER BY l.line_order ASC`,
        [req.user.id, req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.get("/api/v2/purchase-bills", authenticate, (req, res) => {
    db.query(
        `SELECT * FROM purchase_bill_headers WHERE user_id=? ORDER BY created_at DESC`,
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.get("/api/v2/purchase-bills/:id/lines", authenticate, (req, res) => {
    db.query(
        `SELECT l.*
         FROM purchase_bill_lines l
         JOIN purchase_bill_headers h ON h.id = l.purchase_bill_id
         WHERE h.user_id=? AND h.id=?
         ORDER BY l.line_order ASC`,
        [req.user.id, req.params.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.delete("/api/purchases/:id", authenticate, (req, res) => {
    db.query(
        "UPDATE purchases SET status='void', deleted_at=NOW() WHERE id=? AND user_id=?",
        [req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Not found" });

            res.json({ message: "Purchase voided" });
        }
    );
});

// ===========================================================
// REPORTS
// ===========================================================

app.get("/api/reports", authenticate, (req, res) => {
    if (req.query.export || req.query.format) {
        auditService.logAction({
            actorUserId: req.user.id,
            companyId: req.user.id,
            entityType: "report",
            actionType: "export",
            reason: "Report export requested",
            newValues: { report: "summary", query: req.query },
            ipAddress: getRequestMeta(req).ipAddress,
            userAgent: getRequestMeta(req).userAgent,
            route: getRequestMeta(req).route,
            method: getRequestMeta(req).method,
        }).catch(() => { });
    }
    const uid = req.user.id;
    const year = req.query.year || new Date().getFullYear();

    const q = {
        totalRevenue: `SELECT COALESCE(SUM(amount),0) AS val FROM sales WHERE user_id=?`,
        totalExpenses: `SELECT COALESCE(SUM(amount),0) AS val FROM purchases WHERE user_id=? AND COALESCE(status,'posted')!='void'`,
        grossProfit: `SELECT COALESCE(SUM(amount),0)-0 AS val FROM sales WHERE user_id=?`,
                totalReceivables: `SELECT COALESCE(SUM(x.outstanding),0) AS val
                                                     FROM (
                                                         SELECT (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding
                                                         FROM invoices i
                                                         LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id
                                                         LEFT JOIN payments p ON p.id=pa.payment_id
                                                         WHERE i.user_id=?
                                                         GROUP BY i.id, i.total_amount
                                                     ) x
                                                     WHERE x.outstanding > 0`,
                totalPayables: `SELECT COALESCE(SUM(x.outstanding),0) AS val
                                                FROM (
                                                    SELECT (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding
                                                    FROM purchases pu
                                                    LEFT JOIN payment_allocations pa ON pa.purchase_id=pu.id
                                                    LEFT JOIN payments p ON p.id=pa.payment_id
                                                    WHERE pu.user_id=? AND COALESCE(pu.status,'posted')!='void'
                                                    GROUP BY pu.id, pu.amount
                                                ) x
                                                WHERE x.outstanding > 0`,
                overdueRec: `SELECT COUNT(*) AS val
                                         FROM (
                                             SELECT i.id,
                                                            (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding,
                                                            i.due_date
                                             FROM invoices i
                                             LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id
                                             LEFT JOIN payments p ON p.id=pa.payment_id
                                             WHERE i.user_id=?
                                             GROUP BY i.id, i.total_amount, i.due_date
                                         ) r
                                         WHERE r.outstanding > 0 AND r.due_date < CURDATE()`,
                overduePay: `SELECT COUNT(*) AS val
                                         FROM (
                                             SELECT pu.id,
                                                            (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding,
                                                            pu.purchase_date
                                             FROM purchases pu
                                             LEFT JOIN payment_allocations pa ON pa.purchase_id=pu.id
                                             LEFT JOIN payments p ON p.id=pa.payment_id
                                             WHERE pu.user_id=? AND COALESCE(pu.status,'posted')!='void'
                                             GROUP BY pu.id, pu.amount, pu.purchase_date
                                         ) p
                                         WHERE p.outstanding > 0 AND p.purchase_date < CURDATE()`,
                totalInventoryValue: `SELECT COALESCE(SUM(s.qty * s.wac),0) AS val
                                                            FROM (
                                                                SELECT
                                                                    sm.item_id,
                                                                    COALESCE(SUM(sm.quantity_delta),0) AS qty,
                                                                    COALESCE(
                                                                        CASE
                                                                            WHEN SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END) > 0
                                                                            THEN SUM(CASE WHEN sm.quantity_delta > 0 THEN COALESCE(sm.total_cost, sm.unit_cost * sm.quantity_delta, 0) ELSE 0 END)
                                                                                     / SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END)
                                                                            ELSE 0
                                                                        END,
                                                                        0
                                                                    ) AS wac
                                                                FROM stock_movements sm
                                                                WHERE sm.company_id=?
                                                                GROUP BY sm.item_id
                                                            ) s`,
        invoiceCount: `SELECT COUNT(*) AS val FROM invoices WHERE user_id=?`,
        paidInvoices: `SELECT COUNT(*) AS val FROM invoices WHERE user_id=? AND status='paid'`,
    };

    const results = {};
    const keys = Object.keys(q);
    let done = 0;

    keys.forEach(key => {
        db.query(q[key], [uid], (err, rows) => {
            results[key] = err ? 0 : rows[0].val;
            if (++done === keys.length) {
                // Monthly breakdown
                db.query(
                    `SELECT DATE_FORMAT(sale_date,'%b') AS month,
                            COALESCE(SUM(amount),0) AS revenue
                     FROM sales WHERE user_id=? AND YEAR(sale_date)=?
                     GROUP BY MONTH(sale_date), DATE_FORMAT(sale_date,'%b')
                     ORDER BY MONTH(sale_date)`,
                    [uid, year],
                    (rErr, revRows) => {
                        db.query(
                            `SELECT DATE_FORMAT(purchase_date,'%b') AS month,
                                    COALESCE(SUM(amount),0) AS expenses
                             FROM purchases WHERE user_id=? AND YEAR(purchase_date)=?
                             GROUP BY MONTH(purchase_date), DATE_FORMAT(purchase_date,'%b')
                             ORDER BY MONTH(purchase_date)`,
                            [uid, year],
                            (eErr, expRows) => {
                                // Top clients by revenue
                                db.query(
                                    `SELECT client_name, COALESCE(SUM(amount),0) AS total
                                     FROM sales WHERE user_id=?
                                     GROUP BY client_name ORDER BY total DESC LIMIT 5`,
                                    [uid],
                                    (cErr, clientRows) => {
                                        res.json({
                                            summary: {
                                                totalRevenue: parseFloat(results.totalRevenue) || 0,
                                                totalExpenses: parseFloat(results.totalExpenses) || 0,
                                                grossProfit: (parseFloat(results.totalRevenue) || 0) - (parseFloat(results.totalExpenses) || 0),
                                                totalReceivables: parseFloat(results.totalReceivables) || 0,
                                                totalPayables: parseFloat(results.totalPayables) || 0,
                                                overdueReceivables: parseInt(results.overdueRec) || 0,
                                                overduePayables: parseInt(results.overduePay) || 0,
                                                totalInventoryValue: parseFloat(results.totalInventoryValue) || 0,
                                                invoiceCount: parseInt(results.invoiceCount) || 0,
                                                paidInvoices: parseInt(results.paidInvoices) || 0,
                                            },
                                            monthlyRevenue: rErr ? [] : (revRows || []),
                                            monthlyExpenses: eErr ? [] : (expRows || []),
                                            topClients: cErr ? [] : (clientRows || []),
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        });
    });
});

// ===========================================================
// ACCOUNTING REPORTS (JOURNAL-DRIVEN)
// ===========================================================

app.get("/api/reports/trial-balance", authenticate, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const report = await accountingReportsService.trialBalance(req.user.id, start_date, end_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/profit-loss", authenticate, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const report = await accountingReportsService.profitAndLoss(req.user.id, start_date, end_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/balance-sheet", authenticate, async (req, res) => {
    try {
        const { as_of_date } = req.query;
        const report = await accountingReportsService.balanceSheet(req.user.id, as_of_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/ar-aging", authenticate, async (req, res) => {
    try {
        const { as_of_date } = req.query;
        const report = await accountingReportsService.arAging(req.user.id, as_of_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/ap-aging", authenticate, async (req, res) => {
    try {
        const { as_of_date } = req.query;
        const report = await accountingReportsService.apAging(req.user.id, as_of_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/customers/:customerId/statement", authenticate, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const report = await accountingReportsService.customerStatement(req.user.id, req.params.customerId, start_date, end_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/vendors/:vendorId/statement", authenticate, async (req, res) => {
    try {
        const { start_date, end_date } = req.query;
        const report = await accountingReportsService.vendorStatement(req.user.id, req.params.vendorId, start_date, end_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/stock-summary", authenticate, async (req, res) => {
    try {
        const { as_of_date } = req.query;
        const report = await accountingReportsService.stockSummary(req.user.id, as_of_date);
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.get("/api/reports/stock-ledger/:itemId", authenticate, async (req, res) => {
    try {
        const { warehouse_id, start_date, end_date } = req.query;
        const report = await accountingReportsService.stockLedger(
            req.user.id,
            req.params.itemId,
            warehouse_id || null,
            start_date || null,
            end_date || null
        );
        res.json(report);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ===========================================================
// DASHBOARD STATS
// ===========================================================

app.get("/api/dashboard/stats", authenticate, (req, res) => {
    const uid = req.user.id;

    const queries = {
        totalSales: "SELECT COALESCE(SUM(amount),0) AS val FROM sales WHERE user_id=?",
                pendingReceivables: `SELECT COALESCE(SUM(x.outstanding),0) AS val
                                                         FROM (
                                                             SELECT (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding
                                                             FROM invoices i
                                                             LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id
                                                             LEFT JOIN payments p ON p.id=pa.payment_id
                                                             WHERE i.user_id=? AND i.status!='cancelled'
                                                             GROUP BY i.id, i.total_amount
                                                         ) x
                                                         WHERE x.outstanding > 0`,
                pendingReceivablesCount: `SELECT COUNT(*) AS val
                                                                    FROM (
                                                                        SELECT i.id,
                                                                                     (i.total_amount - COALESCE(SUM(CASE WHEN p.type='incoming' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding
                                                                        FROM invoices i
                                                                        LEFT JOIN payment_allocations pa ON pa.invoice_id=i.id
                                                                        LEFT JOIN payments p ON p.id=pa.payment_id
                                                                        WHERE i.user_id=? AND i.status!='cancelled'
                                                                        GROUP BY i.id, i.total_amount
                                                                    ) x
                                                                    WHERE x.outstanding > 0`,
                outstandingPayables: `SELECT COALESCE(SUM(x.outstanding),0) AS val
                                                            FROM (
                                                                SELECT (pu.amount - COALESCE(SUM(CASE WHEN p.type='outgoing' AND p.status='posted' THEN pa.allocated_amount ELSE 0 END),0)) AS outstanding
                                                                FROM purchases pu
                                                                LEFT JOIN payment_allocations pa ON pa.purchase_id=pu.id
                                                                LEFT JOIN payments p ON p.id=pa.payment_id
                                                                WHERE pu.user_id=? AND COALESCE(pu.status,'posted')!='void'
                                                                GROUP BY pu.id, pu.amount
                                                            ) x
                                                            WHERE x.outstanding > 0`,
                inventoryValue: `SELECT COALESCE(SUM(s.qty * s.wac),0) AS val
                                                 FROM (
                                                     SELECT sm.item_id,
                                                                    COALESCE(SUM(sm.quantity_delta),0) AS qty,
                                                                    COALESCE(
                                                                        CASE
                                                                            WHEN SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END) > 0
                                                                            THEN SUM(CASE WHEN sm.quantity_delta > 0 THEN COALESCE(sm.total_cost, sm.unit_cost * sm.quantity_delta, 0) ELSE 0 END)
                                                                                     / SUM(CASE WHEN sm.quantity_delta > 0 THEN sm.quantity_delta ELSE 0 END)
                                                                            ELSE 0
                                                                        END,
                                                                        0
                                                                    ) AS wac
                                                     FROM stock_movements sm
                                                     WHERE sm.company_id=?
                                                     GROUP BY sm.item_id
                                                 ) s`,
        inventoryCount: "SELECT COUNT(*) AS val FROM inventory WHERE user_id=?",
    };

    const results = {};
    const keys = Object.keys(queries);
    let done = 0;

    keys.forEach((key) => {
        db.query(queries[key], [uid], (err, rows) => {
            results[key] = err ? 0 : rows[0].val;
            if (++done === keys.length) {
                // Monthly sales aggregation (last 6 months)
                db.query(
                    `SELECT DATE_FORMAT(sale_date, '%b %Y') AS month,
                            COALESCE(SUM(amount), 0) AS sales
                     FROM sales
                     WHERE user_id = ?
                       AND sale_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
                     GROUP BY DATE_FORMAT(sale_date, '%Y-%m')
                     ORDER BY MIN(sale_date) ASC`,
                    [uid],
                    (mErr, monthRows) => {
                        res.json({
                            totalSales: parseFloat(results.totalSales) || 0,
                            pendingReceivables: parseFloat(results.pendingReceivables) || 0,
                            pendingReceivablesCount: parseInt(results.pendingReceivablesCount) || 0,
                            outstandingPayables: parseFloat(results.outstandingPayables) || 0,
                            inventoryValue: parseFloat(results.inventoryValue) || 0,
                            inventoryCount: parseInt(results.inventoryCount) || 0,
                            monthlySales: mErr ? [] : (monthRows || []),
                        });
                    }
                );
            }
        });
    });
});

// ===========================================================
// SETTINGS
// ===========================================================

app.get("/api/settings", authenticate, (req, res) => {
    db.query("SELECT * FROM company_settings WHERE user_id = ?",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows[0] || {});
        });
});

app.post("/api/settings", authenticate, (req, res) => {
    const { company_name, gst_number, address, currency, region } = req.body;
    db.query(
        `INSERT INTO company_settings (id, user_id, company_name, gst_number, address, currency, region)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       company_name=VALUES(company_name), gst_number=VALUES(gst_number),
       address=VALUES(address), currency=VALUES(currency), region=VALUES(region)`,
        [newId(), req.user.id, company_name, gst_number, address, currency || "NPR", region || "Nepal"],
        (err) => {
            if (err) return res.status(500).json({ message: err.message });
            db.query("SELECT * FROM company_settings WHERE user_id = ?",
                [req.user.id], (e, rows) => res.json(rows[0]));
        }
    );
});

// ===========================================================
// CLIENTS
// ===========================================================

// Plain list for dropdowns
app.get("/api/clients/list", authenticate, (req, res) => {
    db.query("SELECT id, linked_profile_id, client_name FROM clients WHERE user_id=? ORDER BY client_name ASC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

// Aggregated sales clients for the Clients & Vendors page
app.get("/api/clients/sales", authenticate, (req, res) => {
    db.query(
        `SELECT
           c.id,
           c.linked_profile_id,
           c.client_name,
           c.email,
           c.phone,
           COUNT(DISTINCT i.id)                          AS total_invoices,
           COALESCE(SUM(i.total_amount), 0)              AS total_amount,
           COALESCE(SUM(CASE WHEN i.status!='paid' THEN i.total_amount ELSE 0 END), 0) AS outstanding_amount
         FROM clients c
         LEFT JOIN invoices i ON i.client_name = c.client_name AND i.user_id = c.user_id
         WHERE c.user_id = ?
         GROUP BY c.id, c.linked_profile_id, c.client_name, c.email, c.phone
         ORDER BY c.client_name ASC`,
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/clients", authenticate, (req, res) => {
    const { linked_profile_id } = req.body;
    if (!linked_profile_id) return res.status(400).json({ message: "linked_profile_id is required" });
    if (linked_profile_id === req.user.id) return res.status(400).json({ message: "You cannot add your own account as a client" });

    db.query("SELECT id FROM clients WHERE user_id = ? AND linked_profile_id = ?", [req.user.id, linked_profile_id], (dupErr, dupRows) => {
        if (dupErr) return res.status(500).json({ message: dupErr.message });
        if (dupRows.length) return res.status(400).json({ message: "Client already linked" });

        db.query("SELECT id, name, email, business_name FROM profiles WHERE id = ? AND is_admin = 0", [linked_profile_id], (profileErr, profileRows) => {
            if (profileErr) return res.status(500).json({ message: profileErr.message });
            if (!profileRows.length) return res.status(404).json({ message: "Registered business account not found" });

            const profile = profileRows[0];
            const clientName = profile.business_name || profile.name || profile.email;
            const id = newId();

            db.query(
                "INSERT INTO clients (id, user_id, linked_profile_id, client_name, email) VALUES (?, ?, ?, ?, ?)",
                [id, req.user.id, linked_profile_id, clientName, profile.email || null],
                (err) => {
                    if (err) return res.status(500).json({ message: err.message });
                    db.query("SELECT * FROM clients WHERE id = ?", [id], (_e, rows) => res.status(201).json(rows[0]));
                }
            );
        });
    });
});

app.delete("/api/clients/:id", authenticate, (req, res) => {
    db.query("DELETE FROM clients WHERE id=? AND user_id=?",
        [req.params.id, req.user.id], (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Not found" });
            res.json({ message: "Client deleted" });
        });
});

// ===========================================================
// VENDORS
// ===========================================================

// Plain list for dropdowns
app.get("/api/vendors/list", authenticate, (req, res) => {
    db.query("SELECT id, linked_profile_id, vendor_name FROM vendors WHERE user_id=? ORDER BY vendor_name ASC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

// Aggregated vendors for the Clients & Vendors page
app.get("/api/clients/vendors", authenticate, (req, res) => {
    db.query(
        `SELECT
           v.id,
           v.linked_profile_id,
           v.vendor_name,
           v.email,
           v.phone,
           COUNT(DISTINCT p.id)                         AS total_payables,
           COALESCE(SUM(p.amount), 0)                   AS total_amount,
           COALESCE(SUM(CASE WHEN p.status!='paid' THEN p.amount ELSE 0 END), 0) AS outstanding_amount
         FROM vendors v
         LEFT JOIN payables p ON p.vendor_name = v.vendor_name AND p.user_id = v.user_id
         WHERE v.user_id = ?
         GROUP BY v.id, v.linked_profile_id, v.vendor_name, v.email, v.phone
         ORDER BY v.vendor_name ASC`,
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/vendors", authenticate, (req, res) => {
    const { linked_profile_id } = req.body;
    if (!linked_profile_id) return res.status(400).json({ message: "linked_profile_id is required" });
    if (linked_profile_id === req.user.id) return res.status(400).json({ message: "You cannot add your own account as a vendor" });

    db.query("SELECT id FROM vendors WHERE user_id = ? AND linked_profile_id = ?", [req.user.id, linked_profile_id], (dupErr, dupRows) => {
        if (dupErr) return res.status(500).json({ message: dupErr.message });
        if (dupRows.length) return res.status(400).json({ message: "Vendor already linked" });

        db.query("SELECT id, name, email, business_name FROM profiles WHERE id = ? AND is_admin = 0", [linked_profile_id], (profileErr, profileRows) => {
            if (profileErr) return res.status(500).json({ message: profileErr.message });
            if (!profileRows.length) return res.status(404).json({ message: "Registered business account not found" });

            const profile = profileRows[0];
            const vendorName = profile.business_name || profile.name || profile.email;
            const id = newId();

            db.query(
                "INSERT INTO vendors (id, user_id, linked_profile_id, vendor_name, email) VALUES (?, ?, ?, ?, ?)",
                [id, req.user.id, linked_profile_id, vendorName, profile.email || null],
                (err) => {
                    if (err) return res.status(500).json({ message: err.message });
                    db.query("SELECT * FROM vendors WHERE id = ?", [id], (_e, rows) => res.status(201).json(rows[0]));
                }
            );
        });
    });
});

app.delete("/api/vendors/:id", authenticate, (req, res) => {
    db.query("DELETE FROM vendors WHERE id=? AND user_id=?",
        [req.params.id, req.user.id], (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Not found" });
            res.json({ message: "Vendor deleted" });
        });
});

// ===========================================================
// KYC
// ===========================================================

app.get("/api/kyc/status", authenticate, (req, res) => {
    db.query("SELECT * FROM kyc_status WHERE user_id = ?",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows[0] || { status: "pending" });
        });
});

app.post("/api/kyc/upload", authenticate, upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const { documentType } = req.body;
    const id = newId();
    db.query(
        "INSERT INTO kyc_documents (id, user_id, document_type, file_name, file_path, file_size, mime_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, req.user.id, documentType || "other", req.file.originalname,
            `/uploads/${req.file.filename}`, req.file.size, req.file.mimetype],
        (err) => {
            if (err) return res.status(500).json({ message: err.message });

            db.query(
                "INSERT INTO kyc_status (id, user_id, submitted_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE submitted_at=NOW(), updated_at=NOW()",
                [newId(), req.user.id], () => { }
            );

            res.status(201).json({
                message: "Document uploaded successfully",
                documentId: id,
                filePath: `/uploads/${req.file.filename}`,
            });
        }
    );
});

app.get("/api/kyc/documents", authenticate, (req, res) => {
    db.query("SELECT * FROM kyc_documents WHERE user_id = ? ORDER BY uploaded_at DESC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.get("/api/kyc/admin/documents", authenticateAdmin, (req, res) => {
    db.query(
        `SELECT kd.*, p.email, p.name, ks.status AS kyc_status
     FROM kyc_documents kd
     JOIN profiles p ON kd.user_id = p.id
     LEFT JOIN kyc_status ks ON kd.user_id = ks.user_id
     ORDER BY kd.uploaded_at DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.put("/api/kyc/admin/approve/:documentId", authenticateAdmin, (req, res) => {
    db.query("SELECT user_id FROM kyc_documents WHERE id = ?", [req.params.documentId], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ message: "Document not found" });
        db.query(
            "UPDATE kyc_status SET status='approved', reviewed_at=NOW(), reviewed_by=?, rejection_reason=NULL WHERE user_id=?",
            [req.user.id, rows[0].user_id],
            (e) => {
                if (e) return res.status(500).json({ message: e.message });
                res.json({ message: "KYC approved" });
            }
        );
    });
});

app.put("/api/kyc/admin/reject/:documentId", authenticateAdmin, (req, res) => {
    const { rejectionReason } = req.body;
    db.query("SELECT user_id FROM kyc_documents WHERE id = ?", [req.params.documentId], (err, rows) => {
        if (err || !rows.length) return res.status(404).json({ message: "Document not found" });
        db.query(
            "UPDATE kyc_status SET status='rejected', reviewed_at=NOW(), reviewed_by=?, rejection_reason=? WHERE user_id=?",
            [req.user.id, rejectionReason || "Does not meet requirements", rows[0].user_id],
            (e) => {
                if (e) return res.status(500).json({ message: e.message });
                res.json({ message: "KYC rejected" });
            }
        );
    });
});

// ===========================================================
// ADMIN ROUTES
// ===========================================================

// Admin Login
app.post("/api/admin/login", (req, res) => {
    const { email, password } = req.body;
    const requestMeta = getRequestMeta(req);
    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required" });

    const normalEmail = email.toLowerCase().trim();
    db.query("SELECT * FROM profiles WHERE email = ? AND is_admin = 1", [normalEmail], (err, rows) => {
        if (err) return res.status(500).json({ message: "Login error" });
        if (!rows.length) {
            auditService.logAction({
                entityType: "auth_session",
                actionType: "login",
                reason: "Invalid admin credentials",
                newValues: { email: normalEmail, outcome: "invalid_admin" },
                ipAddress: requestMeta.ipAddress,
                userAgent: requestMeta.userAgent,
                route: requestMeta.route,
                method: requestMeta.method,
                statusCode: 401,
            }).catch(() => { });
            return res.status(401).json({ message: "Invalid credentials or not an admin" });
        }

        const user = rows[0];
        bcrypt.compare(String(password).trim(), user.password_hash, (cmpErr, match) => {
            if (cmpErr || !match) {
                auditService.logAction({
                    actorUserId: user.id,
                    companyId: user.id,
                    entityType: "auth_session",
                    entityId: user.id,
                    actionType: "login",
                    reason: "Invalid admin credentials",
                    newValues: { email: user.email, outcome: "invalid_password", is_admin: true },
                    ipAddress: requestMeta.ipAddress,
                    userAgent: requestMeta.userAgent,
                    route: requestMeta.route,
                    method: requestMeta.method,
                    statusCode: 401,
                }).catch(() => { });
                return res.status(401).json({ message: "Invalid credentials" });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, is_admin: true },
                JWT_SECRET,
                { expiresIn: "8h" }
            );
            auditService.logAction({
                actorUserId: user.id,
                companyId: user.id,
                entityType: "auth_session",
                entityId: user.id,
                actionType: "login",
                reason: "Admin login successful",
                newValues: { email: user.email, outcome: "success", is_admin: true },
                ipAddress: requestMeta.ipAddress,
                userAgent: requestMeta.userAgent,
                route: requestMeta.route,
                method: requestMeta.method,
                statusCode: 200,
            }).catch(() => { });
            res.json({ message: "Admin login successful", token });
        });
    });
});

// Admin Verify (checks token is valid and has admin flag)
app.get("/api/admin/verify", authenticateAdmin, (req, res) => {
    res.json({ ok: true, adminId: req.user.id });
});

// Admin – list KYC users (with optional status filter)
app.get("/api/admin/kyc/users", authenticateAdmin, (req, res) => {
    const { status } = req.query;
    const validStatuses = ["pending", "approved", "rejected"];

    let sql = `
        SELECT p.id, p.name, p.email, p.business_name, p.created_at,
               COALESCE(ks.status, 'pending') AS status,
               ks.submitted_at, ks.rejection_reason
        FROM profiles p
        LEFT JOIN kyc_status ks ON p.id = ks.user_id
        WHERE p.is_admin = 0
    `;
    const params = [];

    if (status && validStatuses.includes(status)) {
        sql += " AND COALESCE(ks.status, 'pending') = ?";
        params.push(status);
    }
    sql += " ORDER BY ks.submitted_at DESC";

    db.query(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// Admin – get documents for a specific user
app.get("/api/admin/kyc/documents/:userId", authenticateAdmin, (req, res) => {
    db.query(
        "SELECT * FROM kyc_documents WHERE user_id = ? ORDER BY uploaded_at ASC",
        [req.params.userId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

// Admin – approve KYC for a user
app.put("/api/admin/kyc/approve/:userId", authenticateAdmin, (req, res) => {
    db.query(
        "UPDATE kyc_status SET status='approved', reviewed_at=NOW(), reviewed_by=?, rejection_reason=NULL WHERE user_id=?",
        [req.user.id, req.params.userId],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "KYC record not found" });
            res.json({ message: "KYC approved" });
        }
    );
});

// Admin – reject KYC for a user
app.put("/api/admin/kyc/reject/:userId", authenticateAdmin, (req, res) => {
    const { rejectionReason } = req.body;
    db.query(
        "UPDATE kyc_status SET status='rejected', reviewed_at=NOW(), reviewed_by=?, rejection_reason=? WHERE user_id=?",
        [req.user.id, rejectionReason || "Does not meet requirements", req.params.userId],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "KYC record not found" });
            res.json({ message: "KYC rejected" });
        }
    );
});

// ===========================================================
// ADMIN SEED  (one-time setup – creates/promotes an admin)
// POST /api/admin/seed  body: { secret, email, password, name }
// secret must match ADMIN_SEED_SECRET env var (default: "finflow_seed")
// ===========================================================
const ADMIN_SEED_SECRET = process.env.ADMIN_SEED_SECRET || "finflow_seed";

app.post("/api/admin/seed", (req, res) => {
    auditService.logAction({
        entityType: "admin_seed",
        actionType: "create",
        reason: "Attempted use of disabled admin seed endpoint",
        newValues: { email: req.body?.email || null },
        ipAddress: getRequestMeta(req).ipAddress,
        userAgent: getRequestMeta(req).userAgent,
        route: getRequestMeta(req).route,
        method: getRequestMeta(req).method,
    }).catch(() => { });
    return res.status(410).json({ message: "Admin seed endpoint disabled in production-hardening mode" });

    const { secret, email, password, name } = req.body;

    if (secret !== ADMIN_SEED_SECRET)
        return res.status(403).json({ message: "Invalid seed secret" });
    if (!email || !password)
        return res.status(400).json({ message: "email and password are required" });

    const normalEmail = email.toLowerCase().trim();

    // Check if the user already exists
    db.query("SELECT id FROM profiles WHERE email = ?", [normalEmail], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });

        if (rows.length) {
            // User exists – update password AND promote to admin
            bcrypt.hash(String(password).trim(), 10, (hashErr, passwordHash) => {
                if (hashErr) return res.status(500).json({ message: "Hash error" });
                db.query(
                    "UPDATE profiles SET is_admin = 1, password_hash = ? WHERE email = ?",
                    [passwordHash, normalEmail],
                    (e) => {
                        if (e) return res.status(500).json({ message: e.message });
                        res.json({ message: `✅ Existing user "${normalEmail}" promoted to admin with new password` });
                    }
                );
            });
        } else {
            // Create a new admin account
            bcrypt.hash(String(password).trim(), 10, (hashErr, passwordHash) => {
                if (hashErr) return res.status(500).json({ message: "Hash error" });

                const id = newId();
                const displayName = (name || "Admin").trim();
                db.query(
                    "INSERT INTO profiles (id, name, email, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)",
                    [id, displayName, normalEmail, passwordHash],
                    (dbErr) => {
                        if (dbErr) return res.status(500).json({ message: dbErr.message });
                        res.status(201).json({ message: `✅ Admin account created for "${normalEmail}"` });
                    }
                );
            });
        }
    });
});

// ===========================================================
// HEALTH CHECK
// ===========================================================
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date() }));

// ===========================================================
// FALLBACK & ERROR HANDLERS
// ===========================================================
app.use((req, res) => res.status(404).json({ message: `Route ${req.method} ${req.path} not found` }));

app.use((err, req, res, _next) => {
    console.error("Server error:", err.message);
    res.status(500).json({ message: err.message || "Internal server error" });
});

// ===========================================================
// START
// ===========================================================
app.listen(PORT, () => {
    console.log(`? FinFlow backend running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    const emailStatus = getEmailConfigStatus();
    console.log(`   Email verification: ${emailStatus.configured ? "configured" : "not configured"} (${emailStatus.provider})`);
});
