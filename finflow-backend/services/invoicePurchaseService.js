"use strict";

class InvoicePurchaseService {
  constructor(db) {
    if (!db) throw new Error("InvoicePurchaseService requires a mysql connection");
    this.db = db;
  }

  q(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.query(sql, params, (err, rows) => {
        if (err) return reject(err);
        return resolve(rows);
      });
    });
  }

  begin() {
    return new Promise((resolve, reject) => {
      this.db.beginTransaction((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  commit() {
    return new Promise((resolve, reject) => {
      this.db.commit((err) => {
        if (err) return reject(err);
        return resolve();
      });
    });
  }

  rollback() {
    return new Promise((resolve) => {
      this.db.rollback(() => resolve());
    });
  }

  r2(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  async ensureSchema() {
    await this.q(`
      CREATE TABLE IF NOT EXISTS tax_codes (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        code VARCHAR(30) NOT NULL,
        name VARCHAR(100) NOT NULL,
        rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_tax_code_user (user_id, code)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        entry_no VARCHAR(50) NOT NULL,
        entry_date DATE NOT NULL,
        source_type ENUM('sales_invoice','purchase_bill','payment','adjustment') NOT NULL,
        source_id VARCHAR(36) NOT NULL,
        status ENUM('posted','reversed') NOT NULL DEFAULT 'posted',
        memo VARCHAR(255),
        reversed_entry_id VARCHAR(36) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_entry_no_user (user_id, entry_no),
        KEY idx_je_source (user_id, source_type, source_id)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS journal_lines (
        id VARCHAR(36) PRIMARY KEY,
        journal_entry_id VARCHAR(36) NOT NULL,
        line_order INT NOT NULL,
        account_code VARCHAR(40) NOT NULL,
        description VARCHAR(255),
        debit DECIMAL(14,2) NOT NULL DEFAULT 0,
        credit DECIMAL(14,2) NOT NULL DEFAULT 0,
        reference_type VARCHAR(40),
        reference_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries(id) ON DELETE CASCADE,
        KEY idx_jl_entry (journal_entry_id)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS sales_invoice_headers (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        invoice_no VARCHAR(50) NOT NULL,
        customer_id VARCHAR(36) DEFAULT NULL,
        customer_name VARCHAR(255) NOT NULL,
        invoice_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_journal_entry_id VARCHAR(36) DEFAULT NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_sales_invoice_no_user (user_id, invoice_no)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS sales_invoice_lines (
        id VARCHAR(36) PRIMARY KEY,
        sales_invoice_id VARCHAR(36) NOT NULL,
        line_order INT NOT NULL,
        item_id VARCHAR(36) DEFAULT NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL,
        unit_price DECIMAL(14,4) NOT NULL,
        discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        tax_code_id VARCHAR(36) DEFAULT NULL,
        tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,2) NOT NULL,
        line_discount DECIMAL(14,2) NOT NULL,
        line_tax DECIMAL(14,2) NOT NULL,
        line_total DECIMAL(14,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sales_invoice_id) REFERENCES sales_invoice_headers(id) ON DELETE CASCADE,
        FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
        KEY idx_sil_header (sales_invoice_id)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS purchase_bill_headers (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        bill_no VARCHAR(50) NOT NULL,
        vendor_id VARCHAR(36) DEFAULT NULL,
        vendor_name VARCHAR(255) NOT NULL,
        bill_date DATE NOT NULL,
        due_date DATE NOT NULL,
        status ENUM('draft','posted','void') NOT NULL DEFAULT 'draft',
        subtotal_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        discount_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        tax_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        posted_journal_entry_id VARCHAR(36) DEFAULT NULL,
        posted_at TIMESTAMP NULL DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
        UNIQUE KEY uq_purchase_bill_no_user (user_id, bill_no)
      )
    `);

    await this.q(`
      CREATE TABLE IF NOT EXISTS purchase_bill_lines (
        id VARCHAR(36) PRIMARY KEY,
        purchase_bill_id VARCHAR(36) NOT NULL,
        line_order INT NOT NULL,
        item_id VARCHAR(36) DEFAULT NULL,
        description VARCHAR(255) NOT NULL,
        quantity DECIMAL(14,4) NOT NULL,
        unit_price DECIMAL(14,4) NOT NULL,
        discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        tax_code_id VARCHAR(36) DEFAULT NULL,
        tax_rate_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
        line_subtotal DECIMAL(14,2) NOT NULL,
        line_discount DECIMAL(14,2) NOT NULL,
        line_tax DECIMAL(14,2) NOT NULL,
        line_total DECIMAL(14,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (purchase_bill_id) REFERENCES purchase_bill_headers(id) ON DELETE CASCADE,
        FOREIGN KEY (tax_code_id) REFERENCES tax_codes(id) ON DELETE SET NULL,
        KEY idx_pbl_header (purchase_bill_id)
      )
    `);
  }

  async taxRate(userId, taxCodeId) {
    if (!taxCodeId) return 0;
    const rows = await this.q(
      `SELECT rate_percent FROM tax_codes WHERE id=? AND user_id=? AND is_active=1 LIMIT 1`,
      [taxCodeId, userId]
    );
    return this.r2(rows[0]?.rate_percent || 0);
  }

  async lineAmounts(userId, line) {
    const qty = Number(line.quantity || 0);
    const unit = Number(line.unit_price || 0);
    const discPct = Number(line.discount_percent || 0);
    if (qty <= 0) throw new Error("Line quantity must be > 0");
    if (unit < 0) throw new Error("Line unit_price must be >= 0");
    if (discPct < 0 || discPct > 100) throw new Error("discount_percent must be between 0 and 100");

    const rate = await this.taxRate(userId, line.tax_code_id || null);
    const subtotal = this.r2(qty * unit);
    const discount = this.r2((subtotal * discPct) / 100);
    const taxable = this.r2(subtotal - discount);
    const tax = this.r2((taxable * rate) / 100);
    const total = this.r2(taxable + tax);

    return {
      tax_rate_percent: rate,
      line_subtotal: subtotal,
      line_discount: discount,
      line_tax: tax,
      line_total: total,
    };
  }

  async recomputeHeaderTotals(headerTable, lineTable, headerId, userId) {
    const rows = await this.q(
      `SELECT
          COALESCE(SUM(line_subtotal),0) AS subtotal,
          COALESCE(SUM(line_discount),0) AS discount,
          COALESCE(SUM(line_tax),0) AS tax,
          COALESCE(SUM(line_total),0) AS total
       FROM ${lineTable}
       WHERE ${headerTable === "sales_invoice_headers" ? "sales_invoice_id" : "purchase_bill_id"} = ?`,
      [headerId]
    );

    const totals = {
      subtotal_amount: this.r2(rows[0]?.subtotal || 0),
      discount_amount: this.r2(rows[0]?.discount || 0),
      tax_amount: this.r2(rows[0]?.tax || 0),
      total_amount: this.r2(rows[0]?.total || 0),
    };

    await this.q(
      `UPDATE ${headerTable}
          SET subtotal_amount=?, discount_amount=?, tax_amount=?, total_amount=?, updated_at=NOW()
        WHERE id=? AND user_id=?`,
      [
        totals.subtotal_amount,
        totals.discount_amount,
        totals.tax_amount,
        totals.total_amount,
        headerId,
        userId,
      ]
    );

    return totals;
  }

  async nextEntryNo(userId, prefix) {
    const rows = await this.q(
      `SELECT COUNT(*) AS c FROM journal_entries WHERE user_id=? AND source_type IN ('sales_invoice','purchase_bill')`,
      [userId]
    );
    const seq = Number(rows[0]?.c || 0) + 1;
    return `${prefix}-${String(seq).padStart(6, "0")}`;
  }

  async createSalesInvoiceDraft({ newId, userId, invoiceNo, customerId = null, customerName, invoiceDate, dueDate, notes = null, lines }) {
    if (!Array.isArray(lines) || !lines.length) throw new Error("At least one line is required");

    await this.begin();
    try {
      const headerId = newId();
      await this.q(
        `INSERT INTO sales_invoice_headers
         (id, user_id, invoice_no, customer_id, customer_name, invoice_date, due_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [headerId, userId, invoiceNo, customerId, customerName, invoiceDate, dueDate, notes]
      );

      let i = 1;
      for (const line of lines) {
        const calc = await this.lineAmounts(userId, line);
        await this.q(
          `INSERT INTO sales_invoice_lines
           (id, sales_invoice_id, line_order, item_id, description, quantity, unit_price, discount_percent,
            tax_code_id, tax_rate_percent, line_subtotal, line_discount, line_tax, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            headerId,
            i,
            line.item_id || null,
            line.description,
            Number(line.quantity),
            Number(line.unit_price),
            Number(line.discount_percent || 0),
            line.tax_code_id || null,
            calc.tax_rate_percent,
            calc.line_subtotal,
            calc.line_discount,
            calc.line_tax,
            calc.line_total,
          ]
        );
        i += 1;
      }

      const totals = await this.recomputeHeaderTotals("sales_invoice_headers", "sales_invoice_lines", headerId, userId);
      await this.commit();

      return { id: headerId, status: "draft", ...totals };
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async createPurchaseBillDraft({ newId, userId, billNo, vendorId = null, vendorName, billDate, dueDate, notes = null, lines }) {
    if (!Array.isArray(lines) || !lines.length) throw new Error("At least one line is required");

    await this.begin();
    try {
      const headerId = newId();
      await this.q(
        `INSERT INTO purchase_bill_headers
         (id, user_id, bill_no, vendor_id, vendor_name, bill_date, due_date, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [headerId, userId, billNo, vendorId, vendorName, billDate, dueDate, notes]
      );

      let i = 1;
      for (const line of lines) {
        const calc = await this.lineAmounts(userId, line);
        await this.q(
          `INSERT INTO purchase_bill_lines
           (id, purchase_bill_id, line_order, item_id, description, quantity, unit_price, discount_percent,
            tax_code_id, tax_rate_percent, line_subtotal, line_discount, line_tax, line_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId(),
            headerId,
            i,
            line.item_id || null,
            line.description,
            Number(line.quantity),
            Number(line.unit_price),
            Number(line.discount_percent || 0),
            line.tax_code_id || null,
            calc.tax_rate_percent,
            calc.line_subtotal,
            calc.line_discount,
            calc.line_tax,
            calc.line_total,
          ]
        );
        i += 1;
      }

      const totals = await this.recomputeHeaderTotals("purchase_bill_headers", "purchase_bill_lines", headerId, userId);
      await this.commit();

      return { id: headerId, status: "draft", ...totals };
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async postSalesInvoice({ newId, userId, headerId }) {
    await this.begin();
    try {
      const rows = await this.q(
        `SELECT * FROM sales_invoice_headers WHERE id=? AND user_id=? FOR UPDATE`,
        [headerId, userId]
      );
      const header = rows[0];
      if (!header) throw new Error("Sales invoice not found");
      if (header.status !== "draft") throw new Error("Only draft sales invoice can be posted");

      const totals = await this.recomputeHeaderTotals("sales_invoice_headers", "sales_invoice_lines", headerId, userId);
      if (totals.total_amount <= 0) throw new Error("Cannot post sales invoice with zero total");

      const entryId = newId();
      const entryNo = await this.nextEntryNo(userId, "SIJE");
      await this.q(
        `INSERT INTO journal_entries (id, user_id, entry_no, entry_date, source_type, source_id, status, memo)
         VALUES (?, ?, ?, ?, 'sales_invoice', ?, 'posted', ?)`,
        [entryId, userId, entryNo, header.invoice_date, header.id, `Post sales invoice ${header.invoice_no}`]
      );

      const netRevenue = this.r2(totals.subtotal_amount - totals.discount_amount);
      let lineNo = 1;

      await this.q(
        `INSERT INTO journal_lines
         (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
         VALUES (?, ?, ?, 'AR', ?, ?, 0, 'sales_invoice', ?)`,
        [newId(), entryId, lineNo, `Accounts Receivable ${header.invoice_no}`, totals.total_amount, header.id]
      );
      lineNo += 1;

      await this.q(
        `INSERT INTO journal_lines
         (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
         VALUES (?, ?, ?, 'REVENUE', ?, 0, ?, 'sales_invoice', ?)`,
        [newId(), entryId, lineNo, `Revenue ${header.invoice_no}`, netRevenue, header.id]
      );
      lineNo += 1;

      if (totals.tax_amount > 0) {
        await this.q(
          `INSERT INTO journal_lines
           (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
           VALUES (?, ?, ?, 'TAX_PAYABLE', ?, 0, ?, 'sales_invoice', ?)`,
          [newId(), entryId, lineNo, `Tax payable ${header.invoice_no}`, totals.tax_amount, header.id]
        );
      }

      await this.q(
        `UPDATE sales_invoice_headers
            SET status='posted', posted_journal_entry_id=?, posted_at=NOW(), updated_at=NOW()
          WHERE id=? AND user_id=?`,
        [entryId, header.id, userId]
      );

      await this.commit();
      return { id: header.id, status: "posted", journal_entry_id: entryId, ...totals };
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async postPurchaseBill({ newId, userId, headerId }) {
    await this.begin();
    try {
      const rows = await this.q(
        `SELECT * FROM purchase_bill_headers WHERE id=? AND user_id=? FOR UPDATE`,
        [headerId, userId]
      );
      const header = rows[0];
      if (!header) throw new Error("Purchase bill not found");
      if (header.status !== "draft") throw new Error("Only draft purchase bill can be posted");

      const totals = await this.recomputeHeaderTotals("purchase_bill_headers", "purchase_bill_lines", headerId, userId);
      if (totals.total_amount <= 0) throw new Error("Cannot post purchase bill with zero total");

      const entryId = newId();
      const entryNo = await this.nextEntryNo(userId, "PBJE");
      await this.q(
        `INSERT INTO journal_entries (id, user_id, entry_no, entry_date, source_type, source_id, status, memo)
         VALUES (?, ?, ?, ?, 'purchase_bill', ?, 'posted', ?)`,
        [entryId, userId, entryNo, header.bill_date, header.id, `Post purchase bill ${header.bill_no}`]
      );

      const netExpense = this.r2(totals.subtotal_amount - totals.discount_amount);
      let lineNo = 1;

      await this.q(
        `INSERT INTO journal_lines
         (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
         VALUES (?, ?, ?, 'EXPENSE_OR_INVENTORY', ?, ?, 0, 'purchase_bill', ?)`,
        [newId(), entryId, lineNo, `Expense/Inventory ${header.bill_no}`, netExpense, header.id]
      );
      lineNo += 1;

      if (totals.tax_amount > 0) {
        await this.q(
          `INSERT INTO journal_lines
           (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
           VALUES (?, ?, ?, 'INPUT_TAX', ?, ?, 0, 'purchase_bill', ?)`,
          [newId(), entryId, lineNo, `Input tax ${header.bill_no}`, totals.tax_amount, header.id]
        );
        lineNo += 1;
      }

      await this.q(
        `INSERT INTO journal_lines
         (id, journal_entry_id, line_order, account_code, description, debit, credit, reference_type, reference_id)
         VALUES (?, ?, ?, 'AP', ?, 0, ?, 'purchase_bill', ?)`,
        [newId(), entryId, lineNo, `Accounts Payable ${header.bill_no}`, totals.total_amount, header.id]
      );

      await this.q(
        `UPDATE purchase_bill_headers
            SET status='posted', posted_journal_entry_id=?, posted_at=NOW(), updated_at=NOW()
          WHERE id=? AND user_id=?`,
        [entryId, header.id, userId]
      );

      await this.commit();
      return { id: header.id, status: "posted", journal_entry_id: entryId, ...totals };
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }
}

module.exports = {
  InvoicePurchaseService,
};
