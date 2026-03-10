// ============================================================
// FinFlow SMB - Express Backend Server
// Port: 5000 | DB: MySQL (XAMPP/MariaDB)
// ============================================================
const express = require("express");
const mysql = require("mysql2");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "finflow_jwt_secret_key_2024";

// ── Middleware ─────────────────────────────────────────────
app.use(cors({ origin: "*", credentials: true }));
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
    return require("crypto").randomUUID();
}

// ── MySQL Connection ───────────────────────────────────────
const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "finflowdb",
    multipleStatements: true,
});

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
      vendor_name VARCHAR(255) NOT NULL,
      email       VARCHAR(255),
      phone       VARCHAR(20),
      address     TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
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
  `;
    db.query(sql, (err) => {
        if (err) console.error("❌ DB init error:", err.message);
        else console.log("✅ Database tables ready");
    });
}

// ===========================================================
// DEBUG ROUTE  (open in browser to verify DB state)
// ===========================================================
app.get("/api/debug/users", (req, res) => {
    db.query(
        "SELECT id, name, email, LEFT(password_hash, 20) AS hash_preview, created_at FROM profiles",
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ count: rows.length, users: rows });
        }
    );
});

// ===========================================================
// DATA MANAGEMENT
// ===========================================================

// Clear financial data for the logged-in user
app.delete("/api/data/clear-financials", authenticate, (req, res) => {
    const uid = req.user.id;
    const tables = ["payables", "purchases", "sales"];
    let done = 0;
    let hadError = null;

    tables.forEach((tbl) => {
        db.query(`DELETE FROM ${tbl} WHERE user_id = ?`, [uid], (err) => {
            if (err) hadError = err.message;
            if (++done === tables.length) {
                if (hadError) return res.status(500).json({ message: hadError });
                res.json({ message: "Payables, purchases and sales cleared successfully" });
            }
        });
    });
});

// ===========================================================
// AUTH ROUTES
// ===========================================================

// ── Register / Signup ──────────────────────────────────────
// Seed 10 default clients + 10 vendors for a brand-new user
function seedDefaultClientsVendors(userId) {
    const clients = [
        "Himalayan Traders", "Everest Stores", "Kathmandu Enterprises",
        "Pokhara Retail Co.", "Lumbini Goods", "Chitwan Supplies",
        "Biratnagar Commerce", "Janakpur Distributors", "Butwal Industries",
        "Dharan Trading House"
    ];
    const vendors = [
        "Nepal Wholesale Pvt. Ltd.", "Mountain Peak Suppliers",
        "Summit Source Co.", "Valley Vendors Ltd.",
        "Trishuli Trade House", "Bagmati Distributors",
        "Koshi Supply Chain", "Gandaki Goods Depot",
        "Mahakali Merchants", "Rapti Resource Pvt."
    ];

    clients.forEach(name => {
        db.query(
            "INSERT INTO clients (id, user_id, client_name) VALUES (?, ?, ?)",
            [newId(), userId, name], () => { }
        );
    });
    vendors.forEach(name => {
        db.query(
            "INSERT INTO vendors (id, user_id, vendor_name) VALUES (?, ?, ?)",
            [newId(), userId, name], () => { }
        );
    });
}

function handleRegister(req, res) {
    const { name, email, password, businessName } = req.body;
    console.log(`[REGISTER] email=${email}`);

    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required" });

    bcrypt.hash(String(password).trim(), 10, (hashErr, passwordHash) => {
        if (hashErr) {
            console.error("[REGISTER] bcrypt error:", hashErr.message);
            return res.status(500).json({ message: "Registration failed" });
        }

        const id = newId();
        const displayName = (name || email.split("@")[0]).trim();
        const normalEmail = email.toLowerCase().trim();
        console.log(`[REGISTER] inserting user id=${id}`);

        db.query(
            "INSERT INTO profiles (id, name, email, password_hash, business_name) VALUES (?, ?, ?, ?, ?)",
            [id, displayName, normalEmail, passwordHash, businessName || null],
            (dbErr) => {
                if (dbErr) {
                    console.error("[REGISTER] insert error:", dbErr.message);
                    if (dbErr.code === "ER_DUP_ENTRY")
                        return res.status(400).json({ message: "Email already registered" });
                    return res.status(500).json({ message: "Registration failed", error: dbErr.message });
                }

                console.log(`[REGISTER] ✅ created ${email}`);

                // Create default KYC record
                db.query(
                    "INSERT IGNORE INTO kyc_status (id, user_id, submitted_at) VALUES (?, ?, NOW())",
                    [newId(), id],
                    () => { }
                );

                // Seed default clients & vendors
                seedDefaultClientsVendors(id);

                const token = jwt.sign({ id, email: normalEmail }, JWT_SECRET, { expiresIn: "7d" });
                res.status(201).json({
                    message: "Registered successfully",
                    token,
                    user: { id, name: displayName, email: normalEmail },
                });
            }
        );
    });
}

// ── Login ──────────────────────────────────────────────────
function handleLogin(req, res) {
    const { email, password } = req.body;
    console.log(`[LOGIN] attempt email=${email}`);

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

            if (!rows.length)
                return res.status(401).json({ message: "Invalid credentials" });

            const user = rows[0];

            bcrypt.compare(String(password).trim(), user.password_hash, (cmpErr, match) => {
                if (cmpErr) {
                    console.error("[LOGIN] bcrypt error:", cmpErr.message);
                    return res.status(500).json({ message: "Login error" });
                }

                console.log(`[LOGIN] password match=${match}`);

                if (!match)
                    return res.status(401).json({ message: "Invalid credentials" });

                const token = jwt.sign(
                    { id: user.id, email: user.email },
                    JWT_SECRET,
                    { expiresIn: "7d" }
                );
                console.log(`[LOGIN] ✅ success ${normalEmail}`);
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

app.post("/api/login", handleLogin);    // api.ts
app.post("/api/auth/login", handleLogin);    // AuthContext

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

                // ── AUTO: create payable if credit purchase ──
                if (pType === "credit" && totalCost > 0) {
                    const payableId = newId();
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + 30); // due in 30 days
                    db.query(
                        `INSERT INTO payables
                         (id, user_id, vendor_name, invoice_id, amount, due_date, status)
                         VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
                        [payableId, req.user.id, vName,
                            purchaseId, totalCost, dueDate.toISOString().slice(0, 10)],
                        (pyErr) => { if (pyErr) console.error("[AUTO-PAYABLE]", pyErr.message); }
                    );
                }
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
    // Fetch inventory first to get linked purchase/payable info
    db.query(
        "SELECT * FROM inventory WHERE id=? AND user_id=?",
        [req.params.id, req.user.id],
        (fErr, fRows) => {
            if (fErr) return res.status(500).json({ message: fErr.message });
            if (!fRows.length) return res.status(404).json({ message: "Item not found" });

            const item = fRows[0];

            db.query(
                "DELETE FROM inventory WHERE id=? AND user_id=?",
                [req.params.id, req.user.id],
                (err, result) => {
                    if (err) return res.status(500).json({ message: err.message });
                    if (!result.affectedRows) return res.status(404).json({ message: "Item not found" });

                    // ── AUTO: delete linked purchase records for this product ──
                    db.query(
                        `DELETE FROM purchases WHERE user_id=? AND product_name=? AND vendor_name=?`,
                        [req.user.id, item.product_name, item.vendor_name || "Unknown Vendor"],
                        (pErr) => { if (pErr) console.error("[AUTO-DEL-PURCHASE]", pErr.message); }
                    );

                    // ── AUTO: delete linked payables for this vendor+product combo ──
                    db.query(
                        `DELETE FROM payables WHERE user_id=? AND vendor_name=?
                         AND invoice_id IN
                         (SELECT id FROM (SELECT id FROM purchases WHERE user_id=? AND product_name=?) AS p)`,
                        [req.user.id, item.vendor_name || "Unknown Vendor",
                        req.user.id, item.product_name],
                        (pyErr) => { if (pyErr) console.error("[AUTO-DEL-PAYABLE-INV]", pyErr.message); }
                    );

                    res.json({ message: "Deleted successfully" });
                }
            );
        }
    );
});

