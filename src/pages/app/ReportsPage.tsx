import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountingReportsApi } from "@/services/api";
import { useMasterData } from "@/hooks/useMasterData";
import { useReconciliations } from "@/hooks/useReconciliations";
import { ReconciliationSummaryCard } from "@/components/accounting/ReconciliationSummaryCard";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { formatCurrency, formatDate } from "@/utils/format";
import { normalizeReconciliationSummaryReports } from "@/utils/reconciliationSummary";
import { toast } from "sonner";

export const ReportsPage = () => {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(year));
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [reports, setReports] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { customerOptions, vendorOptions, itemOptions } = useMasterData();
  const { reconciliations, isLoading: reconciliationsLoading } = useReconciliations(`${selectedYear}-12-31`);

  useEffect(() => {
    const loadReports = async () => {
      setIsLoading(true);
      const startDate = `${selectedYear}-01-01`;
      const endDate = `${selectedYear}-12-31`;
      const asOfDate = endDate;

      try {
        const results = await Promise.allSettled([
          accountingReportsApi.getTrialBalance({ startDate, endDate }),
          accountingReportsApi.getProfitLoss({ startDate, endDate }),
          accountingReportsApi.getBalanceSheet({ asOfDate }),
          accountingReportsApi.getARAging({ asOfDate }),
          accountingReportsApi.getAPAging({ asOfDate }),
          accountingReportsApi.getStockSummary({ asOfDate }),
        ]);
        const [tb, pl, bs, ar, ap, stock] = results;
        const failed = results.filter((r) => r.status === "rejected");
        if (failed.length === results.length) {
          toast.error("Failed to load reports");
          setReports(null);
        } else {
          if (failed.length > 0) {
            toast.error("Some report sections could not be loaded");
          }
          setReports({
            trialBalance: tb.status === "fulfilled" ? tb.value : null,
            profitLoss: pl.status === "fulfilled" ? pl.value : null,
            balanceSheet: bs.status === "fulfilled" ? bs.value : null,
            arAging: ar.status === "fulfilled" ? ar.value : null,
            apAging: ap.status === "fulfilled" ? ap.value : null,
            stockSummary: stock.status === "fulfilled" ? stock.value : null,
          });
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load reports");
        setReports(null);
      } finally {
        setIsLoading(false);
      }
    };
    loadReports();
  }, [selectedYear]);

  const [customerStatement, setCustomerStatement] = useState<any>(null);
  const [vendorStatement, setVendorStatement] = useState<any>(null);
  const [stockLedger, setStockLedger] = useState<any>(null);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerStatement(null);
      return;
    }
    accountingReportsApi.getCustomerStatement(selectedCustomerId, { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` }).then(setCustomerStatement).catch(() => setCustomerStatement(null));
  }, [selectedCustomerId, selectedYear]);

  useEffect(() => {
    if (!selectedVendorId) {
      setVendorStatement(null);
      return;
    }
    accountingReportsApi.getVendorStatement(selectedVendorId, { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` }).then(setVendorStatement).catch(() => setVendorStatement(null));
  }, [selectedVendorId, selectedYear]);

  useEffect(() => {
    if (!selectedItemId) {
      setStockLedger(null);
      return;
    }
    accountingReportsApi.getStockLedger(selectedItemId, { startDate: `${selectedYear}-01-01`, endDate: `${selectedYear}-12-31` }).then(setStockLedger).catch(() => setStockLedger(null));
  }, [selectedItemId, selectedYear]);

  const summaryReports = useMemo(
    () => normalizeReconciliationSummaryReports(reconciliations?.summary?.reports),
    [reconciliations]
  );

  if (isLoading || reconciliationsLoading) {
    return <LoadingState title="Reports" message="Loading accounting reports and reconciliations..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Financial statements, stock reporting, statements, and reconciliation controls.</p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover border border-border">
            {[year - 1, year, year + 1].map((option) => <SelectItem key={option} value={String(option)}>{option}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="financials" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="reconciliations">Reconciliations</TabsTrigger>
        </TabsList>

        <TabsContent value="financials" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Net Profit</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(reports?.profitLoss?.totals?.net_profit || 0)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Assets</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(reports?.balanceSheet?.totals?.total_assets || 0)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Liabilities</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{formatCurrency(reports?.balanceSheet?.totals?.total_liabilities || 0)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Trial Balance</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Debits</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reports?.trialBalance?.lines || []).map((line: any) => (
                    <TableRow key={line.account_ref}>
                      <TableCell className="font-medium">{line.account_code}</TableCell>
                      <TableCell>{line.account_name}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.debit_total || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.credit_total || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.closing_amount || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>AR Aging</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Current</span><span className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.current || 0)}</span></div>
                <div className="flex items-center justify-between"><span>1-30 Days</span><span className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_1_30 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>31-60 Days</span><span className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_31_60 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>61-90 Days</span><span className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_61_90 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>91+ Days</span><span className="font-semibold text-amber-600">{formatCurrency(reports?.arAging?.buckets?.days_91_plus || 0)}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>AP Aging</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span>Current</span><span className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.current || 0)}</span></div>
                <div className="flex items-center justify-between"><span>1-30 Days</span><span className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_1_30 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>31-60 Days</span><span className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_31_60 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>61-90 Days</span><span className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_61_90 || 0)}</span></div>
                <div className="flex items-center justify-between"><span>91+ Days</span><span className="font-semibold text-amber-600">{formatCurrency(reports?.apAging?.buckets?.days_91_plus || 0)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="statements" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Customer Statement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {customerOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!customerStatement ? <EmptyState title="Pick a customer" description="Statements are generated from posted accounting documents and allocations." /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(customerStatement?.lines || []).map((line: any, index: number) => (
                        <TableRow key={`${line.document_no}-${index}`}>
                          <TableCell>{formatDate(line.document_date)}</TableCell>
                          <TableCell>{line.document_no}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.debit_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.credit_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.running_balance || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Vendor Statement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {vendorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {!vendorStatement ? <EmptyState title="Pick a vendor" description="Vendor statements reflect posted purchase bills, debit notes, and allocations." /> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(vendorStatement?.lines || []).map((line: any, index: number) => (
                        <TableRow key={`${line.document_no}-${index}`}>
                          <TableCell>{formatDate(line.document_date)}</TableCell>
                          <TableCell>{line.document_no}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.debit_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.credit_amount || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.running_balance || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Stock Summary</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">On Hand</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(reports?.stockSummary?.lines || []).map((line: any) => (
                    <TableRow key={line.item_id || line.item_name}>
                      <TableCell className="font-medium">{line.item_name}</TableCell>
                      <TableCell>{line.sku || "-"}</TableCell>
                      <TableCell className="text-right">{Number(line.quantity_on_hand || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(line.on_hand_value || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Stock Ledger</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  {itemOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {!stockLedger ? <EmptyState title="Pick an item" description="Stock ledger history shows authoritative movement-based balances." /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Movement</TableHead>
                      <TableHead className="text-right">Qty Delta</TableHead>
                      <TableHead className="text-right">Running Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(stockLedger?.lines || []).map((line: any, index: number) => (
                      <TableRow key={`${line.id || line.movement_date}-${index}`}>
                        <TableCell>{formatDate(line.movement_date)}</TableCell>
                        <TableCell>{String(line.movement_type || "").replaceAll("_", " ")}</TableCell>
                        <TableCell className="text-right">{Number(line.quantity_delta || 0).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{Number(line.running_quantity || 0).toFixed(2)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reconciliations" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <ReconciliationSummaryCard title="AR Control" report={reconciliations?.ar} />
            <ReconciliationSummaryCard title="AP Control" report={reconciliations?.ap} />
            <ReconciliationSummaryCard title="Inventory Control" report={reconciliations?.inventory} />
            <ReconciliationSummaryCard title="Tax Control" report={reconciliations?.tax} />
            <ReconciliationSummaryCard title="Advances" report={reconciliations?.advances} />
            <ReconciliationSummaryCard title="GRNI Control" report={reconciliations?.grni} />
          </div>

          <Card className={summaryReports.some((report: any) => !report?.is_reconciled) ? "border-amber-200" : "border-emerald-200"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Reconciliation Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Report</TableHead>
                    <TableHead className="text-right">GL Balance</TableHead>
                    <TableHead className="text-right">Subledger</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summaryReports.length === 0 ? (
                    <TableRow><TableCell colSpan={5}><EmptyState title="No reconciliation summary" description="Reconciliation endpoints did not return summary rows." /></TableCell></TableRow>
                  ) : summaryReports.map((report: any) => (
                    <TableRow key={report.report_key}>
                      <TableCell className="font-medium">{report.report_name || report.report_key}</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.gl_balance || 0)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(report.subledger_balance || 0)}</TableCell>
                      <TableCell className={`text-right ${Math.abs(Number(report.variance || 0)) < 0.0001 ? "text-emerald-600" : "text-amber-600"}`}>
                        {formatCurrency(report.variance || 0)}
                      </TableCell>
                      <TableCell>{report.is_reconciled ? "Reconciled" : "Variance"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
