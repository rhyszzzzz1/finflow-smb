import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Upload } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import { useInventory } from "@/hooks/useInventory";
import { BulkUploadDialog } from "@/components/Inventory/BulkUploadDialog";

const Inventory = () => {
  const { inventory, isLoading, addItem, updateItem, deleteItem, refetch } = useInventory();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    product_name: "",
    sku: "",
    stock_quantity: 0,
    purchase_price: 0,
    selling_price: 0,
    tax_rate: 18,
    category: "",
    payment_type: "cash",
    vendor_name: "",
  });

  const resetForm = () => {
    setFormData({
      product_name: "",
      sku: "",
      stock_quantity: 0,
      purchase_price: 0,
      selling_price: 0,
      tax_rate: 18,
      category: "",
      payment_type: "cash",
      vendor_name: "",
    });
    setCurrentItemId(null);
    setIsEditing(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let success;
    if (isEditing && currentItemId) {
      success = await updateItem(currentItemId, formData);
    } else {
      success = await addItem(formData);
    }

    if (success) {
      setIsDialogOpen(false);
      resetForm();
    }
  };

  const openEditDialog = (item: typeof inventory[0]) => {
    setCurrentItemId(item.id);
    setFormData({
      product_name: item.product_name,
      sku: item.sku,
      stock_quantity: item.stock_quantity,
      purchase_price: item.purchase_price,
      selling_price: item.selling_price,
      tax_rate: item.tax_rate,
      category: item.category || "",
      payment_type: item.payment_type || "cash",
      vendor_name: item.vendor_name || "",
    });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await deleteItem(id);
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
          <p className="text-muted-foreground mt-1">Track and manage your product inventory</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={() => setIsBulkUploadOpen(true)}>
            <Upload className="w-4 h-4" />
            Bulk Upload
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Add Product
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit Product" : "Add New Product"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="product-name">Product Name</Label>
                    <Input
                      id="product-name"
                      placeholder="Enter product name"
                      value={formData.product_name}
                      onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="sku">SKU</Label>
                      <Input
                        id="sku"
                        placeholder="e.g., PRD-001"
                        value={formData.sku}
                        onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="stock">Stock Quantity</Label>
                      <Input
                        id="stock"
                        type="number"
                        placeholder="0"
                        value={formData.stock_quantity}
                        onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="purchase">Purchase Price (NPR)</Label>
                      <Input
                        id="purchase"
                        type="number"
                        placeholder="0.00"
                        value={formData.purchase_price}
                        onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="selling">Selling Price (NPR)</Label>
                      <Input
                        id="selling"
                        type="number"
                        placeholder="0.00"
                        value={formData.selling_price}
                        onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="tax">Tax Rate (%)</Label>
                      <Input
                        id="tax"
                        type="number"
                        placeholder="18"
                        value={formData.tax_rate}
                        onChange={(e) => setFormData({ ...formData, tax_rate: Number(e.target.value) })}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="category">Category</Label>
                      <Input
                        id="category"
                        placeholder="e.g., Electronics"
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="vendor-name">Vendor Name</Label>
                    <Input
                      id="vendor-name"
                      placeholder="e.g., ABC Supplies"
                      value={formData.vendor_name}
                      onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                    />
                  </div>
                  {!isEditing && (
                    <div className="grid gap-2">
                      <Label htmlFor="payment-type">Payment Type</Label>
                      <Select
                        value={formData.payment_type}
                        onValueChange={(value) => setFormData({ ...formData, payment_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select payment type" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                          <SelectItem value="cash">Cash (Paid upfront)</SelectItem>
                          <SelectItem value="credit">Credit (Add to Payables)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>
                    Cancel
                  </Button>
                  <Button type="submit">{isEditing ? "Update Product" : "Add Product"}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Product Name</TableHead>
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold">Vendor</TableHead>
              <TableHead className="font-semibold text-right">Stock</TableHead>
              <TableHead className="font-semibold text-right">Purchase Price</TableHead>
              <TableHead className="font-semibold text-right">Selling Price</TableHead>
              <TableHead className="font-semibold text-right">Tax Rate</TableHead>
              <TableHead className="font-semibold text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inventory.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No products yet. Add your first product to get started.
                </TableCell>
              </TableRow>
            ) : (
              inventory.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium">{item.product_name}</TableCell>
                  <TableCell className="text-muted-foreground">{item.sku}</TableCell>
                  <TableCell className="text-muted-foreground">{item.vendor_name || "-"}</TableCell>
                  <TableCell className="text-right">{item.stock_quantity}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.purchase_price)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(item.selling_price)}</TableCell>
                  <TableCell className="text-right">{item.tax_rate}%</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={() => openEditDialog(item)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(item.id)}
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

      <BulkUploadDialog
        open={isBulkUploadOpen}
        onOpenChange={setIsBulkUploadOpen}
        onSuccess={refetch}
        existingSkus={inventory.map(item => item.sku)}
      />
    </div>
  );
};

export default Inventory;
