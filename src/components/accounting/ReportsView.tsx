import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/utils/format";
import { accountingReportsApi, inventoryApi } from "@/services/api";
import { useClients } from "@/hooks/useClients";

export const ReportsView = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);
  const [customerStatement, setCustomerStatement] = useState<any>(null);
  const [vendorStatement, setVendorStatement] = useState<any>(null);
  const [stockLedger, setStockLedger] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState("");
  const [stockItems, setStockItems] = useState<Array<{ id: string; name: string; sku?: string | null }>>([]);
  const { salesClients, purchaseVendors } = useClients();

  useEffect(() => {
    inventoryApi.getItems()
      .then((items) => {
        const rows = Array.isArray(items) ? items : items?.data || [];
        setStockItems(rows.map((item: any) => ({
          id: item.id,
          name: item.name || item.product_name || item.description || "Unnamed Item",
          sku: item.sku || null,
        })));
      })
      .catch(() => toast.error("Failed to load item master for stock ledger"));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    Promise.all([
      accountingReportsApi.getProfitLoss({ startDate, endDate }),
      accountingReportsApi.getBalanceSheet({ asOfDate: endDate }),
      accountingReportsApi.getARAging({ asOfDate: endDate }),
      accountingReportsApi.getAPAging({ asOfDate: endDate }),
      accountingReportsApi.getStockSummary({ asOfDate: endDate }),
      accountingReportsApi.getTrialBalance({ startDate, endDate }),
    ])
      .then(([profitLoss, balanceSheet, arAging, apAging, stockSummary, trialBalanceResult]) => {
        const receivableExposureMap = new Map<string, number>();
        (arAging?.lines || []).forEach((line: any) => {
          const key = line.customer_name || "Unknown Customer";
          receivableExposureMap.set(key, Number(receivableExposureMap.get(key) || 0) + Number(line.outstanding_amount || 0));
        });

        setReportData({
          profitLoss,
          balanceSheet,
          arAging,
          apAging,
          stockSummary,
          topCustomers: Array.from(receivableExposureMap.entries())
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 5),
        });
        setTrialBalance(trialBalanceResult);
      })
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setIsLoading(false));
  }, [year]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerStatement(null);
      return;
    }
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    accountingReportsApi.getCustomerStatement(selectedCustomer, { startDate, endDate })
      .then(setCustomerStatement)
      .catch(() => toast.error("Failed to load customer statement"));
  }, [selectedCustomer, year]);

  useEffect(() => {
    if (!selectedVendor) {
      setVendorStatement(null);
      return;
    }
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    accountingReportsApi.getVendorStatement(selectedVendor, { startDate, endDate })
      .then(setVendorStatement)
      .catch(() => toast.error("Failed to load vendor statement"));
  }, [selectedVendor, year]);

  useEffect(() => {
    if (!selectedInventoryItem) {
      setStockLedger(null);
      return;
    }
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    accountingReportsApi.getStockLedger(selectedInventoryItem, { startDate, endDate })
      .then(setStockLedger)
      .catch(() => toast.error("Failed to load stock ledger"));
  }, [selectedInventoryItem, year]);

  const COLORS = ["#0d9488", "#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b"];

  const profitLoss = reportData?.profitLoss || {};
  const balanceSheet = reportData?.balanceSheet || {};
  const arAging = reportData?.arAging || {};
  const apAging = reportData?.apAging || {};
  const stockSummary = reportData?.stockSummary || {};
  const topCustomers = reportData?.topCustomers || [];
  const incomeLines = profitLoss?.income_lines || [];
  const expenseLines = profitLoss?.expense_lines || [];

  const combinedData = useMemo(() => Array.from(
    new Set([
      ...incomeLines.map((line: any) => line.account_name),
      ...expenseLines.map((line: any) => line.account_name),
    ])
  ).map((accountName) => ({
    account: accountName,
    revenue: incomeLines.find((line: any) => line.account_name === accountName)?.amount || 0,
    expenses: expenseLines.find((line: any) => line.account_name === accountName)?.amount || 0,
  })), [incomeLines, expenseLines]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">Loading reports...</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">Analyze your business performance from posted accounting data.</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {[2023, 2024, 2025, 2026].map((optionYear) => (
                <SelectItem key={optionYear} value={String(optionYear)}>{optionYear}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="gap-2" onClick={() => toast.success("Report data is live")}>
            <Download className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Profit</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(profitLoss?.totals?.net_profit || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{formatCurrency(profitLoss?.totals?.total_income || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Expenses</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{formatCurrency(profitLoss?.totals?.total_expenses || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Receivables</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{formatCurrency(arAging?.buckets?.total || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payables</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-600">{formatCurrency(apAging?.buckets?.total || 0)}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trial-balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="statements">Statements</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Income vs Expense Accounts ({year})</CardTitle></CardHeader>
              <CardContent>
                {combinedData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={combinedData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="account" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }} />
                      <Legend />
                      <Bar dataKey="revenue" fill="#0d9488" name="Revenue" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenses" fill="#f43f5e" name="Expenses" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">No data for {year} yet.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Top 5 Customers by Outstanding Receivables</CardTitle></CardHeader>
              <CardContent>
                {topCustomers.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={topCustomers} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {topCustomers.map((_: any, index: number) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[280px] text-muted-foreground">No outstanding receivables yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Aging Summary</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-6">
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <p className="text-sm font-medium text-amber-700">Overdue Receivables</p>
                  <p className="text-3xl font-bold text-amber-600 mt-1">{((arAging?.lines || []).filter((line: any) => Number(line.days_overdue) > 0)).length}</p>
                  <p className="text-xs text-amber-600 mt-1">posted invoices past due</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-medium text-red-700">Overdue Payables</p>
                  <p className="text-3xl font-bold text-red-600 mt-1">{((apAging?.lines || []).filter((line: any) => Number(line.days_overdue) > 0)).length}</p>
                  <p className="text-xs text-red-600 mt-1">posted bills past due</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Balance Sheet Snapshot</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Assets</span><span className="font-semibold">{formatCurrency(balanceSheet?.totals?.total_assets || 0)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Liabilities</span><span className="font-semibold">{formatCurrency(balanceSheet?.totals?.total_liabilities || 0)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Equity</span><span className="font-semibold">{formatCurrency(balanceSheet?.totals?.total_equity || 0)}</span></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Inventory Value</span><span className="font-semibold">{formatCurrency(stockSummary?.totals?.total_on_hand_value || 0)}</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trial-balance">
          <Card>
            <CardHeader><CardTitle>Trial Balance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
                <span>Total Debits: <span className="font-semibold text-foreground">{formatCurrency(trialBalance?.totals?.total_debits || 0)}</span></span>
                <span>Total Credits: <span className="font-semibold text-foreground">{formatCurrency(trialBalance?.totals?.total_credits || 0)}</span></span>
                <span>Balanced: <span className="font-semibold text-foreground">{trialBalance?.validation?.journal_balanced ? "Yes" : "No"}</span></span>
              </div>
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Debits</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">Closing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(trialBalance?.lines || []).map((line: any) => (
                      <TableRow key={line.account_ref}>
                        <TableCell className="font-medium">{line.account_code}</TableCell>
                        <TableCell>{line.account_name}</TableCell>
                        <TableCell className="capitalize">{line.account_type}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.debit_total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.credit_total)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.closing_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Customer Statement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {salesClients.map((client) => (
                      <SelectItem key={client.id} value={String(client.counterparty_id || client.id)}>
                        {client.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {customerStatement && (
                  <div className="bg-card rounded-lg border border-border overflow-hidden">
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
                            <TableCell>{line.document_no}</TableCell>
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

            <Card>
              <CardHeader><CardTitle>Vendor Statement</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {purchaseVendors.map((vendor) => (
                      <SelectItem key={vendor.id} value={String(vendor.counterparty_id || vendor.id)}>
                        {vendor.vendor_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {vendorStatement && (
                  <div className="bg-card rounded-lg border border-border overflow-hidden">
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
                            <TableCell>{line.document_no}</TableCell>
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
          </div>
        </TabsContent>

        <TabsContent value="stock" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Stock Summary</CardTitle></CardHeader>
              <CardContent>
                <div className="bg-card rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Item</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">On Hand</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(stockSummary?.lines || []).map((line: any) => (
                        <TableRow key={line.item_id || line.item_name}>
                          <TableCell>{line.item_name}</TableCell>
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

            <Card>
              <CardHeader><CardTitle>Stock Ledger</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <Select value={selectedInventoryItem} onValueChange={setSelectedInventoryItem}>
                  <SelectTrigger><SelectValue placeholder="Select inventory item" /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    {stockItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {stockLedger && (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={stockLedger?.lines || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="movement_date" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <Tooltip contentStyle={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px" }} />
                      <Legend />
                      <Line dataKey="running_quantity" stroke="#0d9488" strokeWidth={2} name="Running Qty" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
                {stockLedger && (
                  <div className="bg-card rounded-lg border border-border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Date</TableHead>
                          <TableHead>Movement</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Running Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(stockLedger?.lines || []).map((line: any, index: number) => (
                          <TableRow key={`${line.id || line.movement_date}-${index}`}>
                            <TableCell>{formatDate(line.movement_date)}</TableCell>
                            <TableCell className="capitalize">{String(line.movement_type || "").replaceAll("_", " ")}</TableCell>
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
