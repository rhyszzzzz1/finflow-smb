"use strict";

const crypto = require("crypto");
const { sqlParams } = require("../utils/sqlParams");

class BusinessRelationshipService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("BusinessRelationshipService requires a mysql2/promise pool");
    }
    this.pool = pool;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.counterpartyService = options.counterpartyService || null;
  }

  /**
   * Sales/procurement dropdowns read legacy `clients` / `vendors` by user_id (profile).
   * Mirror accepted relationships into those tables so each side sees the other party by name.
   */
  async syncLegacyCounterpartiesFromRelationship(conn, row) {
    if (!this.counterpartyService || !row || row.relationship_status !== "accepted") return;

    const buyerPid = row.buyer_profile_id ? String(row.buyer_profile_id).trim() : null;
    const sellerPid = row.seller_profile_id ? String(row.seller_profile_id).trim() : null;
    if (!buyerPid || !sellerPid) return;

    const loadProfile = async (profileId) =>
      this.queryOne(
        conn,
        `SELECT id, name, email, business_name, gst_number, address
           FROM profiles
          WHERE id = ?
            AND COALESCE(is_admin, 0) = 0
          LIMIT 1`,
        [profileId]
      );

    // Seller's customer list: the buyer
    const existingClient = await this.queryOne(
      conn,
      `SELECT id FROM clients WHERE user_id = ? AND linked_profile_id = ? LIMIT 1`,
      [sellerPid, buyerPid]
    );
    if (!existingClient) {
      const buyerProf = await loadProfile(buyerPid);
      if (buyerProf) {
        const clientName = buyerProf.business_name || buyerProf.name || buyerProf.email || "Customer";
        const sellerCompanyId = await this.counterpartyService.resolveCompanyId(conn, sellerPid);
        const counterparty = await this.counterpartyService.promoteToCanonical(conn, sellerCompanyId, "customer", {
          linked_profile_id: buyerPid,
          display_name: clientName,
          legal_name: buyerProf.business_name || buyerProf.name || clientName,
          tax_number: buyerProf.gst_number || null,
          email: buyerProf.email || null,
          address: buyerProf.address || null,
        });
        const legacyClientId = this.idFactory();
        await conn.execute(
          `INSERT INTO clients (id, user_id, linked_profile_id, counterparty_id, client_name, email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          sqlParams([legacyClientId, sellerPid, buyerPid, counterparty.id, clientName, buyerProf.email || null])
        );
      }
    }

    // Buyer's vendor list: the seller
    const existingVendor = await this.queryOne(
      conn,
      `SELECT id FROM vendors WHERE user_id = ? AND linked_profile_id = ? LIMIT 1`,
      [buyerPid, sellerPid]
    );
    if (!existingVendor) {
      const sellerProf = await loadProfile(sellerPid);
      if (sellerProf) {
        const vendorName = sellerProf.business_name || sellerProf.name || sellerProf.email || "Vendor";
        const buyerCompanyId = await this.counterpartyService.resolveCompanyId(conn, buyerPid);
        const counterparty = await this.counterpartyService.promoteToCanonical(conn, buyerCompanyId, "vendor", {
          linked_profile_id: sellerPid,
          display_name: vendorName,
          legal_name: sellerProf.business_name || sellerProf.name || vendorName,
          tax_number: sellerProf.gst_number || null,
          email: sellerProf.email || null,
          address: sellerProf.address || null,
        });
        const legacyVendorId = this.idFactory();
        await conn.execute(
          `INSERT INTO vendors (id, user_id, linked_profile_id, counterparty_id, vendor_name, email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          sqlParams([legacyVendorId, buyerPid, sellerPid, counterparty.id, vendorName, sellerProf.email || null])
        );
      }
    }
  }

  async queryAll(conn, sql, params = []) {
    const executor = conn || this.pool;
    const [rows] = await executor.execute(sql, sqlParams(params));
    return rows;
  }

  async queryOne(conn, sql, params = []) {
    const rows = await this.queryAll(conn, sql, params);
    return rows[0] || null;
  }

  async withTransaction(work) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await work(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch (_rollbackError) {
        // preserve original error
      }
      throw error;
    } finally {
      conn.release();
    }
  }

  text(value) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  money(value) {
    if (value === undefined || value === null || value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return Number(parsed.toFixed(2));
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS business_relationships (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NULL,
        buyer_company_id VARCHAR(36) NOT NULL,
        seller_company_id VARCHAR(36) NOT NULL,
        buyer_profile_id VARCHAR(36) NULL,
        seller_profile_id VARCHAR(36) NULL,
        relationship_status ENUM('invited','accepted','rejected','blocked','inactive') NOT NULL DEFAULT 'invited',
        default_payment_terms_days INT NULL,
        default_currency CHAR(3) NOT NULL DEFAULT 'NPR',
        credit_limit DECIMAL(14,2) NULL,
        notes TEXT NULL,
        accepted_at TIMESTAMP NULL DEFAULT NULL,
        responded_by_user_id VARCHAR(36) NULL,
        created_by_user_id VARCHAR(36) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_business_relationship_pair (buyer_company_id, seller_company_id),
        KEY idx_business_relationships_company (company_id),
        KEY idx_business_relationships_buyer_status (buyer_company_id, relationship_status),
        KEY idx_business_relationships_seller_status (seller_company_id, relationship_status)
      )
      `,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS business_relationship_id VARCHAR(36) NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // mixed environments may already differ
      }
    }
  }

  async resolveCompanyContext(conn, { actorUserId = null, companyId = null, profileId = null } = {}) {
    if (companyId) {
      const company = await this.queryOne(
        conn,
        `SELECT
            c.id,
            COALESCE(c.legacy_profile_id, c.owner_profile_id) AS profile_id,
            COALESCE(c.legal_name, c.trade_name, p.business_name, p.name, p.email) AS display_name
         FROM companies c
         LEFT JOIN profiles p
           ON p.id = COALESCE(c.legacy_profile_id, c.owner_profile_id)
        WHERE c.id = ?
        LIMIT 1`,
        [companyId]
      ).catch(() => null);

      if (company) {
        return {
          company_id: company.id,
          profile_id: company.profile_id || profileId || actorUserId || company.id,
          display_name: company.display_name || null,
        };
      }
    }

    const targetProfileId = profileId || actorUserId;
    if (targetProfileId) {
      const company = await this.queryOne(
        conn,
        `SELECT
            c.id,
            COALESCE(c.legacy_profile_id, c.owner_profile_id) AS profile_id,
            COALESCE(c.legal_name, c.trade_name, p.business_name, p.name, p.email) AS display_name
         FROM companies c
         LEFT JOIN profiles p
           ON p.id = COALESCE(c.legacy_profile_id, c.owner_profile_id)
        WHERE c.legacy_profile_id = ?
           OR c.owner_profile_id = ?
        LIMIT 1`,
        [targetProfileId, targetProfileId]
      ).catch(() => null);

      if (company) {
        return {
          company_id: company.id,
          profile_id: company.profile_id || targetProfileId,
          display_name: company.display_name || null,
        };
      }

      const profile = await this.queryOne(
        conn,
        `SELECT id, COALESCE(business_name, name, email) AS display_name
           FROM profiles
          WHERE id = ?
          LIMIT 1`,
        [targetProfileId]
      ).catch(() => null);

      return {
        company_id: targetProfileId,
        profile_id: targetProfileId,
        display_name: profile?.display_name || null,
      };
    }

    throw new Error("Unable to resolve company context");
  }

  sid(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim();
    return s || null;
  }

  async hydrateRelationship(conn, row, viewerCompanyId = null, viewerProfileId = null) {
    if (!row) return null;

    const buyer = await this.resolveCompanyContext(conn, {
      companyId: row.buyer_company_id,
      profileId: row.buyer_profile_id,
    });
    const seller = await this.resolveCompanyContext(conn, {
      companyId: row.seller_company_id,
      profileId: row.seller_profile_id,
    });

    const vc = this.sid(viewerCompanyId);
    const vp = this.sid(viewerProfileId);
    const buyerC = this.sid(row.buyer_company_id);
    const sellerC = this.sid(row.seller_company_id);
    const buyerP = this.sid(row.buyer_profile_id);
    const sellerP = this.sid(row.seller_profile_id);

    const matchesBuyer = (vc && buyerC && vc === buyerC) || (vp && buyerP && vp === buyerP);
    const matchesSeller = (vc && sellerC && vc === sellerC) || (vp && sellerP && vp === sellerP);

    let viewer_role = null;
    if (matchesBuyer && !matchesSeller) viewer_role = "buyer";
    else if (matchesSeller && !matchesBuyer) viewer_role = "seller";
    else if (matchesBuyer) viewer_role = "buyer";
    else if (matchesSeller) viewer_role = "seller";

    const counterparty_company_id =
      viewer_role === "buyer" ? row.seller_company_id : viewer_role === "seller" ? row.buyer_company_id : null;
    const counterparty_profile_id =
      viewer_role === "buyer" ? row.seller_profile_id : viewer_role === "seller" ? row.buyer_profile_id : null;
    const counterparty_name =
      viewer_role === "buyer" ? seller.display_name : viewer_role === "seller" ? buyer.display_name : null;

    return {
      ...row,
      buyer_name: buyer.display_name,
      seller_name: seller.display_name,
      counterparty_company_id,
      counterparty_profile_id,
      counterparty_name,
      viewer_role,
    };
  }

  async findByPair(conn, buyerCompanyId, sellerCompanyId) {
    return this.queryOne(
      conn,
      `SELECT *
         FROM business_relationships
        WHERE buyer_company_id = ?
          AND seller_company_id = ?
        LIMIT 1`,
      [buyerCompanyId, sellerCompanyId]
    ).catch(() => null);
  }

  async ensureAcceptedRelationship(conn, payload = {}) {
    const buyer = await this.resolveCompanyContext(conn, {
      companyId: payload.buyer_company_id || null,
      profileId: payload.buyer_profile_id || null,
    });
    const seller = await this.resolveCompanyContext(conn, {
      companyId: payload.seller_company_id || null,
      profileId: payload.seller_profile_id || null,
    });

    if (buyer.company_id === seller.company_id) {
      throw new Error("Buyer and seller must be different businesses");
    }

    const existing = await this.findByPair(conn, buyer.company_id, seller.company_id);
    if (existing?.relationship_status === "blocked") {
      throw new Error("Business relationship is blocked");
    }

    if (existing) {
      await conn.execute(
        `UPDATE business_relationships
            SET company_id = COALESCE(?, company_id),
                buyer_profile_id = COALESCE(?, buyer_profile_id),
                seller_profile_id = COALESCE(?, seller_profile_id),
                relationship_status = 'accepted',
                default_payment_terms_days = COALESCE(?, default_payment_terms_days),
                default_currency = COALESCE(?, default_currency),
                credit_limit = COALESCE(?, credit_limit),
                notes = COALESCE(?, notes),
                accepted_at = COALESCE(accepted_at, CURRENT_TIMESTAMP),
                responded_by_user_id = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        sqlParams([
          payload.company_id || payload.created_by_company_id || seller.company_id,
          buyer.profile_id,
          seller.profile_id,
          payload.default_payment_terms_days ?? null,
          this.text(payload.default_currency) || null,
          this.money(payload.credit_limit),
          this.text(payload.notes),
          payload.created_by_user_id || null,
          existing.id,
        ])
      );
      return this.hydrateRelationship(
        conn,
        await this.queryOne(conn, `SELECT * FROM business_relationships WHERE id = ?`, [existing.id]),
        payload.viewer_company_id || payload.company_id || payload.created_by_company_id || null,
        payload.viewer_profile_id || null
      );
    }

    const relationshipId = this.idFactory();
    await conn.execute(
      `INSERT INTO business_relationships
        (id, company_id, buyer_company_id, seller_company_id, buyer_profile_id, seller_profile_id, relationship_status,
         default_payment_terms_days, default_currency, credit_limit, notes, accepted_at, responded_by_user_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)`,
      sqlParams([
        relationshipId,
        payload.company_id || payload.created_by_company_id || seller.company_id,
        buyer.company_id,
        seller.company_id,
        buyer.profile_id,
        seller.profile_id,
        payload.default_payment_terms_days ?? null,
        this.text(payload.default_currency) || "NPR",
        this.money(payload.credit_limit),
        this.text(payload.notes),
        payload.created_by_user_id || null,
        payload.created_by_user_id || null,
      ])
    );

    return this.hydrateRelationship(
      conn,
      await this.queryOne(conn, `SELECT * FROM business_relationships WHERE id = ?`, [relationshipId]),
      payload.viewer_company_id || payload.company_id || payload.created_by_company_id || null,
      payload.viewer_profile_id || null
    );
  }

  async inviteRelationship(actorUserId, payload = {}) {
    return this.withTransaction(async (conn) => {
      const actor = await this.resolveCompanyContext(conn, { actorUserId });
      const actorRole = this.text(payload.actor_role || payload.relationship_side);

      let buyer = null;
      let seller = null;

      if (payload.buyer_company_id || payload.buyer_profile_id) {
        buyer = await this.resolveCompanyContext(conn, {
          companyId: payload.buyer_company_id || null,
          profileId: payload.buyer_profile_id || null,
        });
      }
      if (payload.seller_company_id || payload.seller_profile_id) {
        seller = await this.resolveCompanyContext(conn, {
          companyId: payload.seller_company_id || null,
          profileId: payload.seller_profile_id || null,
        });
      }

      if (!buyer || !seller) {
        if (!actorRole || !["buyer", "seller"].includes(actorRole)) {
          throw new Error("actor_role must be buyer or seller when one side is omitted");
        }
        if (!buyer && actorRole === "buyer") buyer = actor;
        if (!seller && actorRole === "seller") seller = actor;
      }

      if (!buyer || !seller) {
        throw new Error("buyer and seller must be resolvable");
      }
      if (buyer.company_id === seller.company_id) {
        throw new Error("Buyer and seller must be different businesses");
      }

      const existing = await this.findByPair(conn, buyer.company_id, seller.company_id);
      if (existing?.relationship_status === "accepted" || existing?.relationship_status === "invited") {
        return this.hydrateRelationship(conn, existing, actor.company_id, actor.profile_id);
      }
      if (existing?.relationship_status === "blocked") {
        throw new Error("Business relationship is blocked");
      }

      const relationshipId = existing?.id || this.idFactory();
      if (existing) {
        await conn.execute(
          `UPDATE business_relationships
              SET company_id = ?,
                  buyer_profile_id = ?,
                  seller_profile_id = ?,
                  relationship_status = 'invited',
                  default_payment_terms_days = ?,
                  default_currency = ?,
                  credit_limit = ?,
                  notes = ?,
                  responded_by_user_id = NULL,
                  accepted_at = NULL,
                  created_by_user_id = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          sqlParams([
            actor.company_id,
            buyer.profile_id,
            seller.profile_id,
            payload.default_payment_terms_days ?? null,
            this.text(payload.default_currency) || "NPR",
            this.money(payload.credit_limit),
            this.text(payload.notes),
            actorUserId,
            relationshipId,
          ])
        );
      } else {
        await conn.execute(
          `INSERT INTO business_relationships
            (id, company_id, buyer_company_id, seller_company_id, buyer_profile_id, seller_profile_id, relationship_status,
             default_payment_terms_days, default_currency, credit_limit, notes, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?, ?)`,
          sqlParams([
            relationshipId,
            actor.company_id,
            buyer.company_id,
            seller.company_id,
            buyer.profile_id,
            seller.profile_id,
            payload.default_payment_terms_days ?? null,
            this.text(payload.default_currency) || "NPR",
            this.money(payload.credit_limit),
            this.text(payload.notes),
            actorUserId,
          ])
        );
      }

      return this.hydrateRelationship(
        conn,
        await this.queryOne(conn, `SELECT * FROM business_relationships WHERE id = ?`, [relationshipId]),
        actor.company_id,
        actor.profile_id
      );
    });
  }

  async acceptRelationship(actorUserId, relationshipId) {
    return this.withTransaction(async (conn) => {
      const actor = await this.resolveCompanyContext(conn, { actorUserId });
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM business_relationships
          WHERE id = ?
          FOR UPDATE`,
        [relationshipId]
      );
      if (!existing) {
        throw new Error("Business relationship not found");
      }
      if (![existing.buyer_company_id, existing.seller_company_id].includes(actor.company_id)) {
        throw new Error("You are not part of this business relationship");
      }
      if (existing.relationship_status === "blocked") {
        throw new Error("Blocked relationships cannot be accepted");
      }
      if (
        existing.relationship_status === "invited" &&
        existing.created_by_user_id &&
        existing.created_by_user_id === actorUserId
      ) {
        throw new Error(
          "You sent this invitation; the counterparty must log in and accept it. You cannot accept your own invite."
        );
      }
      if (existing.relationship_status !== "accepted") {
        await conn.execute(
          `UPDATE business_relationships
              SET relationship_status = 'accepted',
                  accepted_at = CURRENT_TIMESTAMP,
                  responded_by_user_id = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          sqlParams([actorUserId, relationshipId])
        );
      }

      const updated = await this.queryOne(conn, `SELECT * FROM business_relationships WHERE id = ?`, [relationshipId]);
      await this.syncLegacyCounterpartiesFromRelationship(conn, updated);

      return this.hydrateRelationship(conn, updated, actor.company_id, actor.profile_id);
    });
  }

  async listRelationships(actorUserId, options = {}) {
    const conn = await this.pool.getConnection();
    try {
      const actor = await this.resolveCompanyContext(conn, { actorUserId });
      const onlyActive = options.onlyActive === true;
      const status = this.text(options.status);
      const params = [actor.company_id, actor.company_id, actor.profile_id, actor.profile_id];
      let statusClause = "";
      if (onlyActive) {
        statusClause = ` AND br.relationship_status = 'accepted'`;
      } else if (status) {
        statusClause = ` AND br.relationship_status = ?`;
        params.push(status);
      }

      const rows = await this.queryAll(
        conn,
        `SELECT br.*
           FROM business_relationships br
          WHERE (
                  br.buyer_company_id = ?
               OR br.seller_company_id = ?
               OR br.buyer_profile_id = ?
               OR br.seller_profile_id = ?
                )
            ${statusClause}
          ORDER BY br.updated_at DESC`,
        params
      );

      const hydrated = [];
      for (const row of rows) {
        hydrated.push(await this.hydrateRelationship(conn, row, actor.company_id, actor.profile_id));
      }
      return hydrated;
    } finally {
      conn.release();
    }
  }

  async resolveActiveRelationship(conn, payload = {}) {
    const actorCtx = payload.actorUserId
      ? await this.resolveCompanyContext(conn, { actorUserId: payload.actorUserId })
      : null;
    const actorCompanyId = payload.companyId || actorCtx?.company_id;
    const actorProfileId = this.sid(actorCtx?.profile_id);
    const perspective = payload.perspective;
    if (!["buyer", "seller"].includes(perspective)) {
      throw new Error("perspective must be buyer or seller");
    }

    if (payload.businessRelationshipId) {
      const existing = await this.queryOne(
        conn,
        `SELECT *
           FROM business_relationships
          WHERE id = ?
            AND relationship_status = 'accepted'
          LIMIT 1`,
        [payload.businessRelationshipId]
      );
      if (!existing) {
        throw new Error("Business relationship not found or not accepted");
      }

      const sellerOk =
        this.sid(existing.seller_company_id) === this.sid(actorCompanyId) ||
        (actorProfileId && this.sid(existing.seller_profile_id) === actorProfileId);
      const buyerOk =
        this.sid(existing.buyer_company_id) === this.sid(actorCompanyId) ||
        (actorProfileId && this.sid(existing.buyer_profile_id) === actorProfileId);

      if (perspective === "seller" && !sellerOk) {
        throw new Error("Business relationship does not match seller context");
      }
      if (perspective === "buyer" && !buyerOk) {
        throw new Error("Business relationship does not match buyer context");
      }

      return this.hydrateRelationship(conn, existing, actorCompanyId, actorProfileId);
    }

    const targetProfileId = payload.counterpartyLinkedProfileId || null;
    if (!targetProfileId) {
      return null;
    }

    const targetContext = await this.resolveCompanyContext(conn, { profileId: targetProfileId });
    const targetCompanyId = targetContext?.company_id ?? null;
    const targetProfileResolved = this.sid(targetProfileId);

    const query =
      perspective === "seller"
        ? `SELECT *
             FROM business_relationships
            WHERE relationship_status = 'accepted'
              AND (
                    seller_company_id = ?
                 OR (? IS NOT NULL AND seller_profile_id = ?)
                  )
              AND (
                    buyer_company_id = ?
                 OR (? IS NOT NULL AND buyer_profile_id = ?)
                  )
            LIMIT 1`
        : `SELECT *
             FROM business_relationships
            WHERE relationship_status = 'accepted'
              AND (
                    buyer_company_id = ?
                 OR (? IS NOT NULL AND buyer_profile_id = ?)
                  )
              AND (
                    seller_company_id = ?
                 OR (? IS NOT NULL AND seller_profile_id = ?)
                  )
            LIMIT 1`;

    const relationship = await this.queryOne(
      conn,
      query,
      sqlParams([
        actorCompanyId,
        actorProfileId,
        actorProfileId,
        targetCompanyId,
        targetProfileResolved,
        targetProfileResolved,
      ])
    ).catch(() => null);
    return this.hydrateRelationship(conn, relationship, actorCompanyId, actorProfileId);
  }
}

module.exports = {
  BusinessRelationshipService,
};
