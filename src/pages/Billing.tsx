import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { useInvoices } from "@/hooks/useInvoices";
import { useInventory } from "@/hooks/useInventory";

interface InvoiceItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

const Billing = () => {
  const { invoices, isLoading, addInvoice, updateStatus, deleteInvoice } = useInvoices();
  const { inventory, isLoading: inventoryLoading } = useInventory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filter, setFilter] = useState("all");

  const [formData, setFormData] = useState({
    client: "",
    dueDate: "",
  });

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [quantity, setQuantity] = useState(1);

  const handleAddItem = () => {
    const product = inventory.find(p => p.id === selectedProduct);
    if (!product) return;

    const existingItem = invoiceItems.find(item => item.productId === selectedProduct);
    if (existingItem) {
      setInvoiceItems(invoiceItems.map(item =>
        item.productId === selectedProduct
          ? { ...item, quantity: item.quantity + quantity, total: (item.quantity + quantity) * item.unitPrice }
          : item
      ));
    } else {
      setInvoiceItems([...invoiceItems, {
        productId: product.id,
        productName: product.product_name,
        quantity,
        unitPrice: product.selling_price,
        total: quantity * product.selling_price,
      }]);
    }
    setSelectedProduct("");
    setQuantity(1);
  };

  const handleRemoveItem = (productId: string) => {
    setInvoiceItems(invoiceItems.filter(item => item.productId !== productId));
  };

  const totalAmount = invoiceItems.reduce((sum, item) => sum + item.total, 0);

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invoiceItems.length === 0) return;

    // For single product invoice, pass the product_id and quantity
    const firstItem = invoiceItems[0];
    
    const success = await addInvoice({
      client_name: formData.client,
      amount: totalAmount,
      due_date: formData.dueDate,
      product_id: invoiceItems.length === 1 ? firstItem.productId : undefined,
      quantity: invoiceItems.length === 1 ? firstItem.quantity : invoiceItems.reduce((sum, item) => sum + item.quantity, 0),
    });
    
    if (success) {
      setIsDialogOpen(false);
      setFormData({ client: "", dueDate: "" });
      setInvoiceItems([]);
    }
  };

  const handleMarkAsPaid = async (id: string) => {
    await updateStatus(id, "Paid");
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this invoice? This will restore inventory stock and remove the receivable.")) {
      await deleteInvoice(id);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      Paid: "default",
      paid: "default",
      Pending: "secondary",
      pending: "secondary",
      Unpaid: "secondary",
      Overdue: "destructive",
      overdue: "destructive",
    };
    return (
      <Badge variant={variants[status] || "secondary"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const filteredInvoices = filter === "all" 
    ? invoices 
    : invoices.filter(inv => inv.status.toLowerCase() === filter);

  const availableProducts = inventory.filter(p => p.stock_quantity > 0);

  if (isLoading || inventoryLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Invoices & Billing</h1>
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
          <h1 className="text-3xl font-bold text-foreground">Invoices & Billing</h1>
          <p className="text-muted-foreground mt-1">Generate and manage your invoices</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Create Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Generate Invoice</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="client-name">Client Name</Label>
                    <Input
                      id="client-name"
                      placeholder="Enter client name"
                      value={formData.client}
                      onChange={(e) => setFormData({ ...formData, client: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="due-date">Due Date</Label>
                    <Input
                      id="due-date"
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Label className="text-base font-semibold">Add Products</Label>
                  <div className="flex gap-2 mt-2">
                    <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select a product" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border z-50">
                        {availableProducts.length === 0 ? (
                          <SelectItem value="no-products" disabled>No products in inventory</SelectItem>
                        ) : (
                          availableProducts.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.product_name} - {formatCurrency(product.selling_price)} (Stock: {product.stock_quantity})
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      max={inventory.find(p => p.id === selectedProduct)?.stock_quantity || 999}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      className="w-20"
                      placeholder="Qty"
                    />
                    <Button type="button" onClick={handleAddItem} disabled={!selectedProduct}>
                      Add
                    </Button>
                  </div>
                </div>

                {invoiceItems.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceItems.map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-center">{item.quantity}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(item.total)}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(item.productId)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={3} className="text-right font-semibold">Total Amount:</TableCell>
                          <TableCell className="text-right font-bold text-lg">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={invoiceItems.length === 0}>Generate Invoice</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={filter} onValueChange={setFilter} className="w-full">
        <TabsList>
          <TabsTrigger value="all">All Invoices</TabsTrigger>
          <TabsTrigger value="paid">Paid</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="overdue">Overdue</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Invoice No.</TableHead>
              <TableHead className="font-semibold">Client</TableHead>
              <TableHead className="font-semibold text-right">Amount</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Due Date</TableHead>
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No invoices found. Create your first invoice to get started.
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                  <TableCell>{invoice.client_name}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(invoice.amount)}</TableCell>
                  <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  <TableCell>{formatDate(invoice.due_date)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button variant="ghost" size="sm" className="gap-2">
                        <FileText className="h-4 w-4" />
                        View
                      </Button>
                      {invoice.status.toLowerCase() !== "paid" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkAsPaid(invoice.id)}
                        >
                          Mark Paid
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(invoice.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Billing;
