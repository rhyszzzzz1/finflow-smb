import { useState, useEffect } from "react";
import { paymentApi, receivablesReadApi } from "@/services/api";
import { toast } from "sonner";

export interface Receivable {
  document_id: string;
  document_no: string;
  customer_id: string | null;
  customer_name: string;
  document_date: string;
  due_date: string;
  document_amount: number;
  applied_amount: number;
  outstanding_amount: number;
  days_overdue: number;
}

export interface ReceivablesAging {
  as_of_date: string;
  buckets: {
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_91_plus: number;
    total: number;
  };
  lines: Receivable[];
}

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeLine = (line: any): Receivable => ({
  ...line,
  document_amount: toNumber(line.document_amount),
  applied_amount: toNumber(line.applied_amount),
  outstanding_amount: toNumber(line.outstanding_amount),
  days_overdue: toNumber(line.days_overdue),
});

export const useReceivables = () => {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [aging, setAging] = useState<ReceivablesAging | null>(null);
  const [customerBalances, setCustomerBalances] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceivables = async () => {
    try {
      const [allRows, agingRows] = await Promise.all([
        receivablesReadApi.getAll(),
        receivablesReadApi.getAging(),
      ]);

      const rows = Array.isArray(allRows) ? allRows : allRows.data || [];
      const normalizedRows = rows.map(normalizeLine);
      setReceivables(normalizedRows);
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

      const uniqueCustomerIds = Array.from(
        new Set(normalizedRows.map((row) => row.customer_id).filter((value): value is string => Boolean(value)))
      );
      const balanceResults = await Promise.allSettled(
        uniqueCustomerIds.map(async (customerId) => {
          const result = await paymentApi.getCustomerBalance(customerId);
          return [customerId, toNumber(result?.outstanding_balance)] as const;
        })
      );
      const balances: Record<string, number> = {};
      balanceResults.forEach((entry, index) => {
        if (entry.status === "fulfilled") {
          const [id, amount] = entry.value;
          balances[id] = amount;
        } else {
          console.warn("Customer balance failed:", uniqueCustomerIds[index], entry.reason);
        }
      });
      setCustomerBalances(balances);
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

  return {
    receivables,
    aging,
    customerBalances,
    isLoading,
    refetch: fetchReceivables,
  };
};
