import { useEffect, useMemo, useState } from "react";
import { chartOfAccountsApi } from "@/services/api";
import { toast } from "sonner";

type Option = { value: string; label: string; meta?: any };

const toOptions = (rows: any[]): Option[] =>
  rows.map((row) => ({
    value: String(row.id),
    label: `${row.account_code} — ${row.account_name}`,
    meta: row,
  }));

export const useChartOfAccounts = (params?: { type?: "expense" | "asset" | "liability" | "income" | "equity" }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const run = async () => {
      try {
        const data = await chartOfAccountsApi.listPostingAccounts({ type: params?.type });
        const list = Array.isArray(data) ? data : data?.data || [];
        setRows(list);
      } catch (e: any) {
        console.error(e);
        toast.error("Failed to load chart of accounts");
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [params?.type]);

  const options = useMemo(() => toOptions(rows), [rows]);

  return { accounts: rows, options, isLoading };
};

