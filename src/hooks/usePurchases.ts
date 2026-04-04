import { useState, useEffect } from "react";
import { purchasesApi } from "@/services/api";
import { toast } from "sonner";

export interface Purchase {
  id: string;
  bill_no: string;
  vendor_id: string | null;
  vendor_name: string;
  amount: number;
  purchase_date: string;
  status: string;
  created_at: string;
}

export const usePurchases = () => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPurchases = async () => {
    try {
      const data = await purchasesApi.getAll();
      const rows = Array.isArray(data) ? data : data.data || [];
      setPurchases(
        rows
          .filter((row: any) => !["draft", "void"].includes(String(row.status || "").toLowerCase()))
          .map((row: any) => ({
            id: row.id,
            bill_no: row.bill_no,
            vendor_id: row.vendor_id || null,
            vendor_name: row.vendor_name || "Unknown Vendor",
            amount: Number(row.total_amount) || 0,
            purchase_date: row.bill_date,
            status: row.status,
            created_at: row.created_at,
          }))
      );
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

  const addPurchase = async () => {
    try {
      await purchasesApi.add();
      return false;
    } catch (error: any) {
      toast.error(error.message || "Purchases are now created through accounting purchase bills");
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
