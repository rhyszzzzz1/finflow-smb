"use strict";

class InventoryController {
  constructor(inventoryService, auditService = null) {
    this.inventoryService = inventoryService;
    this.auditService = auditService;
  }

  async logDeleteAttempt(req, error) {
    if (!this.auditService || !error?.audit) return;
    await this.auditService.logAction({
      actorUserId: req.user?.id || null,
      companyId: req.user?.id || null,
      entityType: error.audit.entityType,
      entityId: error.audit.entityId,
      actionType: error.audit.actionType,
      reason: error.audit.reason,
      ipAddress: req.requestMeta?.ipAddress || req.ip || null,
      userAgent: req.requestMeta?.userAgent || req.headers["user-agent"] || null,
      route: req.requestMeta?.route || req.originalUrl || null,
      method: req.requestMeta?.method || req.method || null,
    });
  }

  list = async (req, res) => {
    const rows = await this.inventoryService.listInventory(req.user.id);
    return res.json(rows);
  };

  listVendorProducts = async (req, res) => {
    const rows = await this.inventoryService.listVendorProducts(req.user.id, req.params.linkedProfileId);
    return res.json(rows);
  };

  create = async (req, res) => {
    // COMPATIBILITY(accounting-refactor): this creates/bridges a legacy
    // inventory-shaped record for UI compatibility. It must not be interpreted
    // as establishing stock on hand.
    const row = await this.inventoryService.createInventory(req.user.id, req.body);
    return res.status(201).json(row);
  };

  update = async (req, res) => {
    // COMPATIBILITY(accounting-refactor): metadata-only update. Quantity on hand
    // is authoritative in stock_movements, not here.
    const row = await this.inventoryService.updateInventory(req.user.id, req.params.id, req.body);
    if (!row) {
      return res.status(404).json({ message: "Item not found" });
    }
    return res.json(row);
  };

  remove = async (req, res) => {
    try {
      await this.inventoryService.deleteInventory(req.user.id, req.params.id);
      return res.json({ message: "Deleted successfully" });
    } catch (error) {
      await this.logDeleteAttempt(req, error);
      if (error.statusCode) {
        return res.status(error.statusCode).json({ message: error.message });
      }
      throw error;
    }
  };

  listItems = async (req, res) => {
    const rows = await this.inventoryService.listItems(req.user.id);
    return res.json(rows);
  };

  createItem = async (req, res) => {
    const row = await this.inventoryService.createItem(req.user.id, req.body);
    return res.status(201).json(row);
  };

  listItemVendorLinks = async (req, res) => {
    const rows = await this.inventoryService.listItemVendorLinks(req.user.id, req.params.itemId);
    return res.json(rows);
  };

  linkVendorToItem = async (req, res) => {
    const row = await this.inventoryService.linkVendorToItem(req.user.id, req.params.itemId, req.body);
    return res.status(201).json(row);
  };

  markPreferredVendor = async (req, res) => {
    const row = await this.inventoryService.markPreferredVendor(req.user.id, req.params.itemId, req.params.linkId);
    return res.json(row);
  };

  listWarehouses = async (req, res) => {
    const rows = await this.inventoryService.listWarehouses(req.user.id);
    return res.json(rows);
  };

  createWarehouse = async (req, res) => {
    const row = await this.inventoryService.createWarehouse(req.user.id, req.body);
    return res.status(201).json(row);
  };

  getStockBalances = async (req, res) => {
    const rows = await this.inventoryService.getStockBalances(req.user.id);
    return res.json(rows);
  };

  createStockAdjustment = async (req, res) => {
    const row = await this.inventoryService.createStockAdjustment(req.user.id, req.body);
    return res.status(201).json(row);
  };

  createStockTransfer = async (req, res) => {
    const row = await this.inventoryService.createStockTransfer(req.user.id, req.body);
    return res.status(201).json(row);
  };
}

module.exports = {
  InventoryController,
};
