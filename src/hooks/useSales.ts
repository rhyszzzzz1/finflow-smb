import { useState, useEffect } from "react";
import { salesApi } from "@/services/api";
import { toast } from "sonner";

export interface Sale {
  id: string;
  invoice_no: string;
  customer_id: string | null;
  customer_name: string;
  amount: number;
  sale_date: string;
  status: string;
  created_at: string;
}

export const useSales = () => {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSales = async () => {
    try {
      const data = await salesApi.getAll();
      const rows = Array.isArray(data) ? data : data.data || [];
      setSales(
        rows
          .filter((row: any) => !["draft", "void"].includes(String(row.status || "").toLowerCase()))
          .map((row: any) => ({
            id: row.id,
            invoice_no: row.invoice_no,
            customer_id: row.customer_id || null,
            customer_name: row.customer_name || "Unknown Customer",
            amount: Number(row.total_amount) || 0,
            sale_date: row.invoice_date,
            status: row.status,
            created_at: row.created_at,
          }))
      );
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

  const addSale = async () => {
    try {
      await salesApi.add();
      return false;
    } catch (error: any) {
      toast.error(error.message || "Sales are now created through accounting invoices");
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
