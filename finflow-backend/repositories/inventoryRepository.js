"use strict";

// TODO(accounting-refactor): this repository is intentionally transitional.
// It still reads/writes the legacy `inventory` table and related vendor catalog
// bridges so the runtime stays stable while item/warehouse/stock-movement
// screens migrate. Treat it as a temporary compatibility repository.
class InventoryRepository {
  constructor(db) {
    if (!db) {
      throw new Error("InventoryRepository requires a mysql2 promise connection");
    }
    this.db = db;
    /** @type {boolean | undefined} cached: whether `companies` exists in this database */
    this._hasCompaniesTable = undefined;
  }

  /**
   * Progressive schema uses `companies`; legacy finflow_smb installs may not. Cache result per process.
   */
  async hasCompaniesTable() {
    if (this._hasCompaniesTable !== undefined) {
      return this._hasCompaniesTable;
    }
    try {
      const row = await this.queryOne(
        `SELECT 1 AS ok
           FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name = 'companies'
          LIMIT 1`
      );
      this._hasCompaniesTable = Boolean(row);
    } catch (_e) {
      this._hasCompaniesTable = false;
    }
    return this._hasCompaniesTable;
  }

  async queryAll(sql, params = []) {
    const [rows] = await this.db.execute(sql, params);
    return rows;
  }

  async queryOne(sql, params = []) {
    const rows = await this.queryAll(sql, params);
    return rows[0] || null;
  }

  async execute(sql, params = []) {
    const [result] = await this.db.execute(sql, params);
    return result;
  }

  async ensureSchema() {
    const statements = [
      `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_id VARCHAR(36) NULL`,
      `ALTER TABLE inventory ADD COLUMN IF NOT EXISTS warehouse_id VARCHAR(36) NULL`,
      `
      CREATE TABLE IF NOT EXISTS item_vendor_links (
        id VARCHAR(36) PRIMARY KEY,
        company_id VARCHAR(36) NOT NULL,
        item_id VARCHAR(36) NOT NULL,
        vendor_id VARCHAR(36) NOT NULL,
        vendor_product_id VARCHAR(36) NULL,
        preferred_flag TINYINT(1) NOT NULL DEFAULT 0,
        vendor_sku VARCHAR(100) NULL,
        last_purchase_price DECIMAL(14,2) NULL,
        lead_time_days INT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_item_vendor_link_pair (company_id, item_id, vendor_id, vendor_product_id),
        KEY idx_item_vendor_links_item (company_id, item_id),
        KEY idx_item_vendor_links_vendor (company_id, vendor_id)
      )
      `,
    ];

    for (const sql of statements) {
      try {
        await this.execute(sql);
      } catch (_error) {
        // Transitional schema changes are best-effort here so startup stays stable.
      }
    }
  }

  async listInventory(userId) {
    return this.queryAll(
      `SELECT
          inv.id,
          inv.user_id,
          inv.item_id,
          inv.warehouse_id,
          inv.linked_vendor_profile_id,
          inv.vendor_product_id,
          inv.product_name,
          inv.sku,
          inv.category,
          inv.description,
          COALESCE(ledger.current_stock, inv.stock_quantity, 0) AS stock_quantity,
          inv.stock_quantity AS legacy_stock_quantity,
          CASE
            WHEN inv.item_id IS NOT NULL THEN 'ledger'
            ELSE 'legacy_inventory_snapshot'
          END AS stock_source,
          inv.purchase_price,
          inv.selling_price,
          inv.tax_rate,
          inv.vendor_name,
          inv.payment_type,
          inv.linked_purchase_id,
          inv.created_at,
          inv.updated_at
       FROM inventory inv
       LEFT JOIN items itm
         ON itm.id = inv.item_id
       LEFT JOIN (
         SELECT company_id, item_id, COALESCE(SUM(quantity_delta), 0) AS current_stock
         FROM stock_movements
         GROUP BY company_id, item_id
       ) ledger
         ON ledger.company_id = COALESCE(itm.company_id, inv.user_id)
        AND ledger.item_id = inv.item_id
       WHERE inv.user_id = ?
       ORDER BY inv.created_at DESC`,
      [userId]
    );
  }

  async findInventoryById(userId, inventoryId) {
    return this.queryOne(
      `SELECT
          inv.*,
          COALESCE(ledger.current_stock, inv.stock_quantity, 0) AS current_stock,
          inv.stock_quantity AS legacy_stock_quantity,
          CASE
            WHEN inv.item_id IS NOT NULL THEN 'ledger'
            ELSE 'legacy_inventory_snapshot'
          END AS stock_source
       FROM inventory inv
       LEFT JOIN items itm
         ON itm.id = inv.item_id
       LEFT JOIN (
         SELECT company_id, item_id, COALESCE(SUM(quantity_delta), 0) AS current_stock
         FROM stock_movements
         GROUP BY company_id, item_id
       ) ledger
         ON ledger.company_id = COALESCE(itm.company_id, inv.user_id)
        AND ledger.item_id = inv.item_id
       WHERE inv.id = ? AND inv.user_id = ?`,
      [inventoryId, userId]
    );
  }

