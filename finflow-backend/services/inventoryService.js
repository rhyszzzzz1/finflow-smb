"use strict";

class InventoryService {
  constructor(options = {}) {
    if (!options.inventoryRepository) {
      throw new Error("InventoryService requires an inventoryRepository");
    }
    if (!options.inventoryLedgerService) {
      throw new Error("InventoryService requires an inventoryLedgerService");
    }
    if (!options.idFactory) {
      throw new Error("InventoryService requires an idFactory");
    }

    this.inventoryRepository = options.inventoryRepository;
    this.inventoryLedgerService = options.inventoryLedgerService;
    this.idFactory = options.idFactory;
  }

  toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async listInventory(actorUserId) {
    return this.inventoryRepository.listInventory(actorUserId);
  }

  async listVendorProducts(actorUserId, linkedProfileId) {
    const result = await this.inventoryRepository.listLinkedVendorProducts(actorUserId, linkedProfileId);
    if (!result) {
      const error = new Error("Vendor link not found");
      error.statusCode = 404;
      throw error;
    }
    return result.products;
  }

  async createInventory(actorUserId, payload) {
    const vendor = await this.inventoryRepository.findLinkedVendor(actorUserId, payload.linked_vendor_profile_id);
    if (!vendor) {
      const error = new Error("Select a linked vendor account first");
      error.statusCode = 400;
      throw error;
    }

    const vendorProduct = await this.inventoryRepository.findVendorProduct(
      payload.linked_vendor_profile_id,
      payload.vendor_product_id
    );
    if (!vendorProduct) {
      const error = new Error("Selected product is not available from that vendor");
      error.statusCode = 400;
      throw error;
    }

    return this.inventoryRepository.insertInventory({
      id: this.idFactory(),
      user_id: actorUserId,
      linked_vendor_profile_id: payload.linked_vendor_profile_id,
      vendor_product_id: payload.vendor_product_id,
      product_name: vendorProduct.product_name,
      sku: vendorProduct.sku,
      category: vendorProduct.category || null,
      description: vendorProduct.description || null,
      stock_quantity: parseInt(payload.stock_quantity, 10) || 0,
      purchase_price: this.toNumber(payload.purchase_price),
      selling_price: this.toNumber(payload.selling_price),
      tax_rate: vendorProduct.tax_rate === undefined ? 18 : this.toNumber(vendorProduct.tax_rate, 18),
      vendor_name: vendor.vendor_name,
      payment_type: payload.payment_type || "cash",
    });
  }

  async updateInventory(actorUserId, inventoryId, payload) {
    const existing = await this.inventoryRepository.findInventoryById(actorUserId, inventoryId);
    if (!existing) {
      const error = new Error("Item not found");
      error.statusCode = 404;
      throw error;
    }

    const vendor = await this.inventoryRepository.findLinkedVendor(actorUserId, payload.linked_vendor_profile_id);
    if (!vendor) {
      const error = new Error("Select a linked vendor account first");
      error.statusCode = 400;
      throw error;
    }

    const vendorProduct = await this.inventoryRepository.findVendorProduct(
      payload.linked_vendor_profile_id,
      payload.vendor_product_id
    );
    if (!vendorProduct) {
      const error = new Error("Selected product is not available from that vendor");
      error.statusCode = 400;
      throw error;
    }

    return this.inventoryRepository.updateInventory(actorUserId, inventoryId, {
      linked_vendor_profile_id: payload.linked_vendor_profile_id,
      vendor_product_id: payload.vendor_product_id,
      product_name: vendorProduct.product_name,
      sku: vendorProduct.sku,
      category: vendorProduct.category || null,
      description: vendorProduct.description || null,
      stock_quantity: parseInt(payload.stock_quantity, 10) || 0,
      purchase_price: this.toNumber(payload.purchase_price),
      selling_price: this.toNumber(payload.selling_price),
      tax_rate: vendorProduct.tax_rate === undefined ? 18 : this.toNumber(vendorProduct.tax_rate, 18),
      vendor_name: vendor.vendor_name,
      payment_type: payload.payment_type || "cash",
    });
  }

  async deleteInventory(_actorUserId, inventoryId) {
    const error = new Error("Inventory items cannot be hard deleted. Use stock adjustments or deactivate the item instead.");
    error.statusCode = 409;
    error.audit = {
      entityType: "inventory_item",
      entityId: inventoryId,
      actionType: "delete_attempt",
      reason: "Inventory hard delete blocked by refactored inventory service",
    };
    throw error;
  }

  async listItems(actorUserId) {
    return this.inventoryRepository.listItems(actorUserId);
  }

  async createItem(actorUserId, payload) {
    return this.inventoryLedgerService.findOrCreateItem({
      companyId: actorUserId,
      name: payload.name,
      sku: payload.sku || null,
      description: payload.description || null,
      defaultPurchasePrice: this.toNumber(payload.default_purchase_price || 0),
      defaultSellingPrice: this.toNumber(payload.default_selling_price || 0),
      newId: this.idFactory,
    });
  }

  async listWarehouses(actorUserId) {
    return this.inventoryRepository.listWarehouses(actorUserId);
  }

  async createWarehouse(actorUserId, payload) {
    return this.inventoryRepository.createWarehouse({
      id: this.idFactory(),
      company_id: actorUserId,
      name: payload.name,
      code: payload.code,
    });
  }

  async getStockBalances(actorUserId) {
    return this.inventoryLedgerService.getStockBalances(actorUserId);
  }

  async createStockAdjustment(actorUserId, payload) {
    return this.inventoryLedgerService.applyAdjustment({
      companyId: actorUserId,
      itemId: payload.item_id,
      quantityDelta: Number(payload.quantity_delta),
      unitCost: payload.unit_cost === undefined ? null : Number(payload.unit_cost),
      reason: payload.reason || "Manual inventory adjustment",
      createdByUserId: actorUserId,
      newId: this.idFactory,
    });
  }

  async createStockTransfer(actorUserId, payload) {
    return this.inventoryLedgerService.applyTransfer({
      companyId: actorUserId,
      itemId: payload.item_id,
      fromWarehouseId: payload.from_warehouse_id,
      toWarehouseId: payload.to_warehouse_id,
      quantity: Number(payload.quantity),
      unitCost: payload.unit_cost === undefined ? null : Number(payload.unit_cost),
      reason: payload.reason || "Warehouse transfer",
      createdByUserId: actorUserId,
      newId: this.idFactory,
    });
  }
}

module.exports = {
  InventoryService,
};
