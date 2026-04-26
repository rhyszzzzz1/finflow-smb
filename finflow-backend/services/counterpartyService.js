"use strict";

const crypto = require("crypto");
const { sqlParams } = require("../utils/sqlParams");

class CounterpartyService {
  constructor(pool, options = {}) {
    if (!pool) {
      throw new Error("CounterpartyService requires a mysql2/promise pool");
    }
    this.pool = pool;
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    /** Dedupe noisy fallback logs — resolveCompanyId is called on many hot paths. */
    this._companyFallbackWarned = new Set();
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

  normalizeText(value) {
    return String(value || "").trim();
  }

  async ensureSchema() {
    const statements = [
      `
      CREATE TABLE IF NOT EXISTS counterparties (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        linked_profile_id VARCHAR(36) NULL,
        display_name VARCHAR(255) NOT NULL,
        legal_name VARCHAR(255) NULL,
        tax_number VARCHAR(100) NULL,
        email VARCHAR(255) NULL,
        phone VARCHAR(50) NULL,
        address TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_counterparties_company_linked_profile (company_id, linked_profile_id),
        KEY idx_counterparties_company_name (company_id, display_name)
      )
      `,
      `
      CREATE TABLE IF NOT EXISTS counterparty_roles (
        id VARCHAR(36) PRIMARY KEY,
        counterparty_id VARCHAR(36) NOT NULL,
        role_type ENUM('customer','vendor') NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_counterparty_roles_pair (counterparty_id, role_type),
        KEY idx_counterparty_roles_role (role_type)
      )
      `,
      `ALTER TABLE clients ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE vendors ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(50) NULL`,
      `ALTER TABLE sales_invoice_headers ADD COLUMN IF NOT EXISTS customer_address TEXT NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_legal_name VARCHAR(255) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_phone VARCHAR(50) NULL`,
      `ALTER TABLE purchase_bill_headers ADD COLUMN IF NOT EXISTS vendor_address TEXT NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS counterparty_id VARCHAR(36) NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS counterparty_role ENUM('customer','vendor') NULL`,
      `ALTER TABLE payments ADD COLUMN IF NOT EXISTS counterparty_name VARCHAR(255) NULL`,
    ];

    for (const sql of statements) {
      try {
        await this.pool.execute(sql);
      } catch (_error) {
        // Transitional environments may already differ. Keep schema setup resilient.
      }
    }
  }

  async resolveCompanyId(conn, actorUserId) {
    const company = await this.queryOne(
      conn,
      `SELECT id
         FROM companies
        WHERE legacy_profile_id = ?
           OR owner_profile_id = ?
        LIMIT 1`,
      [actorUserId, actorUserId]
    ).catch(() => null);

    if (!company?.id) {
      // Transitional compatibility: older seeded/demo environments may still
      // operate with profile-scoped data and no populated companies row.
      if (!this._companyFallbackWarned.has(actorUserId)) {
        this._companyFallbackWarned.add(actorUserId);
        console.warn(
          `[COUNTERPARTY_COMPANY_FALLBACK] No company mapping found for actor ${actorUserId}; falling back to profile-scoped company id (this message is shown once per process).`
        );
      }
      return actorUserId;
    }

    return company.id;
  }

  async ensureRole(conn, counterpartyId, roleType) {
    const existing = await this.queryOne(
      conn,
      `SELECT id
         FROM counterparty_roles
        WHERE counterparty_id = ?
          AND role_type = ?
        LIMIT 1`,
      [counterpartyId, roleType]
    ).catch(() => null);

    if (!existing) {
      await conn.execute(
        `INSERT INTO counterparty_roles (id, counterparty_id, role_type)
         VALUES (?, ?, ?)`,
        sqlParams([this.idFactory(), counterpartyId, roleType])
      );
    }
  }

  async getCanonicalById(conn, companyId, counterpartyId, roleType = null) {
    const params = [];
    let roleJoin = "";
    if (roleType) {
      roleJoin = `JOIN counterparty_roles cr ON cr.counterparty_id = cp.id AND cr.role_type = ?`;
      params.push(roleType);
    }
    params.push(counterpartyId, companyId);

    return this.queryOne(
      conn,
      `SELECT cp.*
         FROM counterparties cp
         ${roleJoin}
        WHERE cp.id = ?
          AND cp.company_id = ?
          AND cp.is_active = 1
        LIMIT 1`,
      params
    ).catch(() => null);
  }

  async findByLinkedProfile(conn, companyId, linkedProfileId) {
    if (!linkedProfileId) return null;
    return this.queryOne(
      conn,
      `SELECT *
         FROM counterparties
        WHERE company_id = ?
          AND linked_profile_id = ?
          AND is_active = 1
        LIMIT 1`,
      [companyId, linkedProfileId]
    ).catch(() => null);
  }

  async findByNameAndRole(conn, companyId, roleType, name) {
    const normalized = this.normalizeText(name);
    if (!normalized) return null;
    return this.queryOne(
      conn,
      `SELECT cp.*
         FROM counterparties cp
         JOIN counterparty_roles cr
           ON cr.counterparty_id = cp.id
          AND cr.role_type = ?
        WHERE cp.company_id = ?
          AND cp.is_active = 1
          AND (
            LOWER(cp.display_name) = LOWER(?)
            OR LOWER(COALESCE(cp.legal_name, '')) = LOWER(?)
          )
        ORDER BY cp.updated_at DESC
        LIMIT 1`,
      [roleType, companyId, normalized, normalized]
    ).catch(() => null);
  }

  async buildFromLinkedProfile(conn, linkedProfileId) {
    if (!linkedProfileId) return null;
    const profile = await this.queryOne(
      conn,
      `SELECT id, name, email, business_name, gst_number, address
         FROM profiles
        WHERE id = ?
        LIMIT 1`,
      [linkedProfileId]
    ).catch(() => null);

    if (!profile) return null;
    return {
      linked_profile_id: profile.id,
      display_name: this.normalizeText(profile.business_name || profile.name || profile.email),
      legal_name: this.normalizeText(profile.business_name || profile.name || profile.email) || null,
      pan_vat_number: this.normalizeText(profile.gst_number) || null,
      email: this.normalizeText(profile.email) || null,
      phone: null,
      address: this.normalizeText(profile.address) || null,
    };
  }

  toSnapshot(counterparty, sourceType) {
    const displayName = this.normalizeText(counterparty.display_name || counterparty.legal_name || counterparty.email);
    const legalName = this.normalizeText(counterparty.legal_name) || null;
    const panVatNumber = this.normalizeText(counterparty.pan_vat_number || counterparty.tax_number) || null;
    const email = this.normalizeText(counterparty.email) || null;
    const phone = this.normalizeText(counterparty.phone) || null;
    const address = this.normalizeText(counterparty.address) || null;

    return {
      id: counterparty.id,
      counterparty_id: counterparty.id,
      display_name: displayName,
      legal_name: legalName,
      pan_vat_number: panVatNumber,
      tax_number: panVatNumber,
      email,
      phone,
      address,
      linked_profile_id: counterparty.linked_profile_id || null,
      source_type: sourceType,
      snapshot_name: displayName,
      snapshot_legal_name: legalName,
      snapshot_tax_number: panVatNumber,
      snapshot_email: email,
      snapshot_phone: phone,
      snapshot_address: address,
    };
  }

  async createCounterparty(conn, {
    companyId,
    roleType,
    linkedProfileId = null,
    displayName,
    legalName = null,
    taxNumber = null,
    email = null,
    phone = null,
    address = null,
  }) {
    const counterpartyId = this.idFactory();
    await conn.execute(
      `INSERT INTO counterparties
        (id, company_id, linked_profile_id, display_name, legal_name, tax_number, email, phone, address, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      sqlParams([
        counterpartyId,
        companyId,
        linkedProfileId,
        this.normalizeText(displayName),
        this.normalizeText(legalName) || null,
        this.normalizeText(taxNumber) || null,
        this.normalizeText(email) || null,
        this.normalizeText(phone) || null,
        this.normalizeText(address) || null,
      ])
    );
    await this.ensureRole(conn, counterpartyId, roleType);
    return this.getCanonicalById(conn, companyId, counterpartyId);
  }

  async syncLegacyEntityCounterparty(conn, roleType, legacyId, counterpartyId) {
    if (!legacyId || !counterpartyId) return;
    const tableName = roleType === "customer" ? "clients" : "vendors";
    await conn.execute(
      `UPDATE ${tableName}
          SET counterparty_id = COALESCE(counterparty_id, ?)
        WHERE id = ?`,
      sqlParams([counterpartyId, legacyId])
    ).catch(() => null);
  }

  async promoteToCanonical(conn, companyId, roleType, payload = {}) {
    const linkedProfileId = payload.linked_profile_id || null;
    const existingById = payload.id
      ? await this.getCanonicalById(conn, companyId, payload.id, roleType)
      : null;
    if (existingById) {
      return existingById;
    }

    const existingByProfile = linkedProfileId
      ? await this.findByLinkedProfile(conn, companyId, linkedProfileId)
      : null;
    if (existingByProfile) {
      await this.ensureRole(conn, existingByProfile.id, roleType);
      return existingByProfile;
    }

    const existingByName = await this.findByNameAndRole(conn, companyId, roleType, payload.display_name);
    if (existingByName) {
      return existingByName;
    }

    return this.createCounterparty(conn, {
      companyId,
      roleType,
      linkedProfileId,
      displayName: payload.display_name,
      legalName: payload.legal_name || payload.display_name,
      taxNumber: payload.pan_vat_number || payload.tax_number || null,
      email: payload.email || null,
      phone: payload.phone || null,
      address: payload.address || null,
    });
  }

  async resolveModernCustomer(conn, companyId, customerId) {
    if (!customerId) return null;
    const row = await this.queryOne(
      conn,
      `SELECT
          c.id,
          c.linked_company_id AS linked_profile_id,
          COALESCE(c.display_name, c.legal_name, c.email) AS display_name,
          c.legal_name,
          COALESCE(c.pan_vat_number, c.tax_number) AS pan_vat_number,
          c.email,
          c.phone,
          COALESCE(c.billing_address, c.address) AS address
       FROM customers c
       WHERE c.id = ?
         AND c.company_id = ?
         AND COALESCE(c.status, 'active') != 'inactive'
       LIMIT 1`,
      [customerId, companyId]
    ).catch(() => null);

    if (!row) return null;
    const canonical = await this.promoteToCanonical(conn, companyId, "customer", row);
    return this.toSnapshot(canonical, "modern_customer");
  }

  async resolveModernVendor(conn, companyId, vendorId) {
    if (!vendorId) return null;

    // TODO(accounting-refactor): prefer a fully normalized vendor master once the
    // repo stops overloading the legacy `vendors` table shape.
    const row = await this.queryOne(
      conn,
      `SELECT
          v.id,
          COALESCE(v.linked_company_id, v.linked_profile_id) AS linked_profile_id,
          COALESCE(v.display_name, v.vendor_name, v.legal_name, v.email) AS display_name,
          COALESCE(v.legal_name, v.vendor_name) AS legal_name,
          COALESCE(v.pan_vat_number, v.tax_number) AS pan_vat_number,
          v.email,
          v.phone,
          COALESCE(v.billing_address, v.address) AS address,
          v.counterparty_id
       FROM vendors v
       WHERE v.id = ?
         AND v.company_id = ?
         AND COALESCE(v.status, 'active') != 'inactive'
       LIMIT 1`,
      [vendorId, companyId]
    ).catch(() => null);

    if (!row) return null;
    if (row.counterparty_id) {
      const canonical = await this.getCanonicalById(conn, companyId, row.counterparty_id, "vendor");
      if (canonical) {
        return this.toSnapshot(canonical, "modern_vendor");
      }
    }

    const canonical = await this.promoteToCanonical(conn, companyId, "vendor", row);
    return this.toSnapshot(canonical, "modern_vendor");
  }

  async resolveCustomerByLegacyClient(conn, actorUserId, companyId, clientId) {
    if (!clientId) return null;

    // TODO(accounting-refactor): remove this fallback after invoice creation and
    // settlement stop accepting legacy `clients.id`.
    const row = await this.queryOne(
      conn,
      `SELECT id, counterparty_id, linked_profile_id, client_name AS display_name, email, phone, address
         FROM clients
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [clientId, actorUserId]
    ).catch(() => null);

    if (!row) return null;
    if (row.counterparty_id) {
      const canonical = await this.getCanonicalById(conn, companyId, row.counterparty_id, "customer");
      if (canonical) {
        return this.toSnapshot(canonical, "legacy_client");
      }
    }

    const profileData = await this.buildFromLinkedProfile(conn, row.linked_profile_id);
    const canonical = await this.promoteToCanonical(conn, companyId, "customer", {
      linked_profile_id: row.linked_profile_id || profileData?.linked_profile_id || null,
      display_name: profileData?.display_name || row.display_name,
      legal_name: profileData?.legal_name || row.display_name,
      pan_vat_number: profileData?.pan_vat_number || null,
      email: row.email || profileData?.email || null,
      phone: row.phone || profileData?.phone || null,
      address: row.address || profileData?.address || null,
    });
    await this.syncLegacyEntityCounterparty(conn, "customer", row.id, canonical.id);
    return this.toSnapshot(canonical, "legacy_client");
  }

  async resolveVendorByLegacyVendor(conn, actorUserId, companyId, vendorId) {
    if (!vendorId) return null;

    // TODO(accounting-refactor): remove this fallback after purchase bills and
    // settlement stop accepting legacy `vendors.id`.
    const row = await this.queryOne(
      conn,
      `SELECT id, counterparty_id, linked_profile_id, vendor_name AS display_name, email, phone, address
         FROM vendors
        WHERE id = ?
          AND user_id = ?
        LIMIT 1`,
      [vendorId, actorUserId]
    ).catch(() => null);

    if (!row) return null;
    if (row.counterparty_id) {
      const canonical = await this.getCanonicalById(conn, companyId, row.counterparty_id, "vendor");
      if (canonical) {
        return this.toSnapshot(canonical, "legacy_vendor");
      }
    }

    const profileData = await this.buildFromLinkedProfile(conn, row.linked_profile_id);
    const canonical = await this.promoteToCanonical(conn, companyId, "vendor", {
      linked_profile_id: row.linked_profile_id || profileData?.linked_profile_id || null,
      display_name: profileData?.display_name || row.display_name,
      legal_name: profileData?.legal_name || row.display_name,
      pan_vat_number: profileData?.pan_vat_number || null,
      email: row.email || profileData?.email || null,
      phone: row.phone || profileData?.phone || null,
      address: row.address || profileData?.address || null,
    });
    await this.syncLegacyEntityCounterparty(conn, "vendor", row.id, canonical.id);
    return this.toSnapshot(canonical, "legacy_vendor");
  }

  async resolveByNameFallback(conn, companyId, roleType, input = {}) {
    const fallbackName = this.normalizeText(
      input.name
      || input.customer_name
      || input.vendor_name
      || input.client_name
      || input.display_name
    );
    if (!fallbackName) {
      throw new Error(`${roleType === "customer" ? "Customer" : "Vendor"} reference is required`);
    }

    const byName = await this.findByNameAndRole(conn, companyId, roleType, fallbackName);
    if (byName) {
      return this.toSnapshot(byName, roleType === "customer" ? "modern_customer" : "modern_vendor");
    }

    const linkedProfileId = input.linkedProfileId || input.linked_profile_id || null;
    const profileData = await this.buildFromLinkedProfile(conn, linkedProfileId);
    const canonical = await this.createCounterparty(conn, {
      companyId,
      roleType,
      linkedProfileId: linkedProfileId || profileData?.linked_profile_id || null,
      displayName: profileData?.display_name || fallbackName,
      legalName: input.legal_name || profileData?.legal_name || fallbackName,
      taxNumber: input.tax_number || input.pan_vat_number || profileData?.pan_vat_number || null,
      email: input.email || profileData?.email || null,
      phone: input.phone || profileData?.phone || null,
      address: input.address || profileData?.address || null,
    });
    return this.toSnapshot(canonical, roleType === "customer" ? "modern_customer" : "modern_vendor");
  }

  async resolveCustomerSnapshot(conn, actorUserId, companyId, customerId, input = {}) {
    const resolvedCompanyId = companyId || await this.resolveCompanyId(conn, actorUserId);

    const explicitCounterpartyId = input.counterparty_id || input.counterpartyId || null;
    if (explicitCounterpartyId) {
      const canonical = await this.getCanonicalById(conn, resolvedCompanyId, explicitCounterpartyId, "customer");
      if (!canonical) throw new Error("Customer not found");
      return this.toSnapshot(canonical, "modern_customer");
    }

    // Draft payloads and list dropdowns may send the canonical counterparty id as client/customer id.
    if (customerId) {
      const byCanonical = await this.getCanonicalById(conn, resolvedCompanyId, customerId, "customer");
      if (byCanonical) {
        return this.toSnapshot(byCanonical, "modern_customer");
      }
    }

    const modern = await this.resolveModernCustomer(conn, resolvedCompanyId, customerId);
    if (modern) return modern;

    const legacy = await this.resolveCustomerByLegacyClient(conn, actorUserId, resolvedCompanyId, customerId || input.client_id || null);
    if (legacy) return legacy;

    return this.resolveByNameFallback(conn, resolvedCompanyId, "customer", input);
  }

  async resolveVendorSnapshot(conn, actorUserId, companyId, vendorId, input = {}) {
    const resolvedCompanyId = companyId || await this.resolveCompanyId(conn, actorUserId);

    const explicitCounterpartyId = input.counterparty_id || input.counterpartyId || null;
    if (explicitCounterpartyId) {
      const canonical = await this.getCanonicalById(conn, resolvedCompanyId, explicitCounterpartyId, "vendor");
      if (!canonical) throw new Error("Vendor not found");
      return this.toSnapshot(canonical, "modern_vendor");
    }

    // Draft payloads and list dropdowns may send the canonical counterparty id as vendor id.
    if (vendorId) {
      const byCanonical = await this.getCanonicalById(conn, resolvedCompanyId, vendorId, "vendor");
      if (byCanonical) {
        return this.toSnapshot(byCanonical, "modern_vendor");
      }
    }

    const modern = await this.resolveModernVendor(conn, resolvedCompanyId, vendorId);
    if (modern) return modern;

    const legacy = await this.resolveVendorByLegacyVendor(conn, actorUserId, resolvedCompanyId, vendorId);
    if (legacy) return legacy;

    return this.resolveByNameFallback(conn, resolvedCompanyId, "vendor", input);
  }

  async resolveDocumentCounterparty(conn, actorUserId, input = {}) {
    const companyId = input.companyId || await this.resolveCompanyId(conn, actorUserId);
    const roleType = input.roleType;
    if (roleType === "customer") {
      return this.resolveCustomerSnapshot(
        conn,
        actorUserId,
        companyId,
        input.customer_id || input.client_id || null,
        input
      );
    }
    if (roleType === "vendor") {
      return this.resolveVendorSnapshot(
        conn,
        actorUserId,
        companyId,
        input.vendor_id || null,
        input
      );
    }
    throw new Error("roleType must be customer or vendor");
  }

  async createOrUpdateCounterparty(conn, actorUserId, payload = {}) {
    // Never trust client-supplied company scope (would allow cross-tenant counterparty writes).
    const companyId = await this.resolveCompanyId(conn, actorUserId);
    const roleTypes = Array.isArray(payload.role_types) && payload.role_types.length
      ? payload.role_types
      : (payload.role_type ? [payload.role_type] : []);
    if (!roleTypes.length) {
      throw new Error("role_type or role_types is required");
    }

    let counterparty = null;
    if (payload.counterparty_id) {
      counterparty = await this.getCanonicalById(conn, companyId, payload.counterparty_id);
      if (!counterparty) {
        throw new Error("Counterparty not found");
      }
      await conn.execute(
        `UPDATE counterparties
            SET display_name = ?,
                legal_name = ?,
                tax_number = ?,
                email = ?,
                phone = ?,
                address = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        sqlParams([
          this.normalizeText(payload.display_name || counterparty.display_name),
          this.normalizeText(payload.legal_name || counterparty.legal_name) || null,
          this.normalizeText(payload.tax_number || counterparty.tax_number) || null,
          this.normalizeText(payload.email || counterparty.email) || null,
          this.normalizeText(payload.phone || counterparty.phone) || null,
          this.normalizeText(payload.address || counterparty.address) || null,
          payload.is_active === false ? 0 : 1,
          counterparty.id,
        ])
      );
      counterparty = await this.getCanonicalById(conn, companyId, counterparty.id);
    } else {
      counterparty = await this.createCounterparty(conn, {
        companyId,
        roleType: roleTypes[0],
        linkedProfileId: payload.linked_profile_id || null,
        displayName: payload.display_name || payload.legal_name || payload.email,
        legalName: payload.legal_name || payload.display_name || null,
        taxNumber: payload.tax_number || payload.pan_vat_number || null,
        email: payload.email || null,
        phone: payload.phone || null,
        address: payload.address || null,
      });
    }

    for (const roleType of roleTypes) {
      await this.ensureRole(conn, counterparty.id, roleType);
    }

    const roles = await this.queryAll(
      conn,
      `SELECT role_type
         FROM counterparty_roles
        WHERE counterparty_id = ?
        ORDER BY role_type ASC`,
      [counterparty.id]
    ).catch(() => []);

    return {
      ...counterparty,
      role_types: roles.map((row) => row.role_type),
    };
  }
}

module.exports = {
  CounterpartyService,
};