// ===========================================================
// INVOICES
// ===========================================================

app.get("/api/invoices", authenticate, (req, res) => {
    db.query(
        "SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC",
        [req.user.id],
        (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/invoices", authenticate, (req, res) => {
    const { invoice_no, client_name, amount, tax_amount, total_amount,
        status, invoice_date, due_date, notes } = req.body;

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
        (err) => {
            if (err) return res.status(500).json({ message: err.message });

            // ── AUTO: create receivable ──
            const recId = newId();
            db.query(
                `INSERT INTO receivables
                 (id, user_id, client_name, invoice_id, amount, due_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
                [recId, req.user.id, client_name, invoice_no, finalTotal, due_date],
                (rErr) => { if (rErr) console.error("[AUTO-RECEIVABLE]", rErr.message); }
            );

            // ── AUTO: if created as 'paid', also create sale ──
            if (finalStatus === "paid") {
                const saleId = newId();
                db.query(
                    `INSERT INTO sales (id, user_id, client_name, amount, sale_date, notes)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [saleId, req.user.id, client_name, finalTotal, today, `Invoice ${invoice_no}`],
                    (sErr) => { if (sErr) console.error("[AUTO-SALE]", sErr.message); }
                );
                db.query(
                    "UPDATE receivables SET status='paid' WHERE invoice_id=? AND user_id=?",
                    [invoice_no, req.user.id], () => { }
                );
            }

            db.query("SELECT * FROM invoices WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/invoices/:id", authenticate, (req, res) => {
    const invoiceId = req.params.id;
    const userId = req.user.id;

    // Fetch current row first so we can detect status change
    db.query("SELECT * FROM invoices WHERE id=? AND user_id=?", [invoiceId, userId], (fErr, fRows) => {
        if (fErr) return res.status(500).json({ message: fErr.message });
        if (!fRows.length) return res.status(404).json({ message: "Invoice not found" });

        const prev = fRows[0];
        const { invoice_no, client_name, amount, tax_amount, total_amount,
            status, invoice_date, due_date, payment_date, notes } = req.body;
        const finalTotal = parseFloat(total_amount || amount);
        const today = new Date().toISOString().slice(0, 10);

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

                // ── AUTO: invoice just marked as PAID ──
                if (status === "paid" && prev.status !== "paid") {
                    // Create sale record
                    const saleId = newId();
                    db.query(
                        `INSERT INTO sales (id, user_id, client_name, amount, sale_date, notes)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [saleId, userId, client_name, finalTotal,
                            payment_date || today, `Invoice ${invoice_no}`],
                        (sErr) => { if (sErr) console.error("[AUTO-SALE]", sErr.message); }
                    );
                    // Sync receivable → paid
                    db.query(
                        "UPDATE receivables SET status='paid' WHERE invoice_id=? AND user_id=?",
                        [invoice_no || prev.invoice_no, userId], () => { }
                    );
                }

                // ── AUTO: invoice un-paid (paid → something else) ──
                if (prev.status === "paid" && status !== "paid") {
                    db.query(
                        "UPDATE receivables SET status='pending' WHERE invoice_id=? AND user_id=?",
                        [invoice_no || prev.invoice_no, userId], () => { }
                    );
                }

                db.query("SELECT * FROM invoices WHERE id = ?", [invoiceId], (e, rows) => res.json(rows[0]));
            }
        );
    });
});

app.delete("/api/invoices/:id", authenticate, (req, res) => {
    // Fetch invoice to get invoice_no before deletion (for receivable cleanup)
    db.query(
        "SELECT invoice_no FROM invoices WHERE id=? AND user_id=?",
        [req.params.id, req.user.id],
        (fErr, fRows) => {
            if (fErr) return res.status(500).json({ message: fErr.message });
            if (!fRows.length) return res.status(404).json({ message: "Invoice not found" });

            const invoiceNo = fRows[0].invoice_no;

            db.query(
                "DELETE FROM invoices WHERE id=? AND user_id=?",
                [req.params.id, req.user.id],
                (err) => {
                    if (err) return res.status(500).json({ message: err.message });

                    // ── AUTO: delete linked receivable ──
                    db.query(
                        "DELETE FROM receivables WHERE invoice_id=? AND user_id=?",
                        [invoiceNo, req.user.id],
                        (rErr) => { if (rErr) console.error("[AUTO-DEL-RECEIVABLE]", rErr.message); }
                    );

                    res.json({ message: "Invoice deleted and receivable removed" });
                }
            );
        }
    );
});

// ===========================================================
// RECEIVABLES
// ===========================================================

// Helper: auto-mark overdue receivables for a user
function syncOverdueReceivables(userId) {
    db.query(
        `UPDATE receivables
         SET status = 'overdue',
             days_overdue = DATEDIFF(CURDATE(), due_date)
         WHERE user_id = ? AND status = 'pending' AND due_date < CURDATE()`,
        [userId], (e) => { if (e) console.error("[OVERDUE-REC]", e.message); }
    );
    // Also reset days_overdue for pending not-yet-due records
    db.query(
        `UPDATE receivables SET days_overdue = 0
         WHERE user_id = ? AND status = 'pending' AND due_date >= CURDATE()`,
        [userId], () => { }
    );
}

app.get("/api/receivables", authenticate, (req, res) => {
    // Sync overdue status before returning
    syncOverdueReceivables(req.user.id);
    db.query("SELECT * FROM receivables WHERE user_id = ? ORDER BY due_date ASC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.post("/api/receivables", authenticate, (req, res) => {
    const { client_name, invoice_id, amount, due_date, status } = req.body;
    if (!client_name || !amount || !due_date)
        return res.status(400).json({ message: "client_name, amount and due_date are required" });

    const id = newId();
    db.query(
        "INSERT INTO receivables (id, user_id, client_name, invoice_id, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, req.user.id, client_name, invoice_id || null, amount, due_date, status || "pending"],
        (err) => {
            if (err) return res.status(500).json({ message: err.message });
            db.query("SELECT * FROM receivables WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/receivables/:id", authenticate, (req, res) => {
    const recId = req.params.id;
    const userId = req.user.id;

    // Fetch current to detect status change
    db.query("SELECT * FROM receivables WHERE id=? AND user_id=?", [recId, userId], (fErr, fRows) => {
        if (fErr) return res.status(500).json({ message: fErr.message });
        if (!fRows.length) return res.status(404).json({ message: "Not found" });

        const prev = fRows[0];
        const { client_name, invoice_id, amount, due_date, status } = req.body;
        const today = new Date().toISOString().slice(0, 10);

        db.query(
            "UPDATE receivables SET client_name=?, invoice_id=?, amount=?, due_date=?, status=?, updated_at=NOW() WHERE id=? AND user_id=?",
            [client_name, invoice_id || null, amount, due_date, status, recId, userId],
            (err, result) => {
                if (err) return res.status(500).json({ message: err.message });
                if (!result.affectedRows) return res.status(404).json({ message: "Not found" });

                // ── AUTO: receivable marked as paid → create sale record ──
                if (status === "paid" && prev.status !== "paid") {
                    const saleId = newId();
                    db.query(
                        `INSERT INTO sales (id, user_id, client_name, amount, sale_date, notes)
                         VALUES (?, ?, ?, ?, ?, ?)`,
                        [saleId, userId, client_name || prev.client_name,
                            amount || prev.amount, today,
                            invoice_id ? `Receivable for Invoice ${invoice_id}` : "Direct payment received"],
                        (sErr) => { if (sErr) console.error("[AUTO-SALE-FROM-REC]", sErr.message); }
                    );
                    // Sync the linked invoice status → paid (if linked)
                    if (invoice_id || prev.invoice_id) {
                        db.query(
                            "UPDATE invoices SET status='paid', payment_date=?, updated_at=NOW() WHERE invoice_no=? AND user_id=? AND status!='paid'",
                            [today, invoice_id || prev.invoice_id, userId], () => { }
                        );
                    }
                }

                // ── AUTO: receivable un-paid → sync invoice back to pending ──
                if (prev.status === "paid" && status !== "paid") {
                    if (invoice_id || prev.invoice_id) {
                        db.query(
                            "UPDATE invoices SET status='pending', payment_date=NULL, updated_at=NOW() WHERE invoice_no=? AND user_id=?",
                            [invoice_id || prev.invoice_id, userId], () => { }
                        );
                    }
                }

                db.query("SELECT * FROM receivables WHERE id = ?", [recId], (e, rows) => res.json(rows[0]));
            }
        );
    });
});

app.delete("/api/receivables/:id", authenticate, (req, res) => {
    db.query("DELETE FROM receivables WHERE id=? AND user_id=?",
        [req.params.id, req.user.id], (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Not found" });
            res.json({ message: "Deleted successfully" });
        });
});

// ===========================================================
// PAYABLES
// ===========================================================

// Helper: auto-mark overdue payables for a user
function syncOverduePayables(userId) {
    db.query(
        `UPDATE payables
         SET status = 'overdue',
             days_overdue = DATEDIFF(CURDATE(), due_date)
         WHERE user_id = ? AND status = 'pending' AND due_date < CURDATE()`,
        [userId], (e) => { if (e) console.error("[OVERDUE-PAY]", e.message); }
    );
    db.query(
        `UPDATE payables SET days_overdue = 0
         WHERE user_id = ? AND status = 'pending' AND due_date >= CURDATE()`,
        [userId], () => { }
    );
}

app.get("/api/payables", authenticate, (req, res) => {
    syncOverduePayables(req.user.id);
    db.query("SELECT * FROM payables WHERE user_id = ? ORDER BY due_date ASC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.post("/api/payables", authenticate, (req, res) => {
    const { vendor_name, invoice_id, amount, due_date, status } = req.body;
    if (!vendor_name || !amount || !due_date)
        return res.status(400).json({ message: "vendor_name, amount and due_date are required" });

    const id = newId();
    db.query(
        "INSERT INTO payables (id, user_id, vendor_name, invoice_id, amount, due_date, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [id, req.user.id, vendor_name, invoice_id || null, amount, due_date, status || "pending"],
        (err) => {
            if (err) return res.status(500).json({ message: err.message });
            db.query("SELECT * FROM payables WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.put("/api/payables/:id", authenticate, (req, res) => {
    const payId = req.params.id;
    const userId = req.user.id;

    // Fetch current to detect status change
    db.query("SELECT * FROM payables WHERE id=? AND user_id=?", [payId, userId], (fErr, fRows) => {
        if (fErr) return res.status(500).json({ message: fErr.message });
        if (!fRows.length) return res.status(404).json({ message: "Not found" });

        const prev = fRows[0];
        const { vendor_name, invoice_id, amount, due_date, status } = req.body;

        db.query(
            "UPDATE payables SET vendor_name=?, invoice_id=?, amount=?, due_date=?, status=?, updated_at=NOW() WHERE id=? AND user_id=?",
            [vendor_name, invoice_id || null, amount, due_date, status, payId, userId],
            (err, result) => {
                if (err) return res.status(500).json({ message: err.message });
                if (!result.affectedRows) return res.status(404).json({ message: "Not found" });

                // ── AUTO: payable paid → sync linked purchase payment_status ──
                if (status === "paid" && prev.status !== "paid" && (invoice_id || prev.invoice_id)) {
                    db.query(
                        "UPDATE purchases SET payment_status='paid' WHERE id=? AND user_id=?",
                        [invoice_id || prev.invoice_id, userId],
                        (pErr) => { if (pErr) console.error("[AUTO-PURCH-PAID]", pErr.message); }
                    );
                }

                // ── AUTO: payable un-paid → revert purchase to pending ──
                if (prev.status === "paid" && status !== "paid" && (invoice_id || prev.invoice_id)) {
                    db.query(
                        "UPDATE purchases SET payment_status='pending' WHERE id=? AND user_id=?",
                        [invoice_id || prev.invoice_id, userId], () => { }
                    );
                }

                db.query("SELECT * FROM payables WHERE id = ?", [payId], (e, rows) => res.json(rows[0]));
            }
        );
    });
});

app.delete("/api/payables/:id", authenticate, (req, res) => {
    // Fetch payable first to get linked purchase_id
    db.query("SELECT invoice_id FROM payables WHERE id=? AND user_id=?",
        [req.params.id, req.user.id], (fErr, fRows) => {
            if (fErr) return res.status(500).json({ message: fErr.message });

            db.query("DELETE FROM payables WHERE id=? AND user_id=?",
                [req.params.id, req.user.id], (err, result) => {
                    if (err) return res.status(500).json({ message: err.message });
                    if (!result.affectedRows) return res.status(404).json({ message: "Not found" });
                    res.json({ message: "Deleted successfully" });
                });
        });
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

            // ── AUTO: direct cash sale → create a paid receivable (history trail) ──
            const recId = newId();
            db.query(
                `INSERT INTO receivables
                 (id, user_id, client_name, invoice_id, amount, due_date, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'paid')`,
                [recId, req.user.id, client_name, null, amount, sale_date || today],
                (rErr) => { if (rErr) console.error("[AUTO-REC-SALE]", rErr.message); }
            );

            db.query("SELECT * FROM sales WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

// ===========================================================
// PURCHASES
// ===========================================================

app.get("/api/purchases", authenticate, (req, res) => {
    db.query("SELECT * FROM purchases WHERE user_id = ? ORDER BY purchase_date DESC",
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        });
});

app.post("/api/purchases", authenticate, (req, res) => {
    const { vendor_name, product_name, quantity, amount, purchase_date,
        payment_type, payment_status, notes } = req.body;
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
        (err) => {
            if (err) return res.status(500).json({ message: err.message });

            // ── AUTO: credit purchase → create payable ──
            if (pType === "credit") {
                const payableId = newId();
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + 30);
                db.query(
                    `INSERT INTO payables
                     (id, user_id, vendor_name, invoice_id, amount, due_date, status)
                     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
                    [payableId, req.user.id, vendor_name, id,
                        amount, dueDate.toISOString().slice(0, 10)],
                    (pErr) => { if (pErr) console.error("[AUTO-PAYABLE-PURCH]", pErr.message); }
                );
            }

            db.query("SELECT * FROM purchases WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
});

app.delete("/api/purchases/:id", authenticate, (req, res) => {
    db.query(
        "DELETE FROM purchases WHERE id=? AND user_id=?",
        [req.params.id, req.user.id],
        (err, result) => {
            if (err) return res.status(500).json({ message: err.message });
            if (!result.affectedRows) return res.status(404).json({ message: "Not found" });

            // ── AUTO: delete linked payable ──
            db.query(
                "DELETE FROM payables WHERE invoice_id=? AND user_id=?",
                [req.params.id, req.user.id],
                (pErr) => { if (pErr) console.error("[AUTO-DEL-PAYABLE]", pErr.message); }
            );

            res.json({ message: "Purchase deleted" });
        }
    );
});

// ===========================================================
// REPORTS
// ===========================================================

app.get("/api/reports", authenticate, (req, res) => {
    const uid = req.user.id;
    const year = req.query.year || new Date().getFullYear();

    // Sync overdue before report
    syncOverdueReceivables(uid);
    syncOverduePayables(uid);

    const q = {
        totalRevenue: `SELECT COALESCE(SUM(amount),0) AS val FROM sales WHERE user_id=?`,
        totalExpenses: `SELECT COALESCE(SUM(amount),0) AS val FROM purchases WHERE user_id=?`,
        grossProfit: `SELECT COALESCE(SUM(amount),0)-0 AS val FROM sales WHERE user_id=?`,
        totalReceivables: `SELECT COALESCE(SUM(amount),0) AS val FROM receivables WHERE user_id=? AND status!='paid'`,
        totalPayables: `SELECT COALESCE(SUM(amount),0) AS val FROM payables WHERE user_id=? AND status!='paid'`,
        overdueRec: `SELECT COUNT(*) AS val FROM receivables WHERE user_id=? AND status='overdue'`,
        overduePay: `SELECT COUNT(*) AS val FROM payables WHERE user_id=? AND status='overdue'`,
        totalInventoryValue: `SELECT COALESCE(SUM(purchase_price*stock_quantity),0) AS val FROM inventory WHERE user_id=?`,
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
// DASHBOARD STATS
// ===========================================================

app.get("/api/dashboard/stats", authenticate, (req, res) => {
    const uid = req.user.id;

    const queries = {
        totalSales: "SELECT COALESCE(SUM(amount),0) AS val FROM sales WHERE user_id=?",
        pendingReceivables: "SELECT COALESCE(SUM(amount),0) AS val FROM receivables WHERE user_id=? AND status='pending'",
        pendingReceivablesCount: "SELECT COUNT(*) AS val FROM receivables WHERE user_id=? AND status='pending'",
        outstandingPayables: "SELECT COALESCE(SUM(amount),0) AS val FROM payables WHERE user_id=? AND status!='paid'",
        inventoryValue: "SELECT COALESCE(SUM(purchase_price * stock_quantity),0) AS val FROM inventory WHERE user_id=?",
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
    db.query("SELECT id, client_name FROM clients WHERE user_id=? ORDER BY client_name ASC",
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
           c.client_name,
           c.email,
           c.phone,
           COUNT(DISTINCT i.id)                          AS total_invoices,
           COALESCE(SUM(i.total_amount), 0)              AS total_amount,
           COALESCE(SUM(CASE WHEN i.status!='paid' THEN i.total_amount ELSE 0 END), 0) AS outstanding_amount
         FROM clients c
         LEFT JOIN invoices i ON i.client_name = c.client_name AND i.user_id = c.user_id
         WHERE c.user_id = ?
         GROUP BY c.id, c.client_name, c.email, c.phone
         ORDER BY c.client_name ASC`,
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/clients", authenticate, (req, res) => {
    const { client_name, email, phone, address } = req.body;
    if (!client_name) return res.status(400).json({ message: "client_name is required" });

    const id = newId();
    db.query(
        "INSERT INTO clients (id, user_id, client_name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)",
        [id, req.user.id, client_name, email || null, phone || null, address || null],
        (err) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY")
                    return res.status(400).json({ message: "Client already exists" });
                return res.status(500).json({ message: err.message });
            }
            db.query("SELECT * FROM clients WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
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
    db.query("SELECT id, vendor_name FROM vendors WHERE user_id=? ORDER BY vendor_name ASC",
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
           v.vendor_name,
           v.email,
           v.phone,
           COUNT(DISTINCT p.id)                         AS total_payables,
           COALESCE(SUM(p.amount), 0)                   AS total_amount,
           COALESCE(SUM(CASE WHEN p.status!='paid' THEN p.amount ELSE 0 END), 0) AS outstanding_amount
         FROM vendors v
         LEFT JOIN payables p ON p.vendor_name = v.vendor_name AND p.user_id = v.user_id
         WHERE v.user_id = ?
         GROUP BY v.id, v.vendor_name, v.email, v.phone
         ORDER BY v.vendor_name ASC`,
        [req.user.id], (err, rows) => {
            if (err) return res.status(500).json({ message: err.message });
            res.json(rows);
        }
    );
});

app.post("/api/vendors", authenticate, (req, res) => {
    const { vendor_name, email, phone, address } = req.body;
    if (!vendor_name) return res.status(400).json({ message: "vendor_name is required" });

    const id = newId();
    db.query(
        "INSERT INTO vendors (id, user_id, vendor_name, email, phone, address) VALUES (?, ?, ?, ?, ?, ?)",
        [id, req.user.id, vendor_name, email || null, phone || null, address || null],
        (err) => {
            if (err) {
                if (err.code === "ER_DUP_ENTRY")
                    return res.status(400).json({ message: "Vendor already exists" });
                return res.status(500).json({ message: err.message });
            }
            db.query("SELECT * FROM vendors WHERE id = ?", [id], (e, rows) => res.status(201).json(rows[0]));
        }
    );
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

app.get("/api/kyc/admin/documents", authenticate, (req, res) => {
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

app.put("/api/kyc/admin/approve/:documentId", authenticate, (req, res) => {
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

app.put("/api/kyc/admin/reject/:documentId", authenticate, (req, res) => {
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
    if (!email || !password)
        return res.status(400).json({ message: "Email and password are required" });

    const normalEmail = email.toLowerCase().trim();
    db.query("SELECT * FROM profiles WHERE email = ? AND is_admin = 1", [normalEmail], (err, rows) => {
        if (err) return res.status(500).json({ message: "Login error" });
        if (!rows.length) return res.status(401).json({ message: "Invalid credentials or not an admin" });

        const user = rows[0];
        bcrypt.compare(String(password).trim(), user.password_hash, (cmpErr, match) => {
            if (cmpErr || !match)
                return res.status(401).json({ message: "Invalid credentials" });

            const token = jwt.sign(
                { id: user.id, email: user.email, is_admin: true },
                JWT_SECRET,
                { expiresIn: "8h" }
            );
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
    console.log(`✅ FinFlow backend running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    console.log(`   Debug:  http://localhost:${PORT}/api/debug/users`);
});
