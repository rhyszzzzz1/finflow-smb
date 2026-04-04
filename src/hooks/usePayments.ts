import { useEffect, useState } from "react";
import { paymentApi } from "@/services/api";
import { toast } from "sonner";

export interface BankAccount {
  id: string;
  account_name: string;
  bank_name?: string | null;
  account_number?: string | null;
  is_default?: number;
}

export interface PaymentAllocationInput {
  target_type: "sales_invoice" | "purchase_bill";
  target_id: string;
  allocated_amount: number;
}

export interface ApplyPaymentInput {
  type: "incoming" | "outgoing";
  amount: number;
  date: string;
  method: "cash" | "bank_transfer" | "cheque" | "card" | "wallet" | "other";
  bank_account_id?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
  reference?: string;
  notes?: string;
  allocations: PaymentAllocationInput[];
}

export const usePayments = () => {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBankAccounts = async () => {
    try {
      const data = await paymentApi.listBankAccounts();
      const rows = Array.isArray(data) ? data : data.data || [];
      setBankAccounts(rows);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to load bank accounts");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  const applyPayment = async (payload: ApplyPaymentInput) => {
    try {
      const result = await paymentApi.apply(payload);
      toast.success(`Payment ${result.payment_number || ""} posted`.trim());
      return result;
    } catch (error: any) {
      toast.error(error.message || "Failed to apply payment");
      return null;
    }
  };

  return {
    bankAccounts,
    isLoading,
    applyPayment,
    refetch: fetchBankAccounts,
  };
};
