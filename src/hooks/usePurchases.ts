import { useState, useEffect } from "react";
import { purchasesApi } from "@/services/api";
import { toast } from "sonner";

export interface Purchase {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  amount: number;
  purchase_date: string;
  created_at: string;
}

export const usePurchases = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPurchases = async () => {
    try {
      const data = await purchasesApi.getAll();
      setPurchases(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load purchases");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const addPurchase = async (purchase: { product_name: string; quantity: number; amount: number; purchase_date: string }) => {
    try {
      await purchasesApi.add({
        product_name: purchase.product_name,
        quantity: purchase.quantity,
        amount: purchase.amount,
        purchase_date: purchase.purchase_date,
      });
      toast.success("Purchase recorded");
      await fetchPurchases();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to add purchase");
      return false;
    }
  };

  return {
    purchases,
    isLoading,
    addPurchase,
    refetch: fetchPurchases,
  };
};
