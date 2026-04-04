import { useState, useEffect } from "react";
import { accountingInvoiceApi, accountingReportsApi } from "@/services/api";

export interface DashboardStats {
  totalSales: number;
  pendingReceivables: number;
  pendingReceivablesCount: number;
  outstandingPayables: number;
  inventoryValue: number;
  inventoryCount: number;
  monthlySales: { month: string; sales: number }[];
}

const defaultStats: DashboardStats = {
  totalSales: 0,
  pendingReceivables: 0,
  pendingReceivablesCount: 0,
  outstandingPayables: 0,
  inventoryValue: 0,
  inventoryCount: 0,
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

      const [profitLoss, arAging, apAging, stockSummary, invoices] = await Promise.all([
        accountingReportsApi.getProfitLoss({ startDate, endDate }),
        accountingReportsApi.getARAging({ asOfDate }),
        accountingReportsApi.getAPAging({ asOfDate }),
        accountingReportsApi.getStockSummary({ asOfDate }),
        accountingInvoiceApi.list(),
      ]);

      const monthlySalesMap = new Map<string, number>();
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      (Array.isArray(invoices) ? invoices : []).forEach((invoice: any) => {
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
