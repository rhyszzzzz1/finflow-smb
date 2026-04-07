import { AlertTriangle, Boxes, ClipboardCheck, FileClock, FileText, Receipt, ShoppingCart, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/Dashboard/StatCard";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useReconciliations } from "@/hooks/useReconciliations";
import { formatCurrency } from "@/utils/format";
import { normalizeReconciliationSummaryReports } from "@/utils/reconciliationSummary";
import { LoadingState } from "@/components/accounting/LoadingState";

export const DashboardPage = () => {
  const { stats, isLoading } = useDashboardStats();
  const { reconciliations } = useReconciliations();

  if (isLoading) {
    return <LoadingState title="Dashboard" message="Loading workflow overview..." />;
  }

  const summaryLines = normalizeReconciliationSummaryReports(reconciliations?.summary?.reports);
  const warnings = summaryLines.filter((line) => !line.is_reconciled);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Track commercial activity, posting readiness, settlement pressure, and accounting control signals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Sales" value={formatCurrency(stats.totalSales)} icon={Wallet} trend="Posted accounting revenue" trendUp />
        <StatCard title="Inventory Value" value={formatCurrency(stats.inventoryValue)} icon={Boxes} trend={`${stats.inventoryCount} stock items`} />
        <StatCard title="Outstanding Receivables" value={formatCurrency(stats.pendingReceivables)} icon={Receipt} trend={`${stats.pendingReceivablesCount} open documents`} />
        <StatCard title="Outstanding Payables" value={formatCurrency(stats.outstandingPayables)} icon={ShoppingCart} trend="Supplier obligations" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Sales Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Draft quotes</span><span className="font-semibold">{stats.draftSalesQuotes}</span></div>
            <div className="flex items-center justify-between"><span>Open orders</span><span className="font-semibold">{stats.openSalesOrders}</span></div>
            <div className="flex items-center justify-between"><span>Invoices awaiting posting</span><span className="font-semibold">{stats.invoicesAwaitingPosting}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-primary" />
              Procurement Workflow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Open purchase orders</span><span className="font-semibold">{stats.openPurchaseOrders}</span></div>
            <div className="flex items-center justify-between"><span>Unbilled receipts</span><span className="font-semibold">{stats.unbilledGoodsReceipts}</span></div>
            <div className="flex items-center justify-between"><span>GRNI exposure</span><span className="font-semibold">{formatCurrency(stats.grniExposure)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileClock className="w-4 h-4 text-primary" />
              Posting Focus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Awaiting posting</span><span className="font-semibold">{stats.invoicesAwaitingPosting}</span></div>
            <div className="flex items-center justify-between"><span>Receivables aging</span><span className="font-semibold">{formatCurrency(stats.pendingReceivables)}</span></div>
            <div className="flex items-center justify-between"><span>Payables aging</span><span className="font-semibold">{formatCurrency(stats.outstandingPayables)}</span></div>
          </CardContent>
        </Card>

        <Card className={warnings.length > 0 ? "border-amber-200 bg-amber-50/60" : "border-emerald-200 bg-emerald-50/60"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${warnings.length > 0 ? "text-amber-600" : "text-emerald-600"}`} />
              Reconciliation Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><span>Warnings</span><span className="font-semibold">{warnings.length}</span></div>
            <div className="flex items-center justify-between"><span>Reports checked</span><span className="font-semibold">{summaryLines.length}</span></div>
            <p className="text-muted-foreground">
              {warnings.length > 0 ? "Review reconciliation variances in Reports." : "All current reconciliation summaries are aligned."}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
