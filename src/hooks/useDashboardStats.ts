import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { accountingInvoiceApi, dashboardStatsApi, goodsReceiptApi, purchaseOrderApi, salesOrderApi, salesQuoteApi } from "@/services/api";

export interface DashboardStats {
  totalSales: number;
  pendingReceivables: number;
  pendingReceivablesCount: number;
  outstandingPayables: number;
  inventoryValue: number;
  inventoryCount: number;
  draftSalesQuotes: number;
  openSalesOrders: number;
  invoicesAwaitingPosting: number;
  openPurchaseOrders: number;
  unbilledGoodsReceipts: number;
  grniExposure: number;
  monthlySales: { month: string; sales: number }[];
}

const defaultStats: DashboardStats = {
  totalSales: 0,
  pendingReceivables: 0,
  pendingReceivablesCount: 0,
  outstandingPayables: 0,
  inventoryValue: 0,
  inventoryCount: 0,
  draftSalesQuotes: 0,
  openSalesOrders: 0,
  invoicesAwaitingPosting: 0,
  openPurchaseOrders: 0,
  unbilledGoodsReceipts: 0,
  grniExposure: 0,
  monthlySales: [],
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const useDashboardStats = () => {
  const coreQuery = useQuery({
    queryKey: ["dashboard", "coreStats"],
    queryFn: async () => {
      const raw = await dashboardStatsApi.getStats();
      const monthlySales = Array.isArray(raw?.monthlySales) ? raw.monthlySales : [];
      return {
        totalSales: toNumber(raw?.totalSales),
        pendingReceivables: toNumber(raw?.pendingReceivables),
        pendingReceivablesCount: toNumber(raw?.pendingReceivablesCount),
        outstandingPayables: toNumber(raw?.outstandingPayables),
        inventoryValue: toNumber(raw?.inventoryValue),
        inventoryCount: toNumber(raw?.inventoryCount),
        monthlySales: monthlySales.map((r: any) => ({ month: String(r.month || ""), sales: toNumber(r.sales) })),
      };
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const workflowQuery = useQuery({
    queryKey: ["dashboard", "workflowCounts"],
    queryFn: async () => {
      const [invoicesResult, salesQuotesResult, salesOrdersResult, purchaseOrdersResult, goodsReceiptsResult] =
        await Promise.allSettled([
          accountingInvoiceApi.list(),
          salesQuoteApi.list(),
          salesOrderApi.list(),
          purchaseOrderApi.list(),
          goodsReceiptApi.list(),
        ]);

      const invoices = invoicesResult.status === "fulfilled" && Array.isArray(invoicesResult.value) ? invoicesResult.value : [];
      const salesQuotes = salesQuotesResult.status === "fulfilled" && Array.isArray(salesQuotesResult.value) ? salesQuotesResult.value : [];
      const salesOrders = salesOrdersResult.status === "fulfilled" && Array.isArray(salesOrdersResult.value) ? salesOrdersResult.value : [];
      const purchaseOrders = purchaseOrdersResult.status === "fulfilled" && Array.isArray(purchaseOrdersResult.value) ? purchaseOrdersResult.value : [];
      const goodsReceipts = goodsReceiptsResult.status === "fulfilled" && Array.isArray(goodsReceiptsResult.value) ? goodsReceiptsResult.value : [];

      return {
        draftSalesQuotes: salesQuotes.filter((q: any) => String(q.status || "").toLowerCase() === "draft").length,
        openSalesOrders: salesOrders.filter((o: any) => !["void", "converted"].includes(String(o.status || "").toLowerCase())).length,
        invoicesAwaitingPosting: invoices.filter((i: any) =>
          ["draft", "approved", "pending_approval", "rejected"].includes(String(i.base_status || i.status || "").toLowerCase())
        ).length,
        openPurchaseOrders: purchaseOrders.filter((o: any) => !["void", "received", "closed"].includes(String(o.status || "").toLowerCase())).length,
        // Best-available approximation: backend dashboard endpoint doesn't include GRNI open line count yet.
        unbilledGoodsReceipts: goodsReceipts.filter((r: any) => String(r.status || "").toLowerCase() === "posted").length,
        // Best-available placeholder: backend dashboard endpoint doesn't include GRNI exposure yet.
        grniExposure: 0,
      };
    },
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const stats: DashboardStats = useMemo(() => {
    const core = coreQuery.data;
    const wf = workflowQuery.data;
    return {
      ...defaultStats,
      totalSales: toNumber(core?.totalSales),
      pendingReceivables: toNumber(core?.pendingReceivables),
      pendingReceivablesCount: toNumber(core?.pendingReceivablesCount),
      outstandingPayables: toNumber(core?.outstandingPayables),
      inventoryValue: toNumber(core?.inventoryValue),
      inventoryCount: toNumber(core?.inventoryCount),
      monthlySales: Array.isArray(core?.monthlySales) ? core!.monthlySales : [],
      draftSalesQuotes: toNumber(wf?.draftSalesQuotes),
      openSalesOrders: toNumber(wf?.openSalesOrders),
      invoicesAwaitingPosting: toNumber(wf?.invoicesAwaitingPosting),
      openPurchaseOrders: toNumber(wf?.openPurchaseOrders),
      unbilledGoodsReceipts: toNumber(wf?.unbilledGoodsReceipts),
      grniExposure: toNumber(wf?.grniExposure),
    };
  }, [coreQuery.data, workflowQuery.data]);

  const lastUpdatedAt = coreQuery.dataUpdatedAt || workflowQuery.dataUpdatedAt || 0;
  const isRefreshing = Boolean(coreQuery.isFetching || workflowQuery.isFetching);
  const isLoading = Boolean((coreQuery.isLoading && !coreQuery.data) || (workflowQuery.isLoading && !workflowQuery.data));

  const errors = {
    core: coreQuery.error ? (coreQuery.error as any) : null,
    workflow: workflowQuery.error ? (workflowQuery.error as any) : null,
  };

  return {
    stats,
    isLoading,
    isRefreshing,
    lastUpdatedAt,
    errors,
    refetch: async () => {
      await Promise.all([coreQuery.refetch(), workflowQuery.refetch()]);
    },
  };
};
