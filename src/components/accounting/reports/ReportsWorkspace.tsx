import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountingReportsApi } from "@/services/api";
import { useMasterData } from "@/hooks/useMasterData";
import { useReconciliations } from "@/hooks/useReconciliations";
import { EmptyState } from "@/components/accounting/EmptyState";
import { LoadingState } from "@/components/accounting/LoadingState";
import { normalizeReconciliationSummaryReports } from "@/utils/reconciliationSummary";
import { formatCurrency, formatDate } from "@/utils/format";
import { toast } from "sonner";
import { ReportDateControls } from "./ReportDateControls";
import { ReportSectionNav } from "./ReportSectionNav";
import { ReconciliationDrilldown } from "./ReconciliationDrilldown";
import type { DateRange, ReportSectionKey } from "./reportTypes";
import { todayISO, yearRange } from "./reportTypes";
import { RefreshCw } from "lucide-react";

type ReportState = {
  trialBalance: any | null;
  profitLoss: any | null;
  balanceSheet: any | null;
  arAging: any | null;
  apAging: any | null;
  stockSummary: any | null;
};

export function ReportsWorkspace() {
  const location = useLocation();
  const nowYear = new Date().getFullYear();
  const [section, setSection] = useState<ReportSectionKey>("financial_statements");

  const [range, setRange] = useState<DateRange>(() => yearRange(nowYear));
  const [asOfDate, setAsOfDate] = useState<string>(() => yearRange(nowYear).endDate || todayISO());

  const { customerOptions, vendorOptions, itemOptions } = useMasterData();
  const { reconciliations, isLoading: reconciliationsLoading, refetch: refetchReconciliations } = useReconciliations(asOfDate);

  const [reports, setReports] = useState<ReportState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [customerStatement, setCustomerStatement] = useState<any>(null);
  const [vendorStatement, setVendorStatement] = useState<any>(null);
  const [stockLedger, setStockLedger] = useState<any>(null);

  const loadReportBundle = useCallback(async () => {
    const results = await Promise.allSettled([
      accountingReportsApi.getTrialBalance({ startDate: range.startDate, endDate: range.endDate }),
      accountingReportsApi.getProfitLoss({ startDate: range.startDate, endDate: range.endDate }),
      accountingReportsApi.getBalanceSheet({ asOfDate }),
      accountingReportsApi.getARAging({ asOfDate }),
      accountingReportsApi.getAPAging({ asOfDate }),
      accountingReportsApi.getStockSummary({ asOfDate }),
    ]);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === results.length) {
      toast.error("Failed to load reports");
      setReports(null);
    } else {
      if (failed.length > 0) toast.error("Some report sections could not be loaded");
      const [tb, pl, bs, ar, ap, stock] = results;
      setReports({
        trialBalance: tb.status === "fulfilled" ? tb.value : null,
        profitLoss: pl.status === "fulfilled" ? pl.value : null,
        balanceSheet: bs.status === "fulfilled" ? bs.value : null,
        arAging: ar.status === "fulfilled" ? ar.value : null,
        apAging: ap.status === "fulfilled" ? ap.value : null,
        stockSummary: stock.status === "fulfilled" ? stock.value : null,
      });
    }
  }, [range.startDate, range.endDate, asOfDate]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        await loadReportBundle();
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          toast.error("Failed to load reports");
          setReports(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadReportBundle, location.key]);

  const handleRefreshReports = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadReportBundle(), refetchReconciliations()]);
      if (selectedCustomerId) {
        try {
          const stmt = await accountingReportsApi.getCustomerStatement(selectedCustomerId, {
            startDate: range.startDate,
            endDate: range.endDate,
          });
          setCustomerStatement(stmt);
        } catch {
          setCustomerStatement(null);
        }
      }
      if (selectedVendorId) {
        try {
          const stmt = await accountingReportsApi.getVendorStatement(selectedVendorId, {
            startDate: range.startDate,
            endDate: range.endDate,
          });
          setVendorStatement(stmt);
        } catch {
          setVendorStatement(null);
        }
      }
      if (selectedItemId) {
        try {
          const led = await accountingReportsApi.getStockLedger(selectedItemId, {
            startDate: range.startDate,
            endDate: range.endDate,
          });
          setStockLedger(led);
        } catch {
          setStockLedger(null);
        }
      }
      toast.success("Reports refreshed");
    } catch (e) {
      console.error(e);
      toast.error("Could not refresh reports");
    } finally {
      setIsRefreshing(false);
    }
  }, [
    loadReportBundle,
    refetchReconciliations,
    selectedCustomerId,
    selectedVendorId,
    selectedItemId,
    range.startDate,
    range.endDate,
  ]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setCustomerStatement(null);
      return;
    }
    accountingReportsApi
      .getCustomerStatement(selectedCustomerId, { startDate: range.startDate, endDate: range.endDate })
      .then(setCustomerStatement)
      .catch(() => setCustomerStatement(null));
  }, [selectedCustomerId, range.startDate, range.endDate]);

  useEffect(() => {
    if (!selectedVendorId) {
      setVendorStatement(null);
      return;
    }
    accountingReportsApi
      .getVendorStatement(selectedVendorId, { startDate: range.startDate, endDate: range.endDate })
      .then(setVendorStatement)
      .catch(() => setVendorStatement(null));
  }, [selectedVendorId, range.startDate, range.endDate]);

  useEffect(() => {
    if (!selectedItemId) {
      setStockLedger(null);
      return;
    }
    accountingReportsApi
      .getStockLedger(selectedItemId, { startDate: range.startDate, endDate: range.endDate })
      .then(setStockLedger)
      .catch(() => setStockLedger(null));
  }, [selectedItemId, range.startDate, range.endDate]);

  const summaryReports = useMemo(
    () => normalizeReconciliationSummaryReports(reconciliations?.summary?.reports),
    [reconciliations]
  );

  if (isLoading || reconciliationsLoading) {
    return <LoadingState title="Reports" message="Loading accounting reports and reconciliations..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">
            Control-first reporting: statements, ledgers, and reconciliations you can actually work from.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-2"
          disabled={isRefreshing || isLoading}
          onClick={() => void handleRefreshReports()}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh data
        </Button>
      </div>

      <ReportDateControls range={range} onChangeRange={setRange} asOfDate={asOfDate} onChangeAsOfDate={setAsOfDate} />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <div className="text-sm font-semibold text-foreground">Report categories</div>
          <ReportSectionNav active={section} onChange={setSection} />
        </aside>

        <main className="space-y-6">
          {section === "financial_statements" ? (
            <Tabs defaultValue="trial_balance" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="trial_balance">Trial Balance</TabsTrigger>
                <TabsTrigger value="profit_loss">Profit &amp; Loss</TabsTrigger>
                <TabsTrigger value="balance_sheet">Balance Sheet</TabsTrigger>
              </TabsList>

              <TabsContent value="trial_balance" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Trial Balance</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Period: {range.startDate} to {range.endDate}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Code</TableHead>
                            <TableHead>Account</TableHead>
                            <TableHead className="text-right">Debits</TableHead>
                            <TableHead className="text-right">Credits</TableHead>
                            <TableHead className="text-right">Closing</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reports?.trialBalance?.lines || []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <EmptyState title="No trial balance lines" description="No posted activity found for this period." />
                              </TableCell>
                            </TableRow>
                          ) : (
                            (reports?.trialBalance?.lines || []).map((line: any) => (
                              <TableRow key={line.account_ref}>
                                <TableCell className="font-medium">{line.account_code}</TableCell>
                                <TableCell>{line.account_name}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.debit_total || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.credit_total || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.closing_amount || 0)}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="profit_loss" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Net profit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.profitLoss?.totals?.net_profit || 0)}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Period: {range.startDate} to {range.endDate}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total income</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.profitLoss?.totals?.total_income || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Total expenses</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.profitLoss?.totals?.total_expenses || 0)}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Profit &amp; Loss (detail)</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Income</div>
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(reports?.profitLoss?.income_lines || []).map((l: any, idx: number) => (
                              <TableRow key={l.account_ref || idx}>
                                <TableCell className="font-medium">{l.account_name}</TableCell>
                                <TableCell className="text-right">{formatCurrency(l.amount || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Expenses</div>
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Account</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(reports?.profitLoss?.expense_lines || []).map((l: any, idx: number) => (
                              <TableRow key={l.account_ref || idx}>
                                <TableCell className="font-medium">{l.account_name}</TableCell>
                                <TableCell className="text-right">{formatCurrency(l.amount || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="balance_sheet" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Assets</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.balanceSheet?.totals?.total_assets || 0)}</div>
                      <div className="text-xs text-muted-foreground mt-1">As of {asOfDate}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Liabilities</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.balanceSheet?.totals?.total_liabilities || 0)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Equity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatCurrency(reports?.balanceSheet?.totals?.total_equity || 0)}</div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Balance Sheet</CardTitle>
                    <div className="text-sm text-muted-foreground">As of {asOfDate}</div>
                  </CardHeader>
                  <CardContent className="grid gap-6 lg:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold">Assets</div>
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableBody>
                            {(reports?.balanceSheet?.assets || []).map((l: any, idx: number) => (
                              <TableRow key={l.account_ref || idx}>
                                <TableCell className="font-medium">{l.account_name}</TableCell>
                                <TableCell className="text-right">{formatCurrency(l.amount || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Liabilities</div>
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableBody>
                              {(reports?.balanceSheet?.liabilities || []).map((l: any, idx: number) => (
                                <TableRow key={l.account_ref || idx}>
                                  <TableCell className="font-medium">{l.account_name}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(l.amount || 0)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-semibold">Equity</div>
                        <div className="rounded-md border border-border overflow-hidden">
                          <Table>
                            <TableBody>
                              {(reports?.balanceSheet?.equity || []).map((l: any, idx: number) => (
                                <TableRow key={l.account_ref || idx}>
                                  <TableCell className="font-medium">{l.account_name}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(l.amount || 0)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {section === "subledger" ? (
            <Tabs defaultValue="ar_aging" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="ar_aging">AR Aging</TabsTrigger>
                <TabsTrigger value="ap_aging">AP Aging</TabsTrigger>
                <TabsTrigger value="customer_statement">Customer Statement</TabsTrigger>
                <TabsTrigger value="vendor_statement">Vendor Statement</TabsTrigger>
              </TabsList>

              <TabsContent value="ar_aging" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">AR Aging</CardTitle>
                    <div className="text-sm text-muted-foreground">As of {asOfDate}</div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-5 text-sm">
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">Current</div>
                        <div className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.current || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">1-30</div>
                        <div className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_1_30 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">31-60</div>
                        <div className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_31_60 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">61-90</div>
                        <div className="font-semibold">{formatCurrency(reports?.arAging?.buckets?.days_61_90 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">91+</div>
                        <div className="font-semibold text-amber-700">{formatCurrency(reports?.arAging?.buckets?.days_91_plus || 0)}</div>
                      </div>
                    </div>

                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Days overdue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reports?.arAging?.lines || []).slice(0, 300).map((line: any, idx: number) => (
                            <TableRow key={line.customer_id || `${line.customer_name}-${idx}`}>
                              <TableCell className="font-medium">{line.customer_name || "Unknown"}</TableCell>
                              <TableCell className="text-right">{formatCurrency(line.outstanding_amount || 0)}</TableCell>
                              <TableCell className="text-right">{Number(line.days_overdue || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="ap_aging" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">AP Aging</CardTitle>
                    <div className="text-sm text-muted-foreground">As of {asOfDate}</div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-5 text-sm">
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">Current</div>
                        <div className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.current || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">1-30</div>
                        <div className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_1_30 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">31-60</div>
                        <div className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_31_60 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">61-90</div>
                        <div className="font-semibold">{formatCurrency(reports?.apAging?.buckets?.days_61_90 || 0)}</div>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <div className="text-xs text-muted-foreground">91+</div>
                        <div className="font-semibold text-amber-700">{formatCurrency(reports?.apAging?.buckets?.days_91_plus || 0)}</div>
                      </div>
                    </div>

                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Vendor</TableHead>
                            <TableHead className="text-right">Outstanding</TableHead>
                            <TableHead className="text-right">Days overdue</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reports?.apAging?.lines || []).slice(0, 300).map((line: any, idx: number) => (
                            <TableRow key={line.vendor_id || `${line.vendor_name}-${idx}`}>
                              <TableCell className="font-medium">{line.vendor_name || "Unknown"}</TableCell>
                              <TableCell className="text-right">{formatCurrency(line.outstanding_amount || 0)}</TableCell>
                              <TableCell className="text-right">{Number(line.days_overdue || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="customer_statement" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Customer Statement</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Period: {range.startDate} to {range.endDate}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {customerOptions
                          .filter((o) => o.value !== "")
                          .map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {!customerStatement ? (
                      <EmptyState title="Pick a customer" description="Statements are generated from posted documents and allocations." />
                    ) : (
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
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
                                <TableCell className="font-medium">{line.document_no}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.debit_amount || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.credit_amount || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.running_balance || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="vendor_statement" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Vendor Statement</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Period: {range.startDate} to {range.endDate}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {vendorOptions
                          .filter((o) => o.value !== "")
                          .map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {!vendorStatement ? (
                      <EmptyState title="Pick a vendor" description="Vendor statements reflect posted bills, debit notes, and allocations." />
                    ) : (
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
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
                                <TableCell className="font-medium">{line.document_no}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.debit_amount || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.credit_amount || 0)}</TableCell>
                                <TableCell className="text-right">{formatCurrency(line.running_balance || 0)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {section === "inventory" ? (
            <Tabs defaultValue="stock_summary" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto">
                <TabsTrigger value="stock_summary">Stock Summary</TabsTrigger>
                <TabsTrigger value="stock_ledger">Stock Ledger</TabsTrigger>
              </TabsList>

              <TabsContent value="stock_summary" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Stock Summary</CardTitle>
                    <div className="text-sm text-muted-foreground">As of {asOfDate}</div>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Item</TableHead>
                            <TableHead>SKU</TableHead>
                            <TableHead className="text-right">On hand</TableHead>
                            <TableHead className="text-right">Value</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(reports?.stockSummary?.lines || []).slice(0, 500).map((line: any) => (
                            <TableRow key={line.item_id || line.item_name}>
                              <TableCell className="font-medium">{line.item_name}</TableCell>
                              <TableCell>{line.sku || "-"}</TableCell>
                              <TableCell className="text-right">{Number(line.quantity_on_hand || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(line.on_hand_value || 0)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="stock_ledger" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Stock Ledger</CardTitle>
                    <div className="text-sm text-muted-foreground">
                      Period: {range.startDate} to {range.endDate}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {itemOptions
                          .filter((o) => o.value !== "")
                          .map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {!stockLedger ? (
                      <EmptyState title="Pick an item" description="Stock ledger shows movement-based balances and audit trails." />
                    ) : (
                      <div className="rounded-md border border-border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Date</TableHead>
                              <TableHead>Movement</TableHead>
                              <TableHead className="text-right">Qty delta</TableHead>
                              <TableHead className="text-right">Running qty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(stockLedger?.lines || []).map((line: any, index: number) => (
                              <TableRow key={`${line.id || line.movement_date}-${index}`}>
                                <TableCell>{formatDate(line.movement_date)}</TableCell>
                                <TableCell className="font-medium">{String(line.movement_type || "").replaceAll("_", " ")}</TableCell>
                                <TableCell className="text-right">{Number(line.quantity_delta || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">{Number(line.running_quantity || 0).toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}

          {section === "reconciliations" ? (
            <div className="space-y-6">
              <Card className={summaryReports.some((r: any) => !r?.is_reconciled) ? "border-amber-200" : "border-emerald-200"}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Reconciliation summary</CardTitle>
                  <div className="text-sm text-muted-foreground">As of {asOfDate}</div>
                </CardHeader>
                <CardContent>
                  <div className="rounded-md border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Report</TableHead>
                          <TableHead className="text-right">GL balance</TableHead>
                          <TableHead className="text-right">Subledger</TableHead>
                          <TableHead className="text-right">Variance</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {summaryReports.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5}>
                              <EmptyState title="No reconciliation summary" description="Reconciliation endpoints did not return summary rows." />
                            </TableCell>
                          </TableRow>
                        ) : (
                          summaryReports.map((r: any) => (
                            <TableRow key={r.report_key}>
                              <TableCell className="font-medium">{r.report_name || r.report_key}</TableCell>
                              <TableCell className="text-right">{formatCurrency(r.gl_balance || 0)}</TableCell>
                              <TableCell className="text-right">{formatCurrency(r.subledger_balance || 0)}</TableCell>
                              <TableCell className={`text-right ${Math.abs(Number(r.variance || 0)) < 0.0001 ? "text-emerald-600" : "text-amber-600"}`}>
                                {formatCurrency(r.variance || 0)}
                              </TableCell>
                              <TableCell>{r.is_reconciled ? "Reconciled" : "Variance"}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-6 xl:grid-cols-2">
                <ReconciliationDrilldown
                  title="AR control reconciliation"
                  report={reconciliations?.ar}
                  hint="Use this to validate Accounts Receivable control (GL) matches customer subledger totals."
                />
                <ReconciliationDrilldown
                  title="AP control reconciliation"
                  report={reconciliations?.ap}
                  hint="Use this to validate Accounts Payable control (GL) matches vendor subledger totals."
                />
                <ReconciliationDrilldown
                  title="Inventory control reconciliation"
                  report={reconciliations?.inventory}
                  hint="Use this to validate inventory valuation control matches stock subledger value."
                />
                <ReconciliationDrilldown
                  title="Tax control reconciliation"
                  report={reconciliations?.tax}
                  hint="Use this to validate tax liability/control balances against computed tax position."
                />
                <ReconciliationDrilldown
                  title="Advances reconciliation"
                  report={reconciliations?.advances}
                  hint="Use this to validate customer/vendor advances are correctly reflected across ledgers."
                />
                <ReconciliationDrilldown
                  title="GRNI control reconciliation"
                  report={reconciliations?.grni}
                  hint="Use this to validate GRNI control: goods received not invoiced should reconcile between GRNs and AP/Inventory postings."
                />
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

