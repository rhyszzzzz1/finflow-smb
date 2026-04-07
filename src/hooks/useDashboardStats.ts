import { useState, useEffect } from "react";
import { accountingInvoiceApi, accountingReportsApi, goodsReceiptApi, purchaseOrderApi, salesOrderApi, salesQuoteApi } from "@/services/api";

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
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const year = new Date().getFullYear();
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      const asOfDate = new Date().toISOString().slice(0, 10);

      const [
        profitLossResult,
        arAgingResult,
        apAgingResult,
        stockSummaryResult,
        invoicesResult,
        salesQuotesResult,
        salesOrdersResult,
        purchaseOrdersResult,
        goodsReceiptsResult,
        grniResult,
      ] = await Promise.allSettled([
        accountingReportsApi.getProfitLoss({ startDate, endDate }),
        accountingReportsApi.getARAging({ asOfDate }),
        accountingReportsApi.getAPAging({ asOfDate }),
        accountingReportsApi.getStockSummary({ asOfDate }),
        accountingInvoiceApi.list(),
        salesQuoteApi.list(),
        salesOrderApi.list(),
        purchaseOrderApi.list(),
        goodsReceiptApi.list(),
        accountingReportsApi.getGRNIControlReconciliation({ asOfDate }),
      ]);

      const profitLoss = profitLossResult.status === "fulfilled" ? profitLossResult.value : null;
      const arAging = arAgingResult.status === "fulfilled" ? arAgingResult.value : null;
      const apAging = apAgingResult.status === "fulfilled" ? apAgingResult.value : null;
      const stockSummary = stockSummaryResult.status === "fulfilled" ? stockSummaryResult.value : null;
      const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value : [];
      const salesQuotes = salesQuotesResult.status === "fulfilled" ? salesQuotesResult.value : [];
      const salesOrders = salesOrdersResult.status === "fulfilled" ? salesOrdersResult.value : [];
      const purchaseOrders = purchaseOrdersResult.status === "fulfilled" ? purchaseOrdersResult.value : [];
      const goodsReceipts = goodsReceiptsResult.status === "fulfilled" ? goodsReceiptsResult.value : [];
      const grni = grniResult.status === "fulfilled" ? grniResult.value : null;

      const monthlySalesMap = new Map<string, number>();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const invoiceRows = Array.isArray(invoices) ? invoices : [];
      invoiceRows.forEach((invoice: any) => {
        const status = String(invoice.status || "").toLowerCase();
        if (["draft", "void"].includes(status)) return;
        const invoiceDate = invoice.invoice_date ? new Date(invoice.invoice_date) : null;
        if (!invoiceDate || Number.isNaN(invoiceDate.getTime()) || invoiceDate.getFullYear() !== year) return;
        const month = monthNames[invoiceDate.getMonth()];
        monthlySalesMap.set(month, toNumber(monthlySalesMap.get(month)) + toNumber(invoice.total_amount));
      });

      setStats({
        totalSales: toNumber(profitLoss?.totals?.total_income),
        pendingReceivables: toNumber(arAging?.buckets?.total),
        pendingReceivablesCount: Array.isArray(arAging?.lines) ? arAging.lines.length : 0,
        outstandingPayables: toNumber(apAging?.buckets?.total),
        inventoryValue: toNumber(stockSummary?.totals?.total_on_hand_value),
        inventoryCount: toNumber(stockSummary?.totals?.total_items),
        draftSalesQuotes: (Array.isArray(salesQuotes) ? salesQuotes : []).filter((quote: any) => String(quote.status || "").toLowerCase() === "draft").length,
        openSalesOrders: (Array.isArray(salesOrders) ? salesOrders : []).filter((order: any) => !["void", "converted"].includes(String(order.status || "").toLowerCase())).length,
        invoicesAwaitingPosting: invoiceRows.filter((invoice: any) => ["draft", "approved", "pending_approval", "rejected"].includes(String(invoice.base_status || invoice.status || "").toLowerCase())).length,
        openPurchaseOrders: (Array.isArray(purchaseOrders) ? purchaseOrders : []).filter((order: any) => !["void", "received", "closed"].includes(String(order.status || "").toLowerCase())).length,
        unbilledGoodsReceipts: (grni?.details?.open_receipt_lines) || (Array.isArray(goodsReceipts) ? goodsReceipts.filter((receipt: any) => String(receipt.status || "").toLowerCase() === "posted").length : 0),
        grniExposure: toNumber(grni?.subledger_balance),
        monthlySales: monthNames
          .filter((month) => monthlySalesMap.has(month))
          .map((month) => ({ month, sales: toNumber(monthlySalesMap.get(month)) })),
      });
    } catch (error) {
      console.error("Failed to fetch dashboard stats:", error);
      setStats(defaultStats);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    stats,
    isLoading,
    refetch: fetchStats,
  };
};
