import { StatCard } from "@/components/Dashboard/StatCard";
import { DollarSign, TrendingUp, TrendingDown, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/utils/format";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useInventory } from "@/hooks/useInventory";

const categoryData = [
  { name: "Electronics", value: 35 },
  { name: "Furniture", value: 25 },
  { name: "Stationery", value: 20 },
  { name: "Others", value: 20 },
];

const COLORS = ["#0d9488", "#06b6d4", "#3b82f6", "#8b5cf6"];

const Dashboard = () => {
  const { stats, isLoading } = useDashboardStats();
  const { inventory } = useInventory();

  // Calculate category data from inventory
  const categoryMap: { [key: string]: number } = {};
  inventory.forEach((item) => {
    const category = item.category || "Others";
    categoryMap[category] = (categoryMap[category] || 0) + 1;
  });

  const dynamicCategoryData = Object.keys(categoryMap).length > 0
    ? Object.entries(categoryMap).map(([name, value]) => ({ name, value }))
    : categoryData;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard Overview</h1>
          <p className="text-muted-foreground mt-1">Loading your business data...</p>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard Overview</h1>
        <p className="text-muted-foreground mt-1">Monitor your business cash flow in real time</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Sales"
          value={formatCurrency(stats.totalSales)}
          icon={DollarSign}
          trend="From all recorded sales"
          trendUp
        />
        <StatCard
          title="Pending Receivables"
          value={formatCurrency(stats.pendingReceivables)}
          icon={TrendingUp}
          trend={`${stats.pendingReceivablesCount} invoices pending`}
        />
        <StatCard
          title="Outstanding Payables"
          value={formatCurrency(stats.outstandingPayables)}
          icon={TrendingDown}
          trend="Bills to be paid"
        />
        <StatCard
          title="Inventory Value"
          value={formatCurrency(stats.inventoryValue)}
          icon={Package}
          trend={`${stats.inventoryCount} items in stock`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.monthlySales.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={stats.monthlySales}>
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
                  <Line 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#0d9488" 
                    strokeWidth={2}
                    dot={{ fill: '#0d9488', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No sales data available yet. Record sales to see the chart.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category-Wise Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dynamicCategoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {dynamicCategoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
