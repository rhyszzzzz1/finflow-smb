import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatDate } from "@/utils/format";
import { useInvoices } from "@/hooks/useInvoices";
import { usePurchaseBills } from "@/hooks/usePurchaseBills";
import { inventoryApi, clientsApi } from "@/services/api";

type ClientOption = { id: string; client_name: string };
type VendorOption = { id: string; vendor_name: string };
type ItemOption = { id: string; name: string; sku?: string | null };

export const BillingView = () => {
  const { invoices, isLoading, createDraft, approveInvoice, postInvoice, voidInvoice } = useInvoices();
  const {
    purchaseBills,
    isLoading: purchaseBillsLoading,
    createDraft: createPurchaseBillDraft,
    approveBill,
    postBill,
    voidBill,
  } = usePurchaseBills();

  const [activeTab, setActiveTab] = useState("sales");
  const [filter, setFilter] = useState("all");
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [clientList, setClientList] = useState<ClientOption[]>([]);
  const [vendorList, setVendorList] = useState<VendorOption[]>([]);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    customer_id: "",
    item_id: "",
    amount: "",
    tax_amount: "",
    due_date: "",
    notes: "",
    description: "",
  });
  const [purchaseForm, setPurchaseForm] = useState({
    vendor_id: "",
    item_id: "",
    quantity: "1",
    unit_cost: "",
    tax_amount: "",
    due_date: "",
    notes: "",
  });

  useEffect(() => {
    Promise.all([
      clientsApi.getClientList(),
      clientsApi.getVendorList(),
      inventoryApi.getItems(),
    ])
      .then(([clients, vendors, items]) => {
        setClientList(Array.isArray(clients) ? clients : []);
        setVendorList(Array.isArray(vendors) ? vendors : []);
        const normalizedItems = Array.isArray(items) ? items : items?.data || [];
        setItemOptions(
          normalizedItems.map((item: any) => ({
            id: item.id,
            name: item.name || item.product_name || item.description || "Unnamed Item",
            sku: item.sku || null,
          }))
        );
      })
      .catch(() => toast.error("Failed to load billing master data"));
  }, []);

  const resetInvoiceForm = () =>
    setInvoiceForm({
      customer_id: "",
      item_id: "",
      amount: "",
      tax_amount: "",
      due_date: "",
      notes: "",
      description: "",
    });

  const resetPurchaseForm = () =>
    setPurchaseForm({
      vendor_id: "",
      item_id: "",
      quantity: "1",
      unit_cost: "",
      tax_amount: "",
      due_date: "",
      notes: "",
    });

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.customer_id || !invoiceForm.amount || !invoiceForm.due_date) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);
    try {
      const amount = parseFloat(invoiceForm.amount);
      const taxAmount = parseFloat(invoiceForm.tax_amount || "0");
      const inferredTaxRate = amount > 0 && taxAmount > 0 ? (taxAmount / amount) * 100 : 0;
      const selectedItem = itemOptions.find((item) => item.id === invoiceForm.item_id);

      const created = await createDraft({
        customer_id: invoiceForm.customer_id,
        due_date: invoiceForm.due_date,
        notes: invoiceForm.notes,
        lines: [
          {
            item_id: invoiceForm.item_id || null,
            description: invoiceForm.description || selectedItem?.name || invoiceForm.notes || "Sales invoice line",
            quantity: 1,
            unit_price: amount,
            discount_type: "none",
            discount_value: 0,
            tax_rate: inferredTaxRate,
          },
        ],
      });

      if (created) {
        setIsInvoiceDialogOpen(false);
        resetInvoiceForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGeneratePurchaseBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseForm.vendor_id || !purchaseForm.item_id || !purchaseForm.quantity || !purchaseForm.unit_cost || !purchaseForm.due_date) {
      toast.error("Vendor, item, quantity, unit cost, and due date are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const quantity = parseFloat(purchaseForm.quantity || "0");
      const unitCost = parseFloat(purchaseForm.unit_cost || "0");
      const taxAmount = parseFloat(purchaseForm.tax_amount || "0");
      const taxableBase = quantity * unitCost;
      const inferredTaxRate = taxableBase > 0 && taxAmount > 0 ? (taxAmount / taxableBase) * 100 : 0;
      const selectedItem = itemOptions.find((item) => item.id === purchaseForm.item_id);

      const created = await createPurchaseBillDraft({
        vendor_id: purchaseForm.vendor_id,
        due_date: purchaseForm.due_date,
        notes: purchaseForm.notes,
        lines: [
          {
            item_id: purchaseForm.item_id,
            description: selectedItem?.name || purchaseForm.notes || "Inventory purchase line",
            quantity,
            unit_cost: unitCost,
            discount_type: "none",
            discount_value: 0,
            tax_rate: inferredTaxRate,
          },
        ],
      });

      if (created) {
        setIsPurchaseDialogOpen(false);
        resetPurchaseForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredInvoices = filter === "all"
    ? invoices
    : invoices.filter((invoice) => [invoice.base_status, invoice.status].map((value) => String(value).toLowerCase()).includes(filter));

  const filteredPurchaseBills = filter === "all"
    ? purchaseBills
    : purchaseBills.filter((bill) => String(bill.status || "").toLowerCase() === filter);

  if (isLoading || purchaseBillsLoading) {
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
          <p className="text-muted-foreground mt-1">Manage customer invoices and purchase bills from the accounting document workflow.</p>
        </div>
        <div className="flex items-center gap-3">
          <Dialog open={isInvoiceDialogOpen} onOpenChange={setIsInvoiceDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Plus className="w-4 h-4" />
                Generate Invoice
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Generate New Invoice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGenerateInvoice}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Invoice No.</Label>
                      <Input value="Assigned by system on draft creation" disabled />
                    </div>
                    <div className="grid gap-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={invoiceForm.due_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, due_date: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Client *</Label>
                    <Select value={invoiceForm.customer_id} onValueChange={(value) => setInvoiceForm({ ...invoiceForm, customer_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {clientList.map((client) => (
                          <SelectItem key={client.id} value={client.id}>{client.client_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Inventory Item</Label>
                    <Select value={invoiceForm.item_id} onValueChange={(value) => setInvoiceForm({ ...invoiceForm, item_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Optional stock item for sale issue/COGS" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {itemOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Line Description</Label>
                    <Input value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} placeholder="Invoice line description" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Amount (NPR) *</Label>
                      <Input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Tax Amount (NPR)</Label>
                      <Input type="number" value={invoiceForm.tax_amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, tax_amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <Input value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} placeholder="Optional notes..." />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsInvoiceDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Invoice"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={isPurchaseDialogOpen} onOpenChange={setIsPurchaseDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Record Purchase Bill
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px]">
              <DialogHeader>
                <DialogTitle>Create Purchase Bill</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleGeneratePurchaseBill}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label>Bill No.</Label>
                      <Input value="Assigned by system on draft creation" disabled />
                    </div>
                    <div className="grid gap-2">
                      <Label>Due Date</Label>
                      <Input type="date" value={purchaseForm.due_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, due_date: e.target.value })} required />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Vendor *</Label>
                    <Select value={purchaseForm.vendor_id} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, vendor_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a linked vendor" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {vendorList.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>{vendor.vendor_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Inventory Item *</Label>
                    <Select value={purchaseForm.item_id} onValueChange={(value) => setPurchaseForm({ ...purchaseForm, item_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an item master record" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {itemOptions.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{item.name}{item.sku ? ` (${item.sku})` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="grid gap-2">
                      <Label>Quantity *</Label>
                      <Input type="number" min="0" step="0.01" value={purchaseForm.quantity} onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Unit Cost *</Label>
                      <Input type="number" min="0" step="0.01" value={purchaseForm.unit_cost} onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: e.target.value })} required />
                    </div>
                    <div className="grid gap-2">
                      <Label>Tax Amount</Label>
                      <Input type="number" min="0" step="0.01" value={purchaseForm.tax_amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, tax_amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Notes</Label>
                    <Input value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} placeholder="Optional notes..." />
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsPurchaseDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating..." : "Create Bill"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Posted Sales</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(invoices.filter((invoice) => ["posted", "paid", "partially_paid", "overdue"].includes(invoice.base_status)).reduce((sum, invoice) => sum + invoice.total_amount, 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Posted Purchases</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCurrency(purchaseBills.filter((bill) => ["posted", "paid", "partially_paid", "overdue"].includes(String(bill.status || "").toLowerCase())).reduce((sum, bill) => sum + bill.total_amount, 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-500/5">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Item Masters Available</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{itemOptions.length}</p></CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="posted">Posted</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="sales">Sales Invoices</TabsTrigger>
          <TabsTrigger value="purchases">Purchase Bills</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Invoice No.</TableHead>
                  <TableHead className="font-semibold">Client</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No invoices found.</TableCell>
                  </TableRow>
                ) : (
                  filteredInvoices.map((invoice) => (
                    <TableRow key={invoice.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{invoice.invoice_no}</TableCell>
                      <TableCell>{invoice.customer_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(invoice.total_amount)}</TableCell>
                      <TableCell><Badge>{invoice.status}</Badge></TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {invoice.base_status === "draft" && <Button size="sm" variant="outline" onClick={() => approveInvoice(invoice.id)}>Approve</Button>}
                          {invoice.base_status === "approved" && <Button size="sm" onClick={() => postInvoice(invoice.id)}>Post</Button>}
                          {!["void", "posted", "paid", "partially_paid", "overdue"].includes(invoice.base_status) && (
                            <Button size="sm" variant="ghost" onClick={() => voidInvoice(invoice.id)}>Void</Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="purchases" className="space-y-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Bill No.</TableHead>
                  <TableHead className="font-semibold">Vendor</TableHead>
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchaseBills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No purchase bills found.</TableCell>
                  </TableRow>
                ) : (
                  filteredPurchaseBills.map((bill) => (
                    <TableRow key={bill.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{bill.bill_no}</TableCell>
                      <TableCell>{bill.vendor_name}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(bill.total_amount)}</TableCell>
                      <TableCell><Badge>{bill.status}</Badge></TableCell>
                      <TableCell>{formatDate(bill.due_date)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {String(bill.status || "").toLowerCase() === "draft" && <Button size="sm" variant="outline" onClick={() => approveBill(bill.id)}>Approve</Button>}
                          {String(bill.status || "").toLowerCase() === "approved" && <Button size="sm" onClick={() => postBill(bill.id)}>Post</Button>}
                          {!["void", "posted", "paid", "partially_paid", "overdue"].includes(String(bill.status || "").toLowerCase()) && (
                            <Button size="sm" variant="ghost" onClick={() => voidBill(bill.id)}>Void</Button>
                          )}
                        </div>
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
