"use strict";

// TODO(accounting-refactor): this service is currently a compatibility layer.
// It bridges the old `inventory` table/repository workflow with the newer
// stock-movement ledger. Future prompts should peel legacy CRUD away from this
// service and leave only item/warehouse/stock-movement driven behavior.
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
    if (!options.counterpartyService) {
      throw new Error("InventoryService requires a counterpartyService");
    }

    this.inventoryRepository = options.inventoryRepository;
    this.inventoryLedgerService = options.inventoryLedgerService;
    this.counterpartyService = options.counterpartyService;
    this.idFactory = options.idFactory;
  }

  toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  text(value) {
    const normalized = String(value || "").trim();
    return normalized || null;
  }

  async resolveCompanyId(actorUserId) {
    return this.counterpartyService.resolveCompanyId(null, actorUserId);
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

  async resolveInternalItem(actorUserId, payload, existing = null) {
    const companyId = await this.resolveCompanyId(actorUserId);
    if (payload.item_id) {
      const item = await this.inventoryRepository.findItemById(companyId, payload.item_id);
      if (!item) {
        const error = new Error("Selected internal item not found");
        error.statusCode = 404;
        throw error;
      }
      return item;
    }

    const standaloneName = this.text(payload.name || payload.product_name || existing?.product_name);
    if (!standaloneName) {
      const error = new Error("Provide item_id, name, or vendor product details");
      error.statusCode = 400;
      throw error;
    }

    return this.inventoryLedgerService.findOrCreateItem({
      companyId,
      name: standaloneName,
      sku: this.text(payload.sku || existing?.sku),
      description: this.text(payload.description || existing?.description),
      defaultPurchasePrice: this.toNumber(payload.purchase_price ?? payload.default_purchase_price ?? existing?.purchase_price, 0),
      defaultSellingPrice: this.toNumber(payload.selling_price ?? payload.default_selling_price ?? existing?.selling_price, 0),
      newId: this.idFactory,
    });
  }

  async createOrUpdateItemVendorLink(actorUserId, itemId, payload = {}) {
    const companyId = await this.resolveCompanyId(actorUserId);
    const item = await this.inventoryRepository.findItemById(companyId, itemId);
    if (!item) {
      const error = new Error("Internal item not found");
      error.statusCode = 404;
      throw error;
    }

    let vendor = null;
    if (payload.vendor_id) {
      vendor = await this.inventoryRepository.findVendorById(actorUserId, payload.vendor_id);
    } else if (payload.linked_vendor_profile_id) {
      vendor = await this.inventoryRepository.findLinkedVendor(actorUserId, payload.linked_vendor_profile_id);
    }

    if (!vendor) {
      const error = new Error("A linked vendor is required to create an item vendor link");
      error.statusCode = 400;
      throw error;
    }

    let vendorProduct = null;
    if (payload.vendor_product_id) {
      const ownerUserId = vendor.linked_profile_id || payload.linked_vendor_profile_id || null;
      if (!ownerUserId) {
        const error = new Error("Vendor product link requires a linked vendor account");
        error.statusCode = 400;
        throw error;
      }
      vendorProduct = await this.inventoryRepository.findVendorProduct(ownerUserId, payload.vendor_product_id);
      if (!vendorProduct) {
        const error = new Error("Selected vendor product is not available from that vendor");
        error.statusCode = 400;
        throw error;
      }
    }

    if (payload.preferred_flag) {
      await this.inventoryRepository.clearPreferredItemVendorLinks(companyId, itemId);
    }

    return this.inventoryRepository.createItemVendorLink({
      id: this.idFactory(),
      company_id: companyId,
      item_id: itemId,
      vendor_id: vendor.id,
      vendor_product_id: payload.vendor_product_id || null,
      preferred_flag: !!payload.preferred_flag,
      vendor_sku: this.text(payload.vendor_sku || vendorProduct?.sku),
      last_purchase_price: payload.last_purchase_price === undefined
        ? (vendorProduct ? this.toNumber(vendorProduct.price ?? vendorProduct.purchase_price ?? 0, 0) : null)
        : this.toNumber(payload.last_purchase_price, 0),
      lead_time_days: payload.lead_time_days === undefined || payload.lead_time_days === null || payload.lead_time_days === ""
        ? null
        : this.toNumber(payload.lead_time_days, 0),
    });
  }

  async createInventory(actorUserId, payload) {
    const companyId = await this.resolveCompanyId(actorUserId);
    let vendor = null;
    let vendorProduct = null;

    if (payload.linked_vendor_profile_id && payload.vendor_product_id) {
      vendor = await this.inventoryRepository.findLinkedVendor(actorUserId, payload.linked_vendor_profile_id);
      if (!vendor) {
        const error = new Error("Selected vendor link was not found");
        error.statusCode = 400;
        throw error;
      }

      vendorProduct = await this.inventoryRepository.findVendorProduct(
        payload.linked_vendor_profile_id,
        payload.vendor_product_id
      );
      if (!vendorProduct) {
        const error = new Error("Selected product is not available from that vendor");
        error.statusCode = 400;
        throw error;
      }
    }

    const item = vendorProduct
      ? await this.inventoryLedgerService.findOrCreateItem({
        companyId,
        name: vendorProduct.product_name,
        sku: vendorProduct.sku || null,
        description: vendorProduct.description || null,
        defaultPurchasePrice: this.toNumber(payload.purchase_price),
        defaultSellingPrice: this.toNumber(payload.selling_price),
        newId: this.idFactory,
      })
      : await this.resolveInternalItem(actorUserId, payload);

    const record = await this.inventoryRepository.insertInventory({
      id: this.idFactory(),
      user_id: actorUserId,
      item_id: item.id,
      warehouse_id: null,
      linked_vendor_profile_id: payload.linked_vendor_profile_id || null,
      vendor_product_id: payload.vendor_product_id || null,
      product_name: vendorProduct?.product_name || item.name,
      sku: vendorProduct?.sku || item.sku || this.text(payload.sku),
      category: vendorProduct?.category || this.text(payload.category),
      description: vendorProduct?.description || item.description || this.text(payload.description),
      // TODO(accounting-refactor): `inventory.stock_quantity` is now a
      // compatibility snapshot only. On-hand stock must be established through
      // stock movements, not during item master creation.
      stock_quantity: 0,
      purchase_price: this.toNumber(payload.purchase_price ?? item.default_purchase_price, 0),
      selling_price: this.toNumber(payload.selling_price ?? item.default_selling_price, 0),
      tax_rate: vendorProduct?.tax_rate === undefined ? this.toNumber(payload.tax_rate, 18) : this.toNumber(vendorProduct.tax_rate, 18),
      vendor_name: vendor?.vendor_name || null,
      payment_type: payload.payment_type || "cash",
    });

    if (vendor) {
      await this.createOrUpdateItemVendorLink(actorUserId, item.id, {
        vendor_id: vendor.id,
        linked_vendor_profile_id: payload.linked_vendor_profile_id,
        vendor_product_id: payload.vendor_product_id || null,
        preferred_flag: payload.preferred_vendor !== false,
        vendor_sku: vendorProduct?.sku || null,
        last_purchase_price: payload.purchase_price,
      });
    }

    return record;
  }

  async updateInventory(actorUserId, inventoryId, payload) {
    const companyId = await this.resolveCompanyId(actorUserId);
    const existing = await this.inventoryRepository.findInventoryById(actorUserId, inventoryId);
    if (!existing) {
      const error = new Error("Item not found");
      error.statusCode = 404;
      throw error;
    }

    let vendor = null;
    let vendorProduct = null;

    if (payload.linked_vendor_profile_id && payload.vendor_product_id) {
      vendor = await this.inventoryRepository.findLinkedVendor(actorUserId, payload.linked_vendor_profile_id);
      if (!vendor) {
        const error = new Error("Selected vendor link was not found");
        error.statusCode = 400;
        throw error;
      }

      vendorProduct = await this.inventoryRepository.findVendorProduct(
        payload.linked_vendor_profile_id,
        payload.vendor_product_id
      );
      if (!vendorProduct) {
        const error = new Error("Selected product is not available from that vendor");
        error.statusCode = 400;
        throw error;
      }
    }

    const item = vendorProduct
      ? await this.inventoryLedgerService.findOrCreateItem({
        companyId,
        name: vendorProduct.product_name,
        sku: vendorProduct.sku || null,
        description: vendorProduct.description || null,
        defaultPurchasePrice: this.toNumber(payload.purchase_price),
        defaultSellingPrice: this.toNumber(payload.selling_price),
        newId: this.idFactory,
      })
      : await this.resolveInternalItem(actorUserId, payload, existing);

    if (existing.item_id && existing.item_id !== item.id) {
      const currentStock = await this.inventoryLedgerService.getCurrentStock(companyId, existing.item_id);
      if (currentStock !== 0) {
        const error = new Error("Cannot remap an inventory row to a different item while stock remains on hand. Adjust or transfer stock first.");
        error.statusCode = 409;
        throw error;
      }
    }

    return this.inventoryRepository.updateInventory(actorUserId, inventoryId, {
      item_id: item.id,
      warehouse_id: existing.warehouse_id || null,
      linked_vendor_profile_id: payload.linked_vendor_profile_id || null,
      vendor_product_id: payload.vendor_product_id || null,
      product_name: vendorProduct?.product_name || item.name || existing.product_name,
      sku: vendorProduct?.sku || item.sku || this.text(payload.sku) || existing.sku,
      category: vendorProduct?.category || this.text(payload.category) || existing.category,
      description: vendorProduct?.description || item.description || this.text(payload.description) || existing.description,
      // TODO(accounting-refactor): keep the legacy column as a compatibility
      // display field only. Core stock now comes from the ledger.
      stock_quantity: this.toNumber(existing.current_stock ?? existing.stock_quantity, 0),
      purchase_price: this.toNumber(payload.purchase_price ?? existing.purchase_price, 0),
      selling_price: this.toNumber(payload.selling_price ?? existing.selling_price, 0),
      tax_rate: vendorProduct?.tax_rate === undefined ? this.toNumber(payload.tax_rate ?? existing.tax_rate, 18) : this.toNumber(vendorProduct.tax_rate, 18),
      vendor_name: vendor?.vendor_name || null,
      payment_type: payload.payment_type || existing.payment_type || "cash",
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
    const companyId = await this.resolveCompanyId(actorUserId);
    return this.inventoryRepository.listItems(companyId);
  }

  /**
   * Items linked to a vendor for purchase-order line pickers. vendorRef matches PO header (legacy vendors.id or counterparty_id or linked_profile_id).
   * @returns {{ filterActive: boolean, items: object[] }}
   */
  async listItemsForPurchaseVendor(actorUserId, vendorRef) {
    const companyId = await this.resolveCompanyId(actorUserId);
    const vendor = await this.inventoryRepository.findVendorByUserAndRef(actorUserId, vendorRef);
    if (!vendor) {
      return { filterActive: false, items: [] };
    }
    const items = await this.inventoryRepository.listItemsForVendorPurchase(companyId, vendor.id);
    if (!items.length) {
      return { filterActive: false, items: [] };
    }
    return { filterActive: true, items };
  }

  async createItem(actorUserId, payload) {
    // Creating an item must not imply stock on hand. Opening balances and later
    // changes belong in explicit stock movement flows.
    return this.inventoryLedgerService.findOrCreateItem({
      companyId: await this.resolveCompanyId(actorUserId),
      name: payload.name,
      sku: payload.sku || null,
      description: payload.description || null,
      defaultPurchasePrice: this.toNumber(payload.default_purchase_price || 0),
      defaultSellingPrice: this.toNumber(payload.default_selling_price || 0),
      newId: this.idFactory,
    });
  }

  async listItemVendorLinks(actorUserId, itemId) {
    const companyId = await this.resolveCompanyId(actorUserId);
    const item = await this.inventoryRepository.findItemById(companyId, itemId);
    if (!item) {
      const error = new Error("Internal item not found");
      error.statusCode = 404;
      throw error;
    }
    return this.inventoryRepository.listItemVendorLinks(companyId, itemId);
  }

  async linkVendorToItem(actorUserId, itemId, payload) {
    return this.createOrUpdateItemVendorLink(actorUserId, itemId, payload);
  }

  async markPreferredVendor(actorUserId, itemId, linkId) {
    const companyId = await this.resolveCompanyId(actorUserId);
    const item = await this.inventoryRepository.findItemById(companyId, itemId);
    if (!item) {
      const error = new Error("Internal item not found");
      error.statusCode = 404;
      throw error;
    }

    const link = await this.inventoryRepository.markPreferredItemVendorLink(companyId, itemId, linkId);
    if (!link) {
      const error = new Error("Item vendor link not found");
      error.statusCode = 404;
      throw error;
    }
    return link;
  }

  async listWarehouses(actorUserId) {
    return this.inventoryRepository.listWarehouses(await this.resolveCompanyId(actorUserId));
  }

  async createWarehouse(actorUserId, payload) {
    const companyId = await this.resolveCompanyId(actorUserId);
    return this.inventoryRepository.createWarehouse({
      id: this.idFactory(),
      company_id: companyId,
      name: payload.name,
      code: payload.code,
    });
  }

  async getStockBalances(actorUserId) {
    return this.inventoryLedgerService.getStockBalances(await this.resolveCompanyId(actorUserId));
  }

  async createStockAdjustment(actorUserId, payload) {
    const companyId = await this.resolveCompanyId(actorUserId);
    return this.inventoryLedgerService.applyAdjustment({
      companyId,
      itemId: payload.item_id,
      quantityDelta: Number(payload.quantity_delta),
      unitCost: payload.unit_cost === undefined ? null : Number(payload.unit_cost),
      reason: payload.reason || "Manual inventory adjustment",
      createdByUserId: actorUserId,
      newId: this.idFactory,
    });
  }

  async createStockTransfer(actorUserId, payload) {
    const companyId = await this.resolveCompanyId(actorUserId);
    return this.inventoryLedgerService.applyTransfer({
      companyId,
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
