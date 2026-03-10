import { useState, useEffect } from "react";
import { inventoryApi } from "@/services/api";
import { toast } from "sonner";

export interface InventoryItem {
  id: string;
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

export const useInventory = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInventory = async () => {
    try {
      const data = await inventoryApi.getAll();
      setInventory(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load inventory");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
    // Poll for changes every 5 seconds instead of real-time
    const interval = setInterval(fetchInventory, 5000);
    return () => clearInterval(interval);
  }, []);

  const addItem = async (item: Omit<InventoryItem, "id" | "created_at" | "updated_at">) => {
    try {
      await inventoryApi.add(item);
      toast.success("Product added successfully");
      await fetchInventory();
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
      await fetchInventory();
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
      await fetchInventory();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to delete product");
      return false;
    }
  };

  return {
    inventory,
    isLoading,
    addItem,
    updateItem,
    deleteItem,
    refetch: fetchInventory,
  };
};
