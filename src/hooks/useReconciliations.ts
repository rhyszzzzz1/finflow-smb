import { useCallback, useEffect, useState } from "react";
import { accountingReportsApi } from "@/services/api";
import { toast } from "sonner";

export const useReconciliations = (asOfDate?: string) => {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReconciliations = useCallback(async () => {
    try {
      const params = { asOfDate };
      const [summary, ar, ap, inventory, tax, advances, grni] = await Promise.allSettled([
        accountingReportsApi.getReconciliationSummary(params),
        accountingReportsApi.getARControlReconciliation(params),
        accountingReportsApi.getAPControlReconciliation(params),
        accountingReportsApi.getInventoryControlReconciliation(params),
        accountingReportsApi.getTaxControlReconciliation(params),
        accountingReportsApi.getAdvancesReconciliation(params),
        accountingReportsApi.getGRNIControlReconciliation(params),
      ]);
      setData({
        summary: summary.status === "fulfilled" ? summary.value : null,
        ar: ar.status === "fulfilled" ? ar.value : null,
        ap: ap.status === "fulfilled" ? ap.value : null,
        inventory: inventory.status === "fulfilled" ? inventory.value : null,
        tax: tax.status === "fulfilled" ? tax.value : null,
        advances: advances.status === "fulfilled" ? advances.value : null,
        grni: grni.status === "fulfilled" ? grni.value : null,
      });

      const failures = [summary, ar, ap, inventory, tax, advances, grni].filter((result) => result.status === "rejected");
      if (failures.length > 0) {
        toast.error("Some reconciliation reports could not be loaded");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to load reconciliation reports");
    } finally {
      setIsLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    setIsLoading(true);
    void fetchReconciliations();
  }, [fetchReconciliations]);

  return {
    reconciliations: data,
    isLoading,
    refetch: fetchReconciliations,
  };
};
