"use strict";

class InventoryRepository {
  constructor(db) {
    if (!db) {
      throw new Error("InventoryRepository requires a mysql2 promise connection");
    }
    this.db = db;
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

  async listInventory(userId) {
    return this.queryAll(
      "SELECT * FROM inventory WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
  }

  async findInventoryById(userId, inventoryId) {
    return this.queryOne(
      "SELECT * FROM inventory WHERE id = ? AND user_id = ?",
      [inventoryId, userId]
    );
  }

  async insertInventory(record) {
    await this.execute(
      `INSERT INTO inventory
        (id, user_id, linked_vendor_profile_id, vendor_product_id, product_name, sku, category, description,
         stock_quantity, purchase_price, selling_price, tax_rate, vendor_name, payment_type, linked_purchase_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id,
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
    const result = await this.execute(
      `UPDATE inventory
          SET linked_vendor_profile_id = ?,
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
