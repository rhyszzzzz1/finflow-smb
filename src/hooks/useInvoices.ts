import { useState, useEffect } from "react";
import { invoiceApi } from "@/services/api";
import { toast } from "sonner";

export interface Invoice {
  id: string;
  invoice_no: string;
  client_name: string;
  amount: number;
  status: string;
  due_date: string;
  created_at: string;
  updated_at: string;
  product_id?: string | null;
  quantity?: number | null;
}

export const useInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = async () => {
    try {
      const data = await invoiceApi.getAll();
      setInvoices(Array.isArray(data) ? data : data.data || []);
    } catch (error: any) {
      toast.error("Failed to load invoices");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const addInvoice = async (invoice: {
    client_name: string;
    amount: number;
    due_date: string;
    product_id?: string;
    quantity?: number;
  }) => {
    try {
      const invoiceNo = `INV-${String(invoices.length + 1).padStart(3, "0")}`;
      
      await invoiceApi.add({
        invoice_no: invoiceNo,
        client_name: invoice.client_name,
        amount: invoice.amount,
        due_date: invoice.due_date,
        status: "Pending",
        product_id: invoice.product_id || null,
        quantity: invoice.quantity || 1,
      });

      toast.success("Invoice created successfully");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to create invoice");
      return false;
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      await invoiceApi.update(id, { status });
      toast.success("Invoice updated successfully");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to update invoice");
      return false;
    }
  };

  const deleteInvoice = async (id: string) => {
    try {
      await invoiceApi.delete(id);
      toast.success("Invoice deleted successfully");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to delete invoice");
      return false;
    }
  };

  return {
    invoices,
    isLoading,
    addInvoice,
    updateStatus,
    deleteInvoice,
    refetch: fetchInvoices,
  };
};
