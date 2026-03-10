import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/utils/format";
import { useSales } from "@/hooks/useSales";
import { usePurchases } from "@/hooks/usePurchases";

const COLORS = ["#0d9488", "#f59e0b"];

const Reports = () => {
  const { sales, isLoading: salesLoading } = useSales();
  const { purchases, isLoading: purchasesLoading } = usePurchases();

  const handleDownloadReport = () => {
    toast.success("Report downloaded successfully");
  };

  // Calculate monthly sales and purchases
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyData: { [key: string]: { sales: number; purchases: number } } = {};

  sales.forEach((sale) => {
    const date = new Date(sale.sale_date);
    const month = monthNames[date.getMonth()];
    if (!monthlyData[month]) monthlyData[month] = { sales: 0, purchases: 0 };
    monthlyData[month].sales += Number(sale.amount);
  });

  purchases.forEach((purchase) => {
    const date = new Date(purchase.purchase_date);
    const month = monthNames[date.getMonth()];
    if (!monthlyData[month]) monthlyData[month] = { sales: 0, purchases: 0 };
    monthlyData[month].purchases += Number(purchase.amount);
  });

  const salesPurchasesData = monthNames
    .filter((month) => monthlyData[month])
    .map((month) => ({
      month,
      sales: monthlyData[month].sales,
      purchases: monthlyData[month].purchases,
    }));

  // Calculate totals
  const totalSales = sales.reduce((sum, s) => sum + Number(s.amount), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.amount), 0);
  const netProfit = totalSales - totalPurchases;

  // Tax data (estimated at 13% VAT)
  const taxCollected = totalSales * 0.13;
  const taxPayable = totalPurchases * 0.13;

  const taxData = [
    { name: "GST Collected", value: taxCollected },
    { name: "GST Payable", value: taxPayable },
  ];

  const isLoading = salesLoading || purchasesLoading;

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
          <p className="text-muted-foreground mt-1">Analyze your business performance with data insights</p>
        </div>
        <Button className="gap-2" onClick={handleDownloadReport}>
          <Download className="w-4 h-4" />
          Download Report
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Sales vs Purchases</CardTitle>
          </CardHeader>
          <CardContent>
            {salesPurchasesData.length > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={salesPurchasesData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px'
                    }} 
                  />
                  <Legend />
                  <Bar dataKey="sales" fill="#0d9488" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="purchases" fill="#06b6d4" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No sales or purchase data available yet
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax Collected vs Payable</CardTitle>
          </CardHeader>
          <CardContent>
            {totalSales > 0 || totalPurchases > 0 ? (
              <ResponsiveContainer width="100%" height={350}>
                <PieChart>
                  <Pie
                    data={taxData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${formatCurrency(value)}`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {taxData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[350px] text-muted-foreground">
                No tax data available yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(netProfit)}</p>
            <p className="text-sm text-muted-foreground mt-2">Total sales minus purchases</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardHeader>
            <CardTitle className="text-lg">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(totalSales)}</p>
            <p className="text-sm text-muted-foreground mt-2">From {sales.length} sales</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardHeader>
            <CardTitle className="text-lg">Total Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(totalPurchases)}</p>
            <p className="text-sm text-muted-foreground mt-2">From {purchases.length} purchases</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
