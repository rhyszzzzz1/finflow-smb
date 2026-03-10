import { useState, useEffect } from "react";
import { salesApi } from "@/services/api";
import { toast } from "sonner";

export interface Sale {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  amount: number;
  sale_date: string;
  created_at: string;
}

export const useSales = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    try {
      const data = await salesApi.getAll();
      setSales(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load sales");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  const addSale = async (sale: { product_name: string; quantity: number; amount: number; sale_date: string }) => {
    try {
      await salesApi.add({
        product_name: sale.product_name,
        quantity: sale.quantity,
        amount: sale.amount,
        sale_date: sale.sale_date,
      });
      toast.success("Sale recorded");
      await fetchSales();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to add sale");
      return false;
    }
  };

  return {
    sales,
    isLoading,
    addSale,
    refetch: fetchSales,
  };
};
