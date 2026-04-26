"use strict";

const crypto = require("crypto");

/**
 * Khalti ePayment (KPG-2) for vendor / payable settlement — server-side redirect flow.
 * @see KHALTI_INTEGRATION_GUIDE.md
 */
class KhaltiVendorPaymentService {
  constructor(pool, options = {}) {
    if (!pool) throw new Error("KhaltiVendorPaymentService requires pool");
    if (!options.settlementService) throw new Error("KhaltiVendorPaymentService requires settlementService");
    this.pool = pool;
    this.settlementService = options.settlementService;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
  }

  getSecretKey() {
    return String(process.env.KHALTI_SECRET_KEY || "").trim();
  }

  getApiBaseUrl() {
    const u = String(process.env.KHALTI_API_BASE_URL || "https://dev.khalti.com/api/v2/").trim();
    return u.endsWith("/") ? u : `${u}/`;
  }

  /** Public site origin used in Khalti payload (e.g. https://app.example.com) */
  getWebsiteOrigin() {
    const fromEnv = String(process.env.KHALTI_WEBSITE_URL || process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
    return fromEnv || "http://localhost:5173";
  }

  returnPath() {
    return String(process.env.KHALTI_VENDOR_RETURN_PATH || "/settlements?tab=payables").trim() || "/settlements?tab=payables";
  }

  async ensureSchema() {
    await this.pool.execute(`
      CREATE TABLE IF NOT EXISTS khalti_vendor_payment_sessions (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        pidx VARCHAR(128) NULL,
        amount DECIMAL(14,2) NOT NULL,
        payment_date DATE NOT NULL,
        vendor_id VARCHAR(36) NOT NULL,
        allocations_json JSON NOT NULL,
        reference VARCHAR(255) NULL,
        notes TEXT NULL,
        document_no VARCHAR(255) NULL,
        status ENUM('pending','settling','completed','failed','cancelled') NOT NULL DEFAULT 'pending',
        result_payment_id VARCHAR(36) NULL,
        khalti_transaction_id VARCHAR(128) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_khalti_vendor_sessions_user (user_id),
        KEY idx_khalti_vendor_sessions_pidx (pidx)
      )
    `).catch(() => {});
    try {
      await this.pool.execute(
        `ALTER TABLE khalti_vendor_payment_sessions
          MODIFY COLUMN status ENUM('pending','settling','completed','failed','cancelled') NOT NULL DEFAULT 'pending'`
      );
    } catch (_e) {
      /* ignore */
    }
  }

  money(value) {
    return Number(Number(value || 0).toFixed(2));
  }

  amountToPaisa(amount) {
    return Math.round(this.money(amount) * 100);
  }

  parseKhaltiError(text) {
    try {
      const j = JSON.parse(text);
      if (j.detail) return String(j.detail);
      if (j.message) return String(j.message);
    } catch (_e) {
      /* ignore */
    }
    return text || "Khalti request failed";
  }

  async initiateVendorPayment(actorUserId, body, requestMeta = {}) {
    const secret = this.getSecretKey();
    if (!secret) {
      const err = new Error("Khalti is not configured: set KHALTI_SECRET_KEY in the server environment");
      err.statusCode = 503;
      throw err;
    }

    const {
      amount,
      date,
      vendor_id: vendorId,
      allocations,
      reference = null,
      notes = null,
      document_no: documentNo = null,
    } = body || {};

    const paymentAmount = this.money(amount);
    if (paymentAmount <= 0) {
      const err = new Error("amount must be a positive number");
      err.statusCode = 400;
      throw err;
    }
    if (!date) {
      const err = new Error("date is required");
      err.statusCode = 400;
      throw err;
    }
    if (!vendorId) {
      const err = new Error("vendor_id is required");
      err.statusCode = 400;
      throw err;
    }
    if (!Array.isArray(allocations) || allocations.length === 0) {
      const err = new Error("allocations must be a non-empty array");
      err.statusCode = 400;
      throw err;
    }

    const sessionId = this.idFactory();
    const websiteOrigin = this.getWebsiteOrigin();
    const returnUrl = `${websiteOrigin}${this.returnPath()}`;

    await this.pool.execute(
      `INSERT INTO khalti_vendor_payment_sessions
        (id, user_id, pidx, amount, payment_date, vendor_id, allocations_json, reference, notes, document_no, status)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        sessionId,
        actorUserId,
        paymentAmount,
        date,
        vendorId,
        JSON.stringify(allocations),
        reference,
        notes,
        documentNo,
      ]
    );

    const apiBase = this.getApiBaseUrl();
    const payload = {
      return_url: returnUrl,
      website_url: websiteOrigin,
      amount: this.amountToPaisa(paymentAmount),
      purchase_order_id: sessionId,
      purchase_order_name: String(documentNo || `Vendor payment ${sessionId.slice(0, 8)}`).slice(0, 80),
    };

    let khaltiRes;
    try {
      khaltiRes = await fetch(`${apiBase}epayment/initiate/`, {
        method: "POST",
        headers: {
          Authorization: `Key ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (netErr) {
      await this.pool.execute(`UPDATE khalti_vendor_payment_sessions SET status='failed' WHERE id=?`, [sessionId]);
      const err = new Error(netErr.message || "Khalti network error");
      err.statusCode = 502;
      throw err;
    }

    const rawText = await khaltiRes.text();
    if (!khaltiRes.ok) {
      await this.pool.execute(`UPDATE khalti_vendor_payment_sessions SET status='failed' WHERE id=?`, [sessionId]);
      const err = new Error(this.parseKhaltiError(rawText));
      err.statusCode = 502;
      throw err;
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_e) {
      await this.pool.execute(`UPDATE khalti_vendor_payment_sessions SET status='failed' WHERE id=?`, [sessionId]);
      const err = new Error("Invalid response from Khalti");
      err.statusCode = 502;
      throw err;
    }

    const paymentUrl = data.payment_url;
    const pidx = data.pidx;
    if (!paymentUrl || !pidx) {
      await this.pool.execute(`UPDATE khalti_vendor_payment_sessions SET status='failed' WHERE id=?`, [sessionId]);
      const err = new Error("Khalti did not return payment_url or pidx");
      err.statusCode = 502;
      throw err;
    }

    await this.pool.execute(`UPDATE khalti_vendor_payment_sessions SET pidx=? WHERE id=?`, [pidx, sessionId]);

    return {
      payment_url: paymentUrl,
      pidx,
      expires_at: data.expires_at || null,
      expires_in: data.expires_in ?? null,
      session_id: sessionId,
    };
  }

  async verifyAndSettle(actorUserId, body, requestMeta = {}) {
    const secret = this.getSecretKey();
    if (!secret) {
      const err = new Error("Khalti is not configured: set KHALTI_SECRET_KEY");
      err.statusCode = 503;
      throw err;
    }

    const pidx = String(body?.pidx || "").trim();
    if (!pidx) {
      const err = new Error("pidx is required");
      err.statusCode = 400;
      throw err;
    }

    const [rows] = await this.pool.execute(
      `SELECT * FROM khalti_vendor_payment_sessions WHERE pidx=? AND user_id=? LIMIT 1`,
      [pidx, actorUserId]
    );
    const session = rows[0];
    if (!session) {
      const err = new Error("Payment session not found");
      err.statusCode = 404;
      throw err;
    }

    if (session.status === "completed" && session.result_payment_id) {
      return {
        verified: true,
        already_completed: true,
        payment_id: session.result_payment_id,
      };
    }
    if (session.status === "settling") {
      return { verified: false, detail: "Settlement is in progress. Refresh in a moment." };
    }

    const apiBase = this.getApiBaseUrl();
    let lookupRes;
    try {
      lookupRes = await fetch(`${apiBase}epayment/lookup/`, {
        method: "POST",
        headers: {
          Authorization: `Key ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx }),
      });
    } catch (netErr) {
      const err = new Error(netErr.message || "Khalti lookup failed");
      err.statusCode = 502;
      throw err;
    }

    const lookupText = await lookupRes.text();
    if (!lookupRes.ok) {
      const err = new Error(this.parseKhaltiError(lookupText));
      err.statusCode = 502;
      throw err;
    }

    let lookup;
    try {
      lookup = JSON.parse(lookupText);
    } catch (_e) {
      const err = new Error("Invalid Khalti lookup response");
      err.statusCode = 502;
      throw err;
    }

    const status = String(lookup.status || "");
    const txnId = lookup.transaction_id != null ? String(lookup.transaction_id) : null;
    const lookupAmountPaisa = Number(
      lookup.total_amount != null ? lookup.total_amount : lookup.amount
    );
    const expectedPaisa = this.amountToPaisa(session.amount);

    if (status !== "Completed") {
      await this.pool.execute(
        `UPDATE khalti_vendor_payment_sessions SET status='failed', khalti_transaction_id=? WHERE id=? AND status='pending'`,
        [txnId, session.id]
      );
      return { verified: false, status, detail: "Payment not completed in Khalti" };
    }

    if (!Number.isFinite(lookupAmountPaisa) || lookupAmountPaisa !== expectedPaisa) {
      await this.pool.execute(
        `UPDATE khalti_vendor_payment_sessions SET status='failed', khalti_transaction_id=? WHERE id=?`,
        [txnId, session.id]
      );
      const err = new Error("Khalti amount does not match session");
      err.statusCode = 400;
      throw err;
    }

    const [gateResult] = await this.pool.execute(
      `UPDATE khalti_vendor_payment_sessions SET status='settling' WHERE id=? AND status='pending'`,
      [session.id]
    );
    if (!gateResult.affectedRows) {
      const [again] = await this.pool.execute(
        `SELECT status, result_payment_id FROM khalti_vendor_payment_sessions WHERE id=? LIMIT 1`,
        [session.id]
      );
      const row = again[0];
      if (row?.status === "completed" && row.result_payment_id) {
        return { verified: true, already_completed: true, payment_id: row.result_payment_id };
      }
      return { verified: false, detail: "This payment session is no longer active" };
    }

    let allocations;
    try {
      allocations = typeof session.allocations_json === "string"
        ? JSON.parse(session.allocations_json)
        : session.allocations_json;
    } catch (_e) {
      const err = new Error("Invalid stored allocations");
      err.statusCode = 500;
      throw err;
    }

    const ref = session.reference
      ? `${session.reference} (Khalti)`
      : `Khalti${txnId ? ` ${txnId}` : ""}`;
    const noteParts = [session.notes, txnId ? `Khalti transaction_id=${txnId}` : null, `pidx=${pidx}`].filter(Boolean);

    try {
      const paymentResult = await this.settlementService.applyPayment(
        actorUserId,
        {
          type: "outgoing",
          amount: this.money(session.amount),
          date: String(session.payment_date).slice(0, 10),
          method: "wallet",
          bank_account_id: null,
          vendor_id: session.vendor_id,
          reference: ref,
          notes: noteParts.join(" | "),
          allocations,
        },
        requestMeta
      );

      await this.pool.execute(
        `UPDATE khalti_vendor_payment_sessions
            SET status='completed',
                result_payment_id=?,
                khalti_transaction_id=?
          WHERE id=?`,
        [paymentResult.id, txnId, session.id]
      );

      return {
        verified: true,
        payment: paymentResult,
      };
    } catch (applyErr) {
      await this.pool.execute(
        `UPDATE khalti_vendor_payment_sessions SET status='failed', khalti_transaction_id=COALESCE(?, khalti_transaction_id) WHERE id=?`,
        [txnId, session.id]
      );
      throw applyErr;
    }
  }
}

module.exports = {
  KhaltiVendorPaymentService,
};
