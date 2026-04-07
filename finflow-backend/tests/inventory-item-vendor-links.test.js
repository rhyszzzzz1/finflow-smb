"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { InventoryService } = require("../services/inventoryService");

function createIdFactory(prefix) {
  let i = 1;
  return () => `${prefix}-${i++}`;
}

function createCounterpartyService() {
  return {
    async resolveCompanyId(_conn, actorUserId) {
      return actorUserId === "user-1" ? "company-1" : `company-for-${actorUserId}`;
    },
  };
}

test("create standalone internal item through inventory flow without vendor dependency", async () => {
  const inventoryRepository = {
    async insertInventory(record) {
      return record;
    },
    async findItemById() {
      return null;
    },
  };

  const inventoryLedgerService = {
    async findOrCreateItem(args) {
      return {
        id: "item-standalone-1",
        name: args.name,
        sku: args.sku,
        description: args.description,
        default_purchase_price: args.defaultPurchasePrice,
        default_selling_price: args.defaultSellingPrice,
      };
    },
  };

  const service = new InventoryService({
    inventoryRepository,
    inventoryLedgerService,
    counterpartyService: createCounterpartyService(),
    idFactory: createIdFactory("inv"),
  });

  const created = await service.createInventory("user-1", {
    name: "Internal Widget",
    sku: "INT-001",
    description: "Standalone internal item",
    purchase_price: 25,
    selling_price: 40,
    tax_rate: 13,
  });

  assert.equal(created.item_id, "item-standalone-1");
  assert.equal(created.product_name, "Internal Widget");
  assert.equal(created.vendor_product_id, null);
  assert.equal(created.linked_vendor_profile_id, null);
  assert.equal(created.stock_quantity, 0);
});

test("link vendor to item stores separate item-vendor mapping", async () => {
  const calls = [];
  const inventoryRepository = {
    async findItemById() {
      return { id: "item-1", name: "Internal Widget" };
    },
    async findVendorById(userId, vendorId) {
      assert.equal(userId, "user-1");
      assert.equal(vendorId, "vendor-1");
      return { id: "vendor-1", vendor_name: "Vendor A", linked_profile_id: "vendor-profile-1" };
    },
    async findVendorProduct(ownerUserId, vendorProductId) {
      assert.equal(ownerUserId, "vendor-profile-1");
      assert.equal(vendorProductId, "vp-1");
      return { id: "vp-1", sku: "VSKU-1", price: 55 };
    },
    async clearPreferredItemVendorLinks(companyId, itemId) {
      calls.push(["clearPreferred", companyId, itemId]);
    },
    async createItemVendorLink(record) {
      calls.push(["createLink", record]);
      return { ...record };
    },
  };

  const service = new InventoryService({
    inventoryRepository,
    inventoryLedgerService: {},
    counterpartyService: createCounterpartyService(),
    idFactory: createIdFactory("link"),
  });

  const link = await service.linkVendorToItem("user-1", "item-1", {
    vendor_id: "vendor-1",
    vendor_product_id: "vp-1",
    preferred_flag: true,
    lead_time_days: 7,
  });

  assert.equal(link.item_id, "item-1");
  assert.equal(link.vendor_id, "vendor-1");
  assert.equal(link.vendor_product_id, "vp-1");
  assert.equal(link.preferred_flag, true);
  assert.equal(link.vendor_sku, "VSKU-1");
  assert.equal(link.last_purchase_price, 55);
  assert.deepEqual(calls[0], ["clearPreferred", "company-1", "item-1"]);
});

test("list item vendor mappings returns multiple suppliers for one internal item", async () => {
  const inventoryRepository = {
    async findItemById() {
      return { id: "item-1", name: "Internal Widget" };
    },
    async listItemVendorLinks(companyId, itemId) {
      assert.equal(companyId, "company-1");
      assert.equal(itemId, "item-1");
      return [
        { id: "link-1", item_id: "item-1", vendor_id: "vendor-1", vendor_name: "Vendor A", preferred_flag: 1 },
        { id: "link-2", item_id: "item-1", vendor_id: "vendor-2", vendor_name: "Vendor B", preferred_flag: 0 },
      ];
    },
  };

  const service = new InventoryService({
    inventoryRepository,
    inventoryLedgerService: {},
    counterpartyService: createCounterpartyService(),
    idFactory: createIdFactory("noop"),
  });

  const rows = await service.listItemVendorLinks("user-1", "item-1");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].vendor_name, "Vendor A");
  assert.equal(rows[1].vendor_name, "Vendor B");
});
