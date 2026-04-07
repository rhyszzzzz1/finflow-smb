import { useState, useEffect } from "react";
import { paymentApi, payablesReadApi } from "@/services/api";
import { toast } from "sonner";

export interface Payable {
  document_id: string;
  document_no: string;
  vendor_id: string | null;
  vendor_name: string;
  document_date: string;
  due_date: string;
  document_amount: number;
  applied_amount: number;
  outstanding_amount: number;
  days_overdue: number;
}

export interface PayablesAging {
  as_of_date: string;
  buckets: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_91_plus: number;
    total: number;
  };
  lines: Payable[];
}

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLine = (line: any): Payable => ({
  ...line,
  document_amount: toNumber(line.document_amount),
  applied_amount: toNumber(line.applied_amount),
  outstanding_amount: toNumber(line.outstanding_amount),
  days_overdue: toNumber(line.days_overdue),
});

export const usePayables = () => {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [aging, setAging] = useState<PayablesAging | null>(null);
  const [vendorBalances, setVendorBalances] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchPayables = async () => {
    try {
      const [allRows, agingRows] = await Promise.all([
        payablesReadApi.getAll(),
        payablesReadApi.getAging(),
      ]);

      const rows = Array.isArray(allRows) ? allRows : allRows.data || [];
      const normalizedRows = rows.map(normalizeLine);
      setPayables(normalizedRows);
      const agingBuckets = agingRows?.buckets || agingRows?.bucket || {};
      setAging({
        ...agingRows,
        buckets: {
          current: toNumber(agingBuckets?.current),
          days_1_30: toNumber(agingBuckets?.days_1_30),
          days_31_60: toNumber(agingBuckets?.days_31_60),
          days_61_90: toNumber(agingBuckets?.days_61_90),
          days_91_plus: toNumber(agingBuckets?.days_91_plus),
          total: toNumber(agingBuckets?.total),
        },
        lines: Array.isArray(agingRows?.lines) ? agingRows.lines.map(normalizeLine) : [],
      });

      const uniqueVendorIds = Array.from(
        new Set(normalizedRows.map((row) => row.vendor_id).filter((value): value is string => Boolean(value)))
      );
      const balanceResults = await Promise.allSettled(
        uniqueVendorIds.map(async (vendorId) => {
          const result = await paymentApi.getVendorBalance(vendorId);
          return [vendorId, toNumber(result?.outstanding_balance)] as const;
        })
      );
      const balances: Record<string, number> = {};
      balanceResults.forEach((entry, index) => {
        if (entry.status === "fulfilled") {
          const [id, amount] = entry.value;
          balances[id] = amount;
        } else {
          console.warn("Vendor balance failed:", uniqueVendorIds[index], entry.reason);
        }
      });
      setVendorBalances(balances);
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

  return {
    payables,
    aging,
    vendorBalances,
    isLoading,
    refetch: fetchPayables,
  };
};
