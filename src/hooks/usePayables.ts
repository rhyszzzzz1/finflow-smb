import { useState, useEffect } from "react";
import { payablesApi } from "@/services/api";
import { toast } from "sonner";

export interface Payable {
  id: string;
  vendor_name: string;
  invoice_id: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const usePayables = () => {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPayables = async () => {
    try {
      const data = await payablesApi.getAll();
      setPayables(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load payables");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPayables();
  }, []);

  const markAsPaid = async (id: string) => {
    try {
      await payablesApi.update(id, { status: "Paid" });
      toast.success("Payment recorded");
      await fetchPayables();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to update payable");
      return false;
    }
  };

  return {
    payables,
    isLoading,
    markAsPaid,
    refetch: fetchPayables,
  };
};
