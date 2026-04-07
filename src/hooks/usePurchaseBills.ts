import { useEffect, useState } from "react";
import { purchaseBillApi } from "@/services/api";
import { toast } from "sonner";

export interface PurchaseBillLine {
  id?: string;
  item_id?: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  discount_type?: "none" | "percentage" | "fixed";
  discount_value?: number;
  discount_amount?: number;
  tax_code_id?: string | null;
  tax_rate?: number;
  line_subtotal?: number;
  line_tax_amount?: number;
  line_total?: number;
  expense_account_id?: string | null;
  inventory_account_id?: string | null;
}

export interface PurchaseBill {
  id: string;
  bill_no: string;
  vendor_id: string | null;
  vendor_name: string;
  vendor_email?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  due_date: string;
  bill_date: string;
  status: string;
  base_status?: string;
  approval?: {
    status?: string;
    required?: boolean;
  };
  goods_receipt_id?: string | null;
  purchase_order_id?: string | null;
  lines: PurchaseBillLine[];
  created_at: string;
  updated_at: string;
}

type CreatePurchaseBillInput = {
  vendor_id: string;
  due_date: string;
  bill_date?: string;
  notes?: string;
  lines: PurchaseBillLine[];
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLine = (line: any): PurchaseBillLine => ({
  ...line,
  quantity: toNumber(line.quantity),
  unit_cost: toNumber(line.unit_cost),
  discount_value: toNumber(line.discount_value),
  discount_amount: toNumber(line.discount_amount),
  tax_rate: toNumber(line.tax_rate),
  line_subtotal: toNumber(line.line_subtotal),
  line_tax_amount: toNumber(line.line_tax_amount),
  line_total: toNumber(line.line_total),
});

const normalizeBill = (bill: any): PurchaseBill => ({
  ...bill,
  subtotal_amount: toNumber(bill.subtotal_amount),
  tax_amount: toNumber(bill.tax_amount),
  total_amount: toNumber(bill.total_amount),
  lines: Array.isArray(bill.lines) ? bill.lines.map(normalizeLine) : [],
});

export const usePurchaseBills = () => {
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPurchaseBills = async () => {
    try {
      const data = await purchaseBillApi.list();
      const rows = Array.isArray(data) ? data : data.data || [];
      setPurchaseBills(rows.map(normalizeBill));
    } catch (error: any) {
      toast.error("Failed to load purchase bills");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchaseBills();
  }, []);

  const createDraft = async (bill: CreatePurchaseBillInput) => {
    try {
      const created = await purchaseBillApi.createDraft(bill);
      toast.success(`Bill ${created.bill_no} created`);
      await fetchPurchaseBills();
      return normalizeBill(created);
    } catch (error: any) {
      toast.error(error.message || "Failed to create purchase bill");
      return null;
    }
  };

  const updateDraft = async (id: string, bill: CreatePurchaseBillInput) => {
    try {
      const updated = await purchaseBillApi.updateDraft(id, bill);
      toast.success("Purchase bill updated");
      await fetchPurchaseBills();
      return normalizeBill(updated);
    } catch (error: any) {
      toast.error(error.message || "Failed to update purchase bill");
      return null;
    }
  };

  const approveBill = async (id: string) => {
    try {
      await purchaseBillApi.approve(id);
      toast.success("Purchase bill approved");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to approve purchase bill");
      return false;
    }
  };

  const submitBill = async (id: string, payload?: { comment?: string }) => {
    try {
      await purchaseBillApi.submit(id, payload || {});
      toast.success("Purchase bill submitted for approval");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to submit purchase bill");
      return false;
    }
  };

  const rejectBill = async (id: string, payload: { comment: string }) => {
    try {
      await purchaseBillApi.reject(id, payload);
      toast.success("Purchase bill rejected");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to reject purchase bill");
      return false;
    }
  };

  const resubmitBill = async (id: string, payload?: { comment?: string }) => {
    try {
      await purchaseBillApi.resubmit(id, payload || {});
      toast.success("Purchase bill resubmitted");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to resubmit purchase bill");
      return false;
    }
  };

  const postBill = async (id: string) => {
    try {
      await purchaseBillApi.post(id);
      toast.success("Purchase bill posted");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to post purchase bill");
      return false;
    }
  };

  const voidBill = async (id: string) => {
    try {
      await purchaseBillApi.void(id);
      toast.success("Purchase bill voided");
      await fetchPurchaseBills();
      return true;
    } catch (error: any) {
      toast.error(error.message || "Failed to void purchase bill");
      return false;
    }
  };

  return {
    purchaseBills,
    isLoading,
    createDraft,
    updateDraft,
    submitBill,
    approveBill,
    rejectBill,
    resubmitBill,
    postBill,
    voidBill,
    refetch: fetchPurchaseBills,
  };
};
