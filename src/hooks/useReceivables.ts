import { useState, useEffect } from "react";
import { receivablesApi } from "@/services/api";
import { toast } from "sonner";

export interface Receivable {
  id: string;
  client_name: string;
  invoice_id: string;
  amount: number;
  due_date: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export const useReceivables = () => {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceivables = async () => {
    try {
      const data = await receivablesApi.getAll();
      setReceivables(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load receivables");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReceivables();
  }, []);

  const markAsPaid = async (id: string) => {
    try {
      await receivablesApi.update(id, { status: "Paid" });
      toast.success("Payment recorded");
      await fetchReceivables();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to update receivable");
      return false;
    }
  };

  return {
    receivables,
    isLoading,
    markAsPaid,
    refetch: fetchReceivables,
  };
};
