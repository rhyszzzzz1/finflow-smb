import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { Plus, Edit, Trash2, DollarSign, TrendingUp, TrendingDown, Package, CheckCircle2, FileText, Download, Clock, XCircle, Users, Building2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/Dashboard/StatCard";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useKYCStatus } from "@/hooks/useKYCStatus";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useInventory } from "@/hooks/useInventory";
import { useInvoices } from "@/hooks/useInvoices";
import { useReceivables } from "@/hooks/useReceivables";
import { usePayables } from "@/hooks/usePayables";
import { useClients } from "@/hooks/useClients";
import { useSales } from "@/hooks/useSales";
import { usePurchases } from "@/hooks/usePurchases";
import { clientsApi, inventoryApi, reportsApi, vendorProductsApi } from "@/services/api";

// ============================================
// DASHBOARD PAGE
// ============================================
export const Dashboard = () => {
  const { stats, isLoading } = useDashboardStats();
  const { inventory } = useInventory();

  const categoryData = [
    { name: "Electronics", value: 35 },
    { name: "Furniture", value: 25 },
    { name: "Stationery", value: 20 },
    { name: "Others", value: 20 },
  ];

  const COLORS = ["#0d9488", "#06b6d4", "#3b82f6", "#8b5cf6"];

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

// ============================================
// INVENTORY PAGE
// ============================================
export const Inventory = () => {
  const { inventory, isLoading, addItem, updateItem, deleteItem } = useInventory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCatalogDialogOpen, setIsCatalogDialogOpen] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [currentCatalogId, setCurrentCatalogId] = useState<string | null>(null);
  const [vendorList, setVendorList] = useState<Array<{ id: string; vendor_name: string; linked_profile_id?: string | null }>>([]);
  const [vendorProducts, setVendorProducts] = useState<any[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [isVendorProductsLoading, setIsVendorProductsLoading] = useState(false);
  const [formData, setFormData] = useState({
    linked_vendor_profile_id: "",
    vendor_product_id: "",
    product_name: "",
    sku: "",
    category: "",
    tax_rate: 18,
    stock_quantity: 0,
    purchase_price: 0,
    selling_price: 0,
    payment_type: "cash",
  });
  const [catalogForm, setCatalogForm] = useState({
    product_name: "",
    sku: "",
    category: "",
    description: "",
    selling_price: 0,
    tax_rate: 18,
  });

  const normalizeCatalogProducts = (rows: any[]) =>
    rows.map((item) => ({
      ...item,
      selling_price: Number(item.selling_price) || 0,
      tax_rate: Number(item.tax_rate) || 0,
    }));

  const loadVendorList = async () => {
    try {
      const rows = await clientsApi.getVendorList();
      setVendorList(Array.isArray(rows) ? rows : []);
    } catch {
      setVendorList([]);
    }
  };

  const loadCatalogProducts = async () => {
    try {
      const rows = await vendorProductsApi.getMine();
      setCatalogProducts(normalizeCatalogProducts(Array.isArray(rows) ? rows : []));
    } catch {
      setCatalogProducts([]);
    }
  };

  const loadVendorProducts = async (linkedProfileId: string) => {
    if (!linkedProfileId) {
      setVendorProducts([]);
      return;
    }
    setIsVendorProductsLoading(true);
    try {
      const rows = await inventoryApi.getVendorProducts(linkedProfileId);
      setVendorProducts(normalizeCatalogProducts(Array.isArray(rows) ? rows : []));
    } catch {
      setVendorProducts([]);
    } finally {
      setIsVendorProductsLoading(false);
    }
  };

  useEffect(() => {
    loadVendorList();
    loadCatalogProducts();
  }, []);

  const resetInventoryForm = () => {
    setFormData({
      linked_vendor_profile_id: "",
      vendor_product_id: "",
      product_name: "",
      sku: "",
      category: "",
      tax_rate: 18,
      stock_quantity: 0,
      purchase_price: 0,
      selling_price: 0,
      payment_type: "cash",
    });
    setVendorProducts([]);
    setCurrentItemId(null);
  };

  const resetCatalogForm = () => {
    setCatalogForm({
      product_name: "",
      sku: "",
      category: "",
      description: "",
      selling_price: 0,
      tax_rate: 18,
    });
    setCurrentCatalogId(null);
  };

  const handleVendorChange = async (linkedProfileId: string) => {
    setFormData((prev) => ({
      ...prev,
      linked_vendor_profile_id: linkedProfileId,
      vendor_product_id: "",
      product_name: "",
      sku: "",
      category: "",
      tax_rate: 18,
      purchase_price: 0,
      selling_price: 0,
    }));
    await loadVendorProducts(linkedProfileId);
  };

  const handleProductChange = (productId: string) => {
    const selectedProduct = vendorProducts.find((product) => product.id === productId);
    if (!selectedProduct) return;

    setFormData((prev) => ({
      ...prev,
      vendor_product_id: productId,
      product_name: selectedProduct.product_name,
      sku: selectedProduct.sku,
      category: selectedProduct.category || "",
      tax_rate: Number(selectedProduct.tax_rate) || 18,
      purchase_price: Number(selectedProduct.selling_price) || 0,
      selling_price: prev.selling_price || Number(selectedProduct.selling_price) || 0,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.linked_vendor_profile_id || !formData.vendor_product_id) {
      toast.error("Select a linked vendor and one of their products");
      return;
    }

    const payload = {
      linked_vendor_profile_id: formData.linked_vendor_profile_id,
      vendor_product_id: formData.vendor_product_id,
      stock_quantity: formData.stock_quantity,
      purchase_price: formData.purchase_price,
      selling_price: formData.selling_price,
      payment_type: formData.payment_type,
    };

    const success = currentItemId
      ? await updateItem(currentItemId, payload)
      : await addItem(payload as any);

    if (success) {
      setIsDialogOpen(false);
      resetInventoryForm();
    }
  };

  const handleCatalogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (currentCatalogId) {
        await vendorProductsApi.update(currentCatalogId, catalogForm);
        toast.success("Catalog product updated");
      } else {
        await vendorProductsApi.add(catalogForm);
        toast.success("Catalog product added");
      }
      await loadCatalogProducts();
      setIsCatalogDialogOpen(false);
      resetCatalogForm();
    } catch (error: any) {
      toast.error(error.message || "Failed to save catalog product");
    }
  };

  const openEditDialog = async (item: typeof inventory[0]) => {
    if (!item.linked_vendor_profile_id || !item.vendor_product_id) {
      toast.error("This item was created before vendor-product linking was added");
      return;
    }
    setCurrentItemId(item.id);
    setFormData({
      linked_vendor_profile_id: item.linked_vendor_profile_id,
      vendor_product_id: item.vendor_product_id,
      product_name: item.product_name,
      sku: item.sku,
      category: item.category || "",
      tax_rate: item.tax_rate,
      stock_quantity: item.stock_quantity,
      purchase_price: item.purchase_price,
      selling_price: item.selling_price,
      payment_type: item.payment_type || "cash",
    });
    await loadVendorProducts(item.linked_vendor_profile_id);
    setIsDialogOpen(true);
  };

  const openEditCatalogDialog = (product: any) => {
    setCurrentCatalogId(product.id);
    setCatalogForm({
      product_name: product.product_name,
      sku: product.sku,
      category: product.category || "",
      description: product.description || "",
      selling_price: Number(product.selling_price) || 0,
      tax_rate: Number(product.tax_rate) || 18,
    });
    setIsCatalogDialogOpen(true);
  };

  const handleDeleteCatalogProduct = async (id: string) => {
    try {
      await vendorProductsApi.delete(id);
      toast.success("Catalog product deleted");
      await loadCatalogProducts();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete catalog product");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">Loading inventory...</p>
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
          <h1 className="text-3xl font-bold text-foreground">Inventory Management</h1>
          <p className="text-muted-foreground mt-1">Stock only products published by your linked vendors, and publish your own catalog for other buyers.</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={isCatalogDialogOpen} onOpenChange={(open) => { setIsCatalogDialogOpen(open); if (!open) resetCatalogForm(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Add Catalog Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader><DialogTitle>{currentCatalogId ? "Edit Catalog Product" : "Add Catalog Product"}</DialogTitle></DialogHeader>
              <form onSubmit={handleCatalogSubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label>Product Name</Label>
                  <Input value={catalogForm.product_name} onChange={(e) => setCatalogForm({ ...catalogForm, product_name: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>SKU</Label>
                    <Input value={catalogForm.sku} onChange={(e) => setCatalogForm({ ...catalogForm, sku: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <Input value={catalogForm.category} onChange={(e) => setCatalogForm({ ...catalogForm, category: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Selling Price (NPR)</Label>
                    <Input type="number" value={catalogForm.selling_price} onChange={(e) => setCatalogForm({ ...catalogForm, selling_price: Number(e.target.value) })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tax Rate (%)</Label>
                    <Input type="number" value={catalogForm.tax_rate} onChange={(e) => setCatalogForm({ ...catalogForm, tax_rate: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Description</Label>
                  <Input value={catalogForm.description} onChange={(e) => setCatalogForm({ ...catalogForm, description: e.target.value })} />
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => { setIsCatalogDialogOpen(false); resetCatalogForm(); }}>Cancel</Button>
                  <Button type="submit">{currentCatalogId ? "Update Catalog Product" : "Add Catalog Product"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetInventoryForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Inventory Item
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader><DialogTitle>{currentItemId ? "Edit Inventory Item" : "Add Inventory From Vendor Catalog"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-2">
                  <Label>Linked Vendor</Label>
                  <Select value={formData.linked_vendor_profile_id} onValueChange={handleVendorChange}>
                    <SelectTrigger><SelectValue placeholder="Select a registered vendor" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {vendorList.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.linked_profile_id || vendor.id}>{vendor.vendor_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {vendorList.length === 0 && <p className="text-sm text-muted-foreground">Add a registered vendor in Clients & Vendors first.</p>}
                </div>
                <div className="grid gap-2">
                  <Label>Vendor Product</Label>
                  <Select value={formData.vendor_product_id} onValueChange={handleProductChange} disabled={!formData.linked_vendor_profile_id || vendorProducts.length === 0}>
                    <SelectTrigger><SelectValue placeholder={isVendorProductsLoading ? "Loading vendor products..." : "Select one of the vendor's products"} /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {vendorProducts.map((product) => (
                        <SelectItem key={product.id} value={product.id}>{product.product_name} ({product.sku})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.linked_vendor_profile_id && !isVendorProductsLoading && vendorProducts.length === 0 && (
                    <p className="text-sm text-muted-foreground">This vendor has not published any catalog products yet.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Selected Product</Label>
                    <Input value={formData.product_name} readOnly />
                  </div>
                  <div className="grid gap-2">
                    <Label>SKU</Label>
                    <Input value={formData.sku} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Category</Label>
                    <Input value={formData.category} readOnly />
                  </div>
                  <div className="grid gap-2">
                    <Label>Tax Rate (%)</Label>
                    <Input value={formData.tax_rate} readOnly />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Stock Quantity</Label>
                    <Input type="number" value={formData.stock_quantity} onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Purchase Price (NPR)</Label>
                    <Input type="number" value={formData.purchase_price} onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Your Selling Price (NPR)</Label>
                    <Input type="number" value={formData.selling_price} onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label>Payment Type</Label>
                    <Select value={formData.payment_type} onValueChange={(value) => setFormData({ ...formData, payment_type: value })}>
                      <SelectTrigger><SelectValue placeholder="Select payment type" /></SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        <SelectItem value="cash">Cash (Paid upfront)</SelectItem>
                        <SelectItem value="credit">Credit (Add to Payables)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetInventoryForm(); }}>Cancel</Button>
                  <Button type="submit">{currentItemId ? "Update Inventory" : "Add Inventory"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>My Product Catalog</CardTitle>
          <CardDescription>These are the products your account publishes for linked buyers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Selling Price</TableHead>
                <TableHead className="text-right">Tax</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {catalogProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Your catalog is empty.</TableCell>
                </TableRow>
              ) : catalogProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.product_name}</TableCell>
                  <TableCell>{product.sku}</TableCell>
                  <TableCell>{product.category || "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(product.selling_price)}</TableCell>
                  <TableCell className="text-right">{product.tax_rate}%</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditCatalogDialog(product)}><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => handleDeleteCatalogProduct(product.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Product Name</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="text-right">Purchase Price</TableHead>
              <TableHead className="text-right">Selling Price</TableHead>
              <TableHead className="text-right">Tax Rate</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">No inventory yet. Choose a linked vendor and one of their catalog products to add stock.</TableCell>
              </TableRow>
            ) : inventory.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium">{item.product_name}</TableCell>
                <TableCell>{item.sku}</TableCell>
                <TableCell>{item.vendor_name || "-"}</TableCell>
                <TableCell className="text-right">{item.stock_quantity}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.purchase_price)}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.selling_price)}</TableCell>
                <TableCell className="text-right">{item.tax_rate}%</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditDialog(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => deleteItem(item.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// ============================================
// BILLING PAGE (truncated due to space - full version in original)
// ============================================
export const Billing = () => {
  const { invoices, isLoading } = useInvoices();
  const { inventory, isLoading: inventoryLoading } = useInventory();
  const [filter, setFilter] = useState("all");
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [clientList, setClientList] = useState<{ id: string; client_name: string }[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_no: `INV-${Date.now().toString().slice(-6)}`,
    client_name: "",
    amount: "",
    tax_amount: "",
    due_date: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    clientsApi.getClientList().then(setClientList).catch(() => { });
  }, []);

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.client_name || !invoiceForm.amount || !invoiceForm.due_date) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const total = parseFloat(invoiceForm.amount) + parseFloat(invoiceForm.tax_amount || "0");
      const res = await fetch("http://localhost:5001/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          invoice_no: invoiceForm.invoice_no,
          client_name: invoiceForm.client_name,
          amount: parseFloat(invoiceForm.amount),
          tax_amount: parseFloat(invoiceForm.tax_amount || "0"),
          total_amount: total,
          due_date: invoiceForm.due_date,
          notes: invoiceForm.notes,
          status: "pending",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      toast.success(`Invoice ${invoiceForm.invoice_no} created! Receivable auto-generated.`);
      setIsInvoiceDialogOpen(false);
      setInvoiceForm({ invoice_no: `INV-${Date.now().toString().slice(-6)}`, client_name: "", amount: "", tax_amount: "", due_date: "", notes: "" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredInvoices = filter === "all"
    ? invoices
    : invoices.filter(inv => inv.status.toLowerCase() === filter);

  if (isLoading || inventoryLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoices &amp; Billing</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
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
          <h1 className="text-3xl font-bold text-foreground">Invoices &amp; Billing</h1>
          <p className="text-muted-foreground mt-1">Generate and manage your invoices</p>
        </div>
        <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
          <DialogTrigger asChild>
            <Button id="generate-invoice-btn" className="gap-2">
              <Plus className="w-4 h-4" />
              Generate Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Generate New Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGenerateInvoice}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="inv-no">Invoice No.</Label>
                    <Input id="inv-no" value={invoiceForm.invoice_no}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, invoice_no: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-due">Due Date</Label>
                    <Input id="inv-due" type="date" value={invoiceForm.due_date}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-client">Client *</Label>
                  <Select value={invoiceForm.client_name}
                    onValueChange={(v) => setInvoiceForm({ ...invoiceForm, client_name: v })}>
                    <SelectTrigger id="inv-client">
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {clientList.map((c) => (
                        <SelectItem key={c.id} value={c.client_name}>{c.client_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="inv-amount">Amount (NPR) *</Label>
                    <Input id="inv-amount" type="number" placeholder="0.00" value={invoiceForm.amount}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="inv-tax">Tax Amount (NPR)</Label>
                    <Input id="inv-tax" type="number" placeholder="0.00" value={invoiceForm.tax_amount}
                      onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_amount: e.target.value })} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="inv-notes">Notes</Label>
                  <Input id="inv-notes" placeholder="Optional notes..." value={invoiceForm.notes}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Invoice"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
        </TabsList>

        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Invoice No.</TableHead>
                <TableHead className="font-semibold">Client</TableHead>
                <TableHead className="font-semibold text-right">Amount</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold">Due Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(invoice.amount)}</TableCell>
                    <TableCell><Badge>{invoice.status}</Badge></TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Tabs>
    </div>
  );
};

// ============================================
// CLIENTS PAGE
// ============================================
export const Clients = () => {
  const { salesClients, purchaseVendors, isLoading, refetch } = useClients();
  const [isClientDialogOpen, setIsClientDialogOpen] = useState(false);
  const [isVendorDialogOpen, setIsVendorDialogOpen] = useState(false);
  const [registeredAccounts, setRegisteredAccounts] = useState<{ id: string; name?: string; email: string; business_name?: string | null }[]>([]);
  const [clientForm, setClientForm] = useState({ linked_profile_id: "" });
  const [vendorForm, setVendorForm] = useState({ linked_profile_id: "" });

  useEffect(() => {
    clientsApi.getRegisteredAccounts()
      .then((accounts) => setRegisteredAccounts(Array.isArray(accounts) ? accounts : accounts.data || []))
      .catch(() => toast.error("Failed to load registered accounts"));
  }, []);

  const availableClientAccounts = registeredAccounts.filter(
    (account) => !salesClients.some((client) => client.linked_profile_id === account.id)
  );

  const availableVendorAccounts = registeredAccounts.filter(
    (account) => !purchaseVendors.some((vendor) => vendor.linked_profile_id === account.id)
  );

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.linked_profile_id) {
      toast.error("Select a registered client account");
      return;
    }
    try {
      await clientsApi.addClient(clientForm);
      const added = registeredAccounts.find((account) => account.id === clientForm.linked_profile_id);
      toast.success(`Client "${added?.business_name || added?.name || added?.email || "account"}" added`);
      setClientForm({ linked_profile_id: "" });
      setIsClientDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to add client");
    }
  };

  const handleAddVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorForm.linked_profile_id) {
      toast.error("Select a registered vendor account");
      return;
    }
    try {
      await clientsApi.addVendor(vendorForm);
      const added = registeredAccounts.find((account) => account.id === vendorForm.linked_profile_id);
      toast.success(`Vendor "${added?.business_name || added?.name || added?.email || "account"}" added`);
      setVendorForm({ linked_profile_id: "" });
      setIsVendorDialogOpen(false);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to add vendor");
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    try {
      await clientsApi.deleteClient(id);
      toast.success(`Client "${name}" removed`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete client");
    }
  };

  const handleDeleteVendor = async (id: string, name: string) => {
    try {
      await clientsApi.deleteVendor(id);
      toast.success(`Vendor "${name}" removed`);
      refetch();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete vendor");
    }
  };

  const totalOutstandingReceivables = salesClients.reduce((sum, c) => sum + (c.outstanding_amount || 0), 0);
  const totalOutstandingPayables = purchaseVendors.reduce((sum, v) => sum + (v.outstanding_amount || 0), 0);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Clients &amp; Vendors</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
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
          <h1 className="text-3xl font-bold text-foreground">Clients &amp; Vendors</h1>
          <p className="text-muted-foreground mt-1">Track your sales clients and purchase vendors</p>
        </div>
        <div className="flex gap-3">
          {/* Add Client Dialog */}
          <Dialog open={isClientDialogOpen} onOpenChange={setIsClientDialogOpen}>
            <DialogTrigger asChild>
              <Button id="add-client-btn" variant="outline" className="gap-2">
                <Plus className="w-4 h-4" /> Add Client
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
              <form onSubmit={handleAddClient}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Registered Client Account *</Label>
                    <Select value={clientForm.linked_profile_id} onValueChange={(value) => setClientForm({ linked_profile_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a registered account" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {availableClientAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.business_name || account.name || account.email} ({account.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableClientAccounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">No unlinked registered accounts available.</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsClientDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add Client</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          {/* Add Vendor Dialog */}
          <Dialog open={isVendorDialogOpen} onOpenChange={setIsVendorDialogOpen}>
            <DialogTrigger asChild>
              <Button id="add-vendor-btn" className="gap-2">
                <Plus className="w-4 h-4" /> Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px]">
              <DialogHeader><DialogTitle>Add New Vendor</DialogTitle></DialogHeader>
              <form onSubmit={handleAddVendor}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label>Registered Vendor Account *</Label>
                    <Select value={vendorForm.linked_profile_id} onValueChange={(value) => setVendorForm({ linked_profile_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a registered account" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {availableVendorAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.business_name || account.name || account.email} ({account.email})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableVendorAccounts.length === 0 && (
                      <p className="text-xs text-muted-foreground">No unlinked registered accounts available.</p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsVendorDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add Vendor</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Sales Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{salesClients.length}</div>
            <p className="text-xs text-muted-foreground">Active clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Receivables</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalOutstandingReceivables)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Purchase Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{purchaseVendors.length}</div>
            <p className="text-xs text-muted-foreground">Active vendors</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Payables</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalOutstandingPayables)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="w-full">
        <TabsList>
          <TabsTrigger value="sales">Sales Clients ({salesClients.length})</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Vendors ({purchaseVendors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="mt-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold text-center">Total Invoices</TableHead>
                  <TableHead className="font-semibold text-right">Total Amount</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No sales clients yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesClients.map((client) => (
                    <TableRow key={client.client_name} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{client.client_name}</TableCell>
                      <TableCell className="text-center">{client.total_invoices}</TableCell>
                      <TableCell className="text-right">{formatCurrency(client.total_amount)}</TableCell>
                      <TableCell className="text-right text-amber-600">{formatCurrency(client.outstanding_amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="purchases" className="mt-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Vendor Name</TableHead>
                  <TableHead className="font-semibold text-center">Total Payables</TableHead>
                  <TableHead className="font-semibold text-right">Total Amount</TableHead>
                  <TableHead className="font-semibold text-right">Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseVendors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No vendors yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseVendors.map((vendor) => (
                    <TableRow key={vendor.vendor_name} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{vendor.vendor_name}</TableCell>
                      <TableCell className="text-center">{vendor.total_payables}</TableCell>
                      <TableCell className="text-right">{formatCurrency(vendor.total_amount)}</TableCell>
                      <TableCell className="text-right text-red-600">{formatCurrency(vendor.outstanding_amount)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================
// RECEIVABLES PAGE
// ============================================
export const Receivables = () => {
  const { receivables, isLoading: receivablesLoading, markAsPaid: markReceivableAsPaid } = useReceivables();
  const { payables, isLoading: payablesLoading, markAsPaid: markPayableAsPaid } = usePayables();

  const totalReceivables = receivables
    .filter(item => item.status !== "Paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const totalPayables = payables
    .filter(item => item.status !== "Paid")
    .reduce((sum, item) => sum + Number(item.amount), 0);

  const isLoading = receivablesLoading || payablesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Receivables & Payables</h1>
          <p className="text-muted-foreground mt-1">Loading data...</p>
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
        <h1 className="text-3xl font-bold text-foreground">Receivables & Payables</h1>
        <p className="text-muted-foreground mt-1">Track outstanding payments and bills</p>
      </div>

      <Tabs defaultValue="receivables" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="receivables">Receivables</TabsTrigger>
          <TabsTrigger value="payables">Payables</TabsTrigger>
        </TabsList>

        <TabsContent value="receivables" className="space-y-4">
          <Card className="p-4 bg-info/10 border-info/20">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Outstanding Receivables</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalReceivables)}</p>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Invoice ID</TableHead>
                  <TableHead className="font-semibold">Client Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receivables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No receivables found.
                    </TableCell>
                  </TableRow>
                ) : (
                  receivables.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{item.invoice_id}</TableCell>
                      <TableCell>{item.client_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>{formatDate(item.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "Overdue" ? "destructive" : "secondary"} className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="payables" className="space-y-4">
          <Card className="p-4 bg-warning/10 border-warning/20">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Outstanding Payables</p>
              <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalPayables)}</p>
            </div>
          </Card>

          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Bill ID</TableHead>
                  <TableHead className="font-semibold">Vendor Name</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payables.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No payables found.
                    </TableCell>
                  </TableRow>
                ) : (
                  payables.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{item.invoice_id}</TableCell>
                      <TableCell>{item.vendor_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>{formatDate(item.due_date)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "Overdue" ? "destructive" : "secondary"} className="capitalize">
                          {item.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================
// REPORTS PAGE
// ============================================
export const Reports = () => {
  const [reportData, setReportData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setIsLoading(true);
    reportsApi.get(year)
      .then(setReportData)
      .catch(() => toast.error("Failed to load reports"))
      .finally(() => setIsLoading(false));
  }, [year]);

  const COLORS = ["#0d9488", "#06b6d4", "#3b82f6", "#8b5cf6", "#f59e0b"];

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

  const s = reportData?.summary || {};
  const monthlyRevenue = reportData?.monthlyRevenue || [];
  const monthlyExpenses = reportData?.monthlyExpenses || [];
  const topClients = reportData?.topClients || [];

  // Merge revenue + expenses by month
  const monthSet = new Set([...monthlyRevenue.map((m: any) => m.month), ...monthlyExpenses.map((m: any) => m.month)]);
  const combinedData = Array.from(monthSet).map(month => ({
    month,
    revenue: monthlyRevenue.find((m: any) => m.month === month)?.revenue || 0,
    expenses: monthlyExpenses.find((m: any) => m.month === month)?.expenses || 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Financial Reports</h1>
          <p className="text-muted-foreground mt-1">Analyze your business performance</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {[2023, 2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="gap-2" onClick={() => toast.success("Report data is live")}>
            <Download className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Net Profit</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{formatCurrency(s.grossProfit || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Revenue</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{formatCurrency(s.totalRevenue || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-red-500/10 to-red-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Expenses</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{formatCurrency(s.totalExpenses || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Receivables</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-amber-600">{formatCurrency(s.totalReceivables || 0)}</p></CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payables</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-blue-600">{formatCurrency(s.totalPayables || 0)}</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses Chart */}
        <Card>
          <CardHeader><CardTitle>Revenue vs Expenses ({year})</CardTitle></CardHeader>
          <CardContent>
            {combinedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={combinedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                  <Legend />
                  <Bar dataKey="revenue" fill="#0d9488" name="Revenue" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#f43f5e" name="Expenses" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                No data for {year} yet.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Clients */}
        <Card>
          <CardHeader><CardTitle>Top 5 Clients by Revenue</CardTitle></CardHeader>
          <CardContent>
            {topClients.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={topClients} dataKey="total" nameKey="client_name"
                    cx="50%" cy="50%" outerRadius={100}
                    label={({ client_name, percent }: any) => `${client_name} ${(percent * 100).toFixed(0)}%`}>
                    {topClients.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-muted-foreground">
                No sales recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Overdue Summary */}
      <Card>
        <CardHeader><CardTitle>Overdue Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-6">
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-sm font-medium text-amber-700">Overdue Receivables</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">{s.overdueReceivables || 0}</p>
            <p className="text-xs text-amber-600 mt-1">invoices past due</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <p className="text-sm font-medium text-red-700">Overdue Payables</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{s.overduePayables || 0}</p>
            <p className="text-xs text-red-600 mt-1">bills past due</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================
// SETTINGS PAGE
// ============================================
export const Settings = () => {
  const { user } = useAuth();
  const { settings, isLoading } = useCompanySettings();
  const { kycStatus, rejectionReason, businessName } = useKYCStatus();

  const [formData, setFormData] = useState({
    companyName: settings.company_name,
    gstNumber: settings.gst_number,
    address: settings.address,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your company information</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            KYC Verification Status
            {kycStatus === 'approved' && <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>}
            {kycStatus === 'pending' && <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" />Pending</Badge>}
            {kycStatus === 'rejected' && <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Rejected</Badge>}
          </CardTitle>
          <CardDescription>Your business verification status</CardDescription>
        </CardHeader>
        <CardContent>
          {businessName && <p className="font-medium">{businessName}</p>}
          {kycStatus === 'rejected' && rejectionReason && (
            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20 text-sm">
              <p className="font-medium">Rejection Reason: {rejectionReason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="company-name">Company Name</Label>
            <Input
              id="company-name"
              value={formData.companyName}
              onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gst">GST/VAT Number</Label>
            <Input
              id="gst"
              value={formData.gstNumber}
              onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="address">Business Address</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
