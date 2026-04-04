import { useState, useEffect } from "react";
import { accountingInvoiceApi } from "@/services/api";
import { toast } from "sonner";

export interface InvoiceLine {
  id?: string;
  item_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_type?: "none" | "percentage" | "fixed";
  discount_value?: number;
  discount_amount?: number;
  tax_code_id?: string | null;
  tax_rate?: number;
  line_subtotal?: number;
  line_tax_amount?: number;
  line_total?: number;
}

export interface Invoice {
  id: string;
  invoice_no: string;
  customer_id: string;
  customer_name: string;
  customer_email?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  due_date: string;
  invoice_date: string;
  status: string;
  base_status: string;
  lines: InvoiceLine[];
  payment?: {
    allocated_amount?: number;
    outstanding_amount?: number;
  };
  created_at: string;
  updated_at: string;
}

type CreateInvoiceInput = {
  customer_id: string;
  due_date: string;
  invoice_date?: string;
  notes?: string;
  lines: InvoiceLine[];
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLine = (line: any): InvoiceLine => ({
  ...line,
  quantity: toNumber(line.quantity),
  unit_price: toNumber(line.unit_price),
  discount_value: toNumber(line.discount_value),
  discount_amount: toNumber(line.discount_amount),
  tax_rate: toNumber(line.tax_rate),
  line_subtotal: toNumber(line.line_subtotal),
  line_tax_amount: toNumber(line.line_tax_amount),
  line_total: toNumber(line.line_total),
});

const normalizeInvoice = (invoice: any): Invoice => ({
  ...invoice,
  subtotal_amount: toNumber(invoice.subtotal_amount),
  tax_amount: toNumber(invoice.tax_amount),
  total_amount: toNumber(invoice.total_amount),
  lines: Array.isArray(invoice.lines) ? invoice.lines.map(normalizeLine) : [],
  payment: invoice.payment
    ? {
        allocated_amount: toNumber(invoice.payment.allocated_amount),
        outstanding_amount: toNumber(invoice.payment.outstanding_amount),
      }
    : undefined,
});

export const useInvoices = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchInvoices = async () => {
    try {
      const data = await accountingInvoiceApi.list();
      const rows = Array.isArray(data) ? data : data.data || [];
      setInvoices(rows.map(normalizeInvoice));
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

  const createDraft = async (invoice: CreateInvoiceInput) => {
    try {
      const created = await accountingInvoiceApi.createDraft(invoice);
      toast.success(`Invoice ${created.invoice_no} created`);
      await fetchInvoices();
      return normalizeInvoice(created);
    } catch (error: any) {
      toast.error(error.message || "Failed to create invoice");
      return null;
    }
  };

  const updateDraft = async (id: string, invoice: CreateInvoiceInput) => {
    try {
      const updated = await accountingInvoiceApi.updateDraft(id, invoice);
      toast.success("Invoice updated successfully");
      await fetchInvoices();
      return normalizeInvoice(updated);
    } catch (error: any) {
      toast.error(error.message || "Failed to update invoice");
      return null;
    }
  };

  const approveInvoice = async (id: string) => {
    try {
      await accountingInvoiceApi.approve(id);
      toast.success("Invoice approved");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to approve invoice");
      return false;
    }
  };

  const postInvoice = async (id: string) => {
    try {
      await accountingInvoiceApi.post(id);
      toast.success("Invoice posted");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to post invoice");
      return false;
    }
  };

  const voidInvoice = async (id: string) => {
    try {
      await accountingInvoiceApi.void(id);
      toast.success("Invoice voided");
      await fetchInvoices();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to void invoice");
      return false;
    }
  };

  return {
    invoices,
    isLoading,
    createDraft,
    updateDraft,
    approveInvoice,
    postInvoice,
    voidInvoice,
    refetch: fetchInvoices,
  };
};