  async insertInventory(record) {
    // COMPATIBILITY(accounting-refactor): this insert still materializes a
    // legacy inventory-shaped row for older UI/read paths. `stock_quantity`
    // here is only a compatibility snapshot field.
    await this.execute(
      `INSERT INTO inventory
        (id, user_id, item_id, warehouse_id, linked_vendor_profile_id, vendor_product_id, product_name, sku, category, description,
         stock_quantity, purchase_price, selling_price, tax_rate, vendor_name, payment_type, linked_purchase_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id,
        record.item_id || null,
        record.warehouse_id || null,
        record.linked_vendor_profile_id,
        record.vendor_product_id,
        record.product_name,
        record.sku,
        record.category,
        record.description,
        record.stock_quantity,
        record.purchase_price,
        record.selling_price,
        record.tax_rate,
        record.vendor_name,
        record.payment_type,
        record.linked_purchase_id || null,
      ]
    );

    return this.queryOne("SELECT * FROM inventory WHERE id = ?", [record.id]);
  }

  async updateInventory(userId, inventoryId, record) {
    // COMPATIBILITY(accounting-refactor): this update remains metadata-focused.
    // Core stock control must happen through stock movements, not through
    // direct edits to `inventory.stock_quantity`.
    const result = await this.execute(
      `UPDATE inventory
          SET item_id = ?,
              warehouse_id = ?,
              linked_vendor_profile_id = ?,
              vendor_product_id = ?,
              product_name = ?,
              sku = ?,
              category = ?,
              description = ?,
              stock_quantity = ?,
              purchase_price = ?,
              selling_price = ?,
              tax_rate = ?,
              vendor_name = ?,
              payment_type = ?,
              updated_at = NOW()
        WHERE id = ? AND user_id = ?`,
      [
        record.item_id || null,
        record.warehouse_id || null,
        record.linked_vendor_profile_id,
        record.vendor_product_id,
        record.product_name,
        record.sku,
        record.category,
        record.description,
        record.stock_quantity,
        record.purchase_price,
        record.selling_price,
        record.tax_rate,
        record.vendor_name,
        record.payment_type,
        inventoryId,
        userId,
      ]
    );

    if (!result.affectedRows) return null;
    return this.queryOne("SELECT * FROM inventory WHERE id = ?", [inventoryId]);
  }

  async findLinkedVendor(userId, linkedProfileId) {
    return this.queryOne(
      `SELECT id, vendor_name, linked_profile_id
         FROM vendors
        WHERE user_id = ? AND linked_profile_id = ?`,
      [userId, linkedProfileId]
    );
  }

  async findVendorById(userId, vendorId) {
    return this.queryOne(
      `SELECT id, vendor_name, linked_profile_id, counterparty_id
         FROM vendors
        WHERE user_id = ? AND id = ?`,
      [userId, vendorId]
    );
  }

  /**
   * Resolve a vendor row for the buyer (vendors.user_id) using legacy id, counterparty id, or linked supplier profile id.
   */
  async findVendorByUserAndRef(userId, ref) {
    if (!ref) return null;
    const r = String(ref).trim();
    if (!r) return null;
    return this.queryOne(
      `SELECT id, vendor_name, linked_profile_id, counterparty_id
         FROM vendors
        WHERE user_id = ?
          AND (id = ? OR counterparty_id = ? OR linked_profile_id = ?)
        LIMIT 1`,
      [userId, r, r, r]
    );
  }

  /**
   * Internal items linked to a legacy vendors.id row (item_vendor_links.vendor_id).
   */
  async listItemsForVendorPurchase(companyId, legacyVendorId) {
    if (!legacyVendorId) return [];
    return this.queryAll(
      `SELECT DISTINCT
          it.id,
          it.name,
          it.sku,
          it.description,
          it.default_purchase_price,
          it.default_selling_price,
          ivl.vendor_sku,
          ivl.preferred_flag,
          ivl.last_purchase_price AS link_last_purchase_price
         FROM item_vendor_links ivl
         INNER JOIN items it
           ON it.id = ivl.item_id
          AND it.company_id = ivl.company_id
          AND it.is_active = 1
        WHERE ivl.company_id = ?
          AND ivl.vendor_id = ?
        ORDER BY ivl.preferred_flag DESC, it.name ASC`,
      [companyId, legacyVendorId]
    );
  }

  async findVendorProduct(ownerUserId, vendorProductId) {
    return this.queryOne(
      `SELECT *
         FROM vendor_products
        WHERE id = ? AND user_id = ?`,
      [vendorProductId, ownerUserId]
    );
  }

  async listLinkedVendorProducts(userId, linkedProfileId) {
    const vendor = await this.findLinkedVendor(userId, linkedProfileId);
    if (!vendor) return null;

    const rows = await this.queryAll(
      `SELECT vp.*, ? AS vendor_name, ? AS linked_profile_id
         FROM vendor_products vp
        WHERE vp.user_id = ?
        ORDER BY vp.product_name ASC`,
      [vendor.vendor_name, linkedProfileId, linkedProfileId]
    );

    return {
      vendor,
      products: rows,
    };
  }

  async listItems(companyId) {
    return this.queryAll(
      `SELECT * FROM items WHERE company_id = ? AND is_active = 1 ORDER BY name ASC`,
      [companyId]
    );
  }

  async findItemById(companyId, itemId) {
    return this.queryOne(
      `SELECT * FROM items WHERE company_id = ? AND id = ? LIMIT 1`,
      [companyId, itemId]
    );
  }

  async createItemVendorLink(record) {
    await this.execute(
      `INSERT INTO item_vendor_links
        (id, company_id, item_id, vendor_id, vendor_product_id, preferred_flag, vendor_sku, last_purchase_price, lead_time_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         preferred_flag = VALUES(preferred_flag),
         vendor_sku = VALUES(vendor_sku),
         last_purchase_price = VALUES(last_purchase_price),
         lead_time_days = VALUES(lead_time_days),
         updated_at = CURRENT_TIMESTAMP`,
      [
        record.id,
        record.company_id,
        record.item_id,
        record.vendor_id,
        record.vendor_product_id || null,
        record.preferred_flag ? 1 : 0,
        record.vendor_sku || null,
        record.last_purchase_price ?? null,
        record.lead_time_days ?? null,
      ]
    );

    return this.queryOne(
      `SELECT *
         FROM item_vendor_links
        WHERE company_id = ?
          AND item_id = ?
          AND vendor_id = ?
          AND ((vendor_product_id IS NULL AND ? IS NULL) OR vendor_product_id = ?)`,
      [
        record.company_id,
        record.item_id,
        record.vendor_id,
        record.vendor_product_id || null,
        record.vendor_product_id || null,
      ]
    );
  }

  async clearPreferredItemVendorLinks(companyId, itemId) {
    await this.execute(
      `UPDATE item_vendor_links
          SET preferred_flag = 0,
              updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ?
          AND item_id = ?`,
      [companyId, itemId]
    );
  }

  async markPreferredItemVendorLink(companyId, itemId, linkId) {
    await this.clearPreferredItemVendorLinks(companyId, itemId);
    await this.execute(
      `UPDATE item_vendor_links
          SET preferred_flag = 1,
              updated_at = CURRENT_TIMESTAMP
        WHERE company_id = ?
          AND item_id = ?
          AND id = ?`,
      [companyId, itemId, linkId]
    );
    return this.queryOne(
      `SELECT *
         FROM item_vendor_links
        WHERE company_id = ?
          AND item_id = ?
          AND id = ?`,
      [companyId, itemId, linkId]
    );
  }

  async listItemVendorLinks(companyId, itemId) {
    const select = `SELECT
          ivl.*,
          v.vendor_name,
          v.linked_profile_id,
          vp.product_name AS vendor_product_name,
          vp.sku AS vendor_product_sku`;
    const tail = `
       LEFT JOIN vendor_products vp
         ON vp.id = ivl.vendor_product_id
       WHERE ivl.company_id = ?
         AND ivl.item_id = ?
       ORDER BY ivl.preferred_flag DESC, v.vendor_name ASC`;

    if (await this.hasCompaniesTable()) {
      return this.queryAll(
        `${select}
       FROM item_vendor_links ivl
       LEFT JOIN companies c
         ON c.id = ivl.company_id
       JOIN vendors v
         ON v.id = ivl.vendor_id
        AND (
          v.user_id = ivl.company_id
          OR v.user_id = c.legacy_profile_id
          OR v.user_id = c.owner_profile_id
        )
        ${tail}`,
        [companyId, itemId]
      );
    }

    // Legacy DB: `company_id` on links matches profile-scoped tenant (vendors.user_id).
    return this.queryAll(
      `${select}
       FROM item_vendor_links ivl
       JOIN vendors v
         ON v.id = ivl.vendor_id
        AND v.user_id = ivl.company_id
        ${tail}`,
      [companyId, itemId]
    );
  }

  async listWarehouses(companyId) {
    return this.queryAll(
      `SELECT * FROM warehouses WHERE company_id = ? AND is_active = 1 ORDER BY is_default DESC, name ASC`,
      [companyId]
    );
  }

  async createWarehouse(record) {
    await this.execute(
      `INSERT INTO warehouses (id, company_id, name, code, is_default, is_active)
       VALUES (?, ?, ?, ?, 0, 1)`,
      [record.id, record.company_id, record.name, record.code]
    );
    return this.queryOne("SELECT * FROM warehouses WHERE id = ?", [record.id]);
  }
}

module.exports = {
  InventoryRepository,
};
