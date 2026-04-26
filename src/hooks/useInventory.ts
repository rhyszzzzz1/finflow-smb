import { useState, useEffect } from "react";
import { inventoryApi } from "@/services/api";
import { toast } from "sonner";

export interface InventoryItem {
  id: string;
  linked_vendor_profile_id: string | null;
  vendor_product_id: string | null;
  linked_purchase_id: string | null;
  product_name: string;
  sku: string;
  stock_quantity: number;
  purchase_price: number;
  selling_price: number;
  tax_rate: number;
  category: string | null;
  payment_type: string;
  vendor_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemMaster {
  id: string;
  name: string;
  sku?: string | null;
  item_type?: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
}

export interface StockBalance {
  item_id: string;
  item_name: string;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  quantity_on_hand: number;
  on_hand_value: number;
}

export const useInventory = (opts?: { includeLegacy?: boolean }) => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stockBalances, setStockBalances] = useState<StockBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLegacyLoading, setIsLegacyLoading] = useState(false);

  const fetchAuthoritative = async () => {
    try {
      const [itemsR, whR, stockR] = await Promise.allSettled([
        inventoryApi.getItems(),
        inventoryApi.getWarehouses(),
        inventoryApi.getStockBalances(),
      ]);

      const unwrap = (result: PromiseSettledResult<any>, label: string) => {
        if (result.status === "fulfilled") return result.value;
        console.error(`Inventory fetch failed (${label}):`, result.reason);
        return null;
      };

      const itemRows = unwrap(itemsR, "items");
      const warehouseRows = unwrap(whR, "warehouses");
      const stockRows = unwrap(stockR, "stock balances");

      if (!itemRows && !warehouseRows && !stockRows) {
        toast.error("Failed to load inventory");
        return;
      }

      if (itemRows) {
        const normalizedItems = Array.isArray(itemRows) ? itemRows : itemRows?.data || [];
        setItems(normalizedItems.map((item: any) => ({
          ...item,
          name: item.name || item.product_name || item.description || "Unnamed Item",
        })));
      }

      if (warehouseRows) {
        const normalizedWarehouses = Array.isArray(warehouseRows) ? warehouseRows : warehouseRows?.data || [];
        setWarehouses(normalizedWarehouses);
      }

      if (stockRows) {
        const normalizedStock = Array.isArray(stockRows) ? stockRows : stockRows?.data || [];
        setStockBalances(
          normalizedStock.map((row: any) => {
            const qty = Number(row.quantity_on_hand ?? row.current_stock) || 0;
            const unitCost = Number(row.weighted_avg_cost) || 0;
            const value =
              row.on_hand_value !== undefined && row.on_hand_value !== null
                ? Number(row.on_hand_value)
                : qty * unitCost;
            return {
              ...row,
              quantity_on_hand: qty,
              on_hand_value: Number.isFinite(value) ? value : 0,
            };
          })
        );
      }
    } catch (error: any) {
      toast.error("Failed to load inventory");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthoritative();
    if (opts?.includeLegacy) {
      fetchLegacyInventory();
    }
  }, []);

  const fetchLegacyInventory = async () => {
    setIsLegacyLoading(true);
    try {
      const data = await inventoryApi.getAll();
      const rows = Array.isArray(data) ? data : data?.data || [];
      setInventory(rows.map((item: any) => ({
        ...item,
        stock_quantity: Number(item.stock_quantity) || 0,
        purchase_price: Number(item.purchase_price) || 0,
        selling_price: Number(item.selling_price) || 0,
        tax_rate: Number(item.tax_rate) || 0,
      })));
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to load compatibility inventory");
      return false;
    } finally {
      setIsLegacyLoading(false);
    }
  };

  const addItem = async (item: Omit<InventoryItem, "id" | "created_at" | "updated_at">) => {
    try {
      await inventoryApi.add(item);
      toast.success("Product added successfully");
      await fetchLegacyInventory();
      return true;
    } catch (error: any) {
      if (error.message.includes("SKU")) {
        toast.error("SKU already exists");
      } else {
        toast.error(error.message || "Failed to add product");
      }
      return false;
    }
  };

  const updateItem = async (id: string, item: Partial<InventoryItem>) => {
    try {
      await inventoryApi.update(id, item);
      toast.success("Product updated successfully");
      await fetchLegacyInventory();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to update product");
      return false;
    }
  };

  const deleteItem = async (id: string) => {
    try {
      await inventoryApi.delete(id);
      toast.success("Product deleted successfully");
      await fetchLegacyInventory();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to delete product");
      return false;
    }
  };

  const createItem = async (payload: any) => {
    try {
      await inventoryApi.createItem(payload);
      toast.success("Item created successfully");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to create item");
      return false;
    }
  };

  const createWarehouse = async (payload: any) => {
    try {
      await inventoryApi.createWarehouse(payload);
      toast.success("Warehouse created successfully");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to create warehouse");
      return false;
    }
  };

  const createStockAdjustment = async (payload: any) => {
    try {
      await inventoryApi.createStockAdjustment(payload);
      toast.success("Stock adjustment recorded");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to record stock adjustment");
      return false;
    }
  };

  const createStockTransfer = async (payload: any) => {
    try {
      await inventoryApi.createStockTransfer(payload);
      toast.success("Stock transfer recorded");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to record stock transfer");
      return false;
    }
  };

  const addItemVendorLink = async (itemId: string, payload: any) => {
    try {
      await inventoryApi.addItemVendorLink(itemId, payload);
      toast.success("Vendor linked to item");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to link vendor");
      return false;
    }
  };

  const markPreferredVendor = async (itemId: string, linkId: string) => {
    try {
      await inventoryApi.markPreferredVendor(itemId, linkId);
      toast.success("Preferred vendor updated");
      await fetchAuthoritative();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to mark preferred vendor");
      return false;
    }
  };

  return {
    inventory,
    items,
    warehouses,
    stockBalances,
    isLoading,
    isLegacyLoading,
    addItem,
    updateItem,
    deleteItem,
    createItem,
    createWarehouse,
    createStockAdjustment,
    createStockTransfer,
    addItemVendorLink,
    markPreferredVendor,
    refetch: fetchAuthoritative,
    fetchLegacyInventory,
  };
};
