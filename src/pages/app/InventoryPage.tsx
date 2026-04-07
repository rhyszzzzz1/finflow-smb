import { useEffect, useMemo, useState } from "react";
import { Link2, Package2, RefreshCcw, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inventoryApi } from "@/services/api";
import { useInventory } from "@/hooks/useInventory";
import { useMasterData } from "@/hooks/useMasterData";
import { formatCurrency } from "@/utils/format";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { toast } from "sonner";

type Props = {
  initialTab?: string;
};

export const InventoryPage = ({ initialTab = "items" }: Props) => {
  const {
    inventory,
    items,
    warehouses,
    stockBalances,
    isLoading,
    createItem,
    createWarehouse,
    createStockAdjustment,
    createStockTransfer,
    addItemVendorLink,
    markPreferredVendor,
  } = useInventory();
  const { vendorOptions } = useMasterData();
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemVendorLinks, setItemVendorLinks] = useState<any[]>([]);
  const [isLinksLoading, setIsLinksLoading] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", sku: "", item_type: "inventory" });
  const [warehouseForm, setWarehouseForm] = useState({ name: "", code: "" });
  const [adjustmentForm, setAdjustmentForm] = useState({ item_id: "", warehouse_id: "", quantity_delta: "0", unit_cost: "0", notes: "" });
  const [transferForm, setTransferForm] = useState({ item_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "0", notes: "" });
  const [vendorLinkForm, setVendorLinkForm] = useState({ vendor_id: "", vendor_product_id: "", vendor_sku: "", last_purchase_price: "", lead_time_days: "" });

  const itemOptions = useMemo(() => items.map((item) => ({ value: item.id, label: item.sku ? `${item.name} (${item.sku})` : item.name })), [items]);
  const warehouseOptions = useMemo(() => warehouses.map((warehouse) => ({ value: warehouse.id, label: warehouse.code ? `${warehouse.name} (${warehouse.code})` : warehouse.name })), [warehouses]);

  useEffect(() => {
    if (!selectedItemId && items[0]?.id) {
      setSelectedItemId(items[0].id);
    }
  }, [items, selectedItemId]);

  useEffect(() => {
    const loadLinks = async () => {
      if (!selectedItemId) {
        setItemVendorLinks([]);
        return;
      }
      setIsLinksLoading(true);
      try {
        const rows = await inventoryApi.listItemVendorLinks(selectedItemId);
        setItemVendorLinks(Array.isArray(rows) ? rows : rows?.data || []);
      } catch (error: any) {
        toast.error(error.message || "Failed to load item-vendor links");
        setItemVendorLinks([]);
      } finally {
        setIsLinksLoading(false);
      }
    };

    loadLinks();
  }, [selectedItemId]);

  if (isLoading) {
    return <LoadingState title="Inventory" message="Loading item master, warehouses, and stock balances..." />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Inventory</h1>
        <p className="text-muted-foreground mt-1">
          Work from the authoritative item, warehouse, and stock movement model. The compatibility inventory list remains available for legacy flows.
        </p>
      </div>

      <Tabs defaultValue={initialTab} className="space-y-6">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="warehouses">Warehouses</TabsTrigger>
          <TabsTrigger value="balances">Stock Balances</TabsTrigger>
          <TabsTrigger value="movements">Adjustments & Transfers</TabsTrigger>
          <TabsTrigger value="vendors">Item-Vendor Links</TabsTrigger>
          <TabsTrigger value="compatibility">Compatibility Inventory</TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Create Internal Item Master</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>SKU</Label>
                <Input value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Item Type</Label>
                <Select value={itemForm.item_type} onValueChange={(value) => setItemForm((current) => ({ ...current, item_type: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover border border-border">
                    <SelectItem value="inventory">Inventory</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="non_inventory">Non Inventory</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={async () => {
                  const success = await createItem(itemForm);
                  if (success) setItemForm({ name: "", sku: "", item_type: "inventory" });
                }}>
                  Create Item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Item Master</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow><TableCell colSpan={3}><EmptyState title="No items yet" description="Create internal items without implying stock on hand." /></TableCell></TableRow>
                  ) : items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.sku || "-"}</TableCell>
                      <TableCell className="capitalize">{item.item_type || "inventory"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Create Warehouse</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={warehouseForm.name} onChange={(event) => setWarehouseForm((current) => ({ ...current, name: event.target.value }))} />
              </div>
              <div className="grid gap-2">
                <Label>Code</Label>
                <Input value={warehouseForm.code} onChange={(event) => setWarehouseForm((current) => ({ ...current, code: event.target.value }))} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={async () => {
                  const success = await createWarehouse(warehouseForm);
                  if (success) setWarehouseForm({ name: "", code: "" });
                }}>
                  Add Warehouse
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Warehouses</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Code</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.length === 0 ? (
                    <TableRow><TableCell colSpan={2}><EmptyState title="No warehouses yet" description="Warehouse setup stays separate from item creation and stock quantity." /></TableCell></TableRow>
                  ) : warehouses.map((warehouse) => (
                    <TableRow key={warehouse.id}>
                      <TableCell className="font-medium">{warehouse.name}</TableCell>
                      <TableCell>{warehouse.code || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardHeader><CardTitle>Stock Balances</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">Quantity On Hand</TableHead>
                    <TableHead className="text-right">On Hand Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockBalances.length === 0 ? (
                    <TableRow><TableCell colSpan={4}><EmptyState title="No stock balances yet" description="Post goods receipts, adjustments, or transfers to generate authoritative balances." /></TableCell></TableRow>
                  ) : stockBalances.map((balance) => (
                    <TableRow key={`${balance.item_id}-${balance.warehouse_id || "all"}`}>
                      <TableCell className="font-medium">{balance.item_name}</TableCell>
                      <TableCell>{balance.warehouse_name || "All Warehouses"}</TableCell>
                      <TableCell className="text-right">{Number(balance.quantity_on_hand || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(balance.on_hand_value || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><RefreshCcw className="w-4 h-4" />Stock Adjustment</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Item</Label>
                  <Select value={adjustmentForm.item_id} onValueChange={(value) => setAdjustmentForm((current) => ({ ...current, item_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {itemOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Warehouse</Label>
                  <Select value={adjustmentForm.warehouse_id} onValueChange={(value) => setAdjustmentForm((current) => ({ ...current, warehouse_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {warehouseOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>Quantity Delta</Label>
                    <Input type="number" value={adjustmentForm.quantity_delta} onChange={(event) => setAdjustmentForm((current) => ({ ...current, quantity_delta: event.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <Label>Unit Cost</Label>
                    <Input type="number" value={adjustmentForm.unit_cost} onChange={(event) => setAdjustmentForm((current) => ({ ...current, unit_cost: event.target.value }))} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Input value={adjustmentForm.notes} onChange={(event) => setAdjustmentForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
                <Button className="w-full" onClick={async () => {
                  const success = await createStockAdjustment({
                    item_id: adjustmentForm.item_id,
                    warehouse_id: adjustmentForm.warehouse_id,
                    quantity_delta: Number(adjustmentForm.quantity_delta || 0),
                    unit_cost: Number(adjustmentForm.unit_cost || 0),
                    notes: adjustmentForm.notes || null,
                  });
                  if (success) setAdjustmentForm({ item_id: "", warehouse_id: "", quantity_delta: "0", unit_cost: "0", notes: "" });
                }}>
                  Record Adjustment
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Shuffle className="w-4 h-4" />Stock Transfer</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>Item</Label>
                  <Select value={transferForm.item_id} onValueChange={(value) => setTransferForm((current) => ({ ...current, item_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {itemOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>From Warehouse</Label>
                    <Select value={transferForm.from_warehouse_id} onValueChange={(value) => setTransferForm((current) => ({ ...current, from_warehouse_id: value }))}>
                      <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {warehouseOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>To Warehouse</Label>
                    <Select value={transferForm.to_warehouse_id} onValueChange={(value) => setTransferForm((current) => ({ ...current, to_warehouse_id: value }))}>
                      <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
                      <SelectContent className="bg-popover border border-border">
                        {warehouseOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Quantity</Label>
                  <Input type="number" value={transferForm.quantity} onChange={(event) => setTransferForm((current) => ({ ...current, quantity: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Notes</Label>
                  <Input value={transferForm.notes} onChange={(event) => setTransferForm((current) => ({ ...current, notes: event.target.value }))} />
                </div>
                <Button className="w-full" onClick={async () => {
                  const success = await createStockTransfer({
                    item_id: transferForm.item_id,
                    from_warehouse_id: transferForm.from_warehouse_id,
                    to_warehouse_id: transferForm.to_warehouse_id,
                    quantity: Number(transferForm.quantity || 0),
                    notes: transferForm.notes || null,
                  });
                  if (success) setTransferForm({ item_id: "", from_warehouse_id: "", to_warehouse_id: "", quantity: "0", notes: "" });
                }}>
                  Record Transfer
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" />Item-Vendor Links</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Selected Item</Label>
                  <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                    <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {itemOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  One internal item can link to multiple vendors. Preferred supplier selection stays separate from stock balances.
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-5">
                <div className="grid gap-2">
                  <Label>Vendor</Label>
                  <Select value={vendorLinkForm.vendor_id} onValueChange={(value) => setVendorLinkForm((current) => ({ ...current, vendor_id: value }))}>
                    <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {vendorOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Vendor Product ID</Label>
                  <Input value={vendorLinkForm.vendor_product_id} onChange={(event) => setVendorLinkForm((current) => ({ ...current, vendor_product_id: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Vendor SKU</Label>
                  <Input value={vendorLinkForm.vendor_sku} onChange={(event) => setVendorLinkForm((current) => ({ ...current, vendor_sku: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Last Purchase Price</Label>
                  <Input type="number" value={vendorLinkForm.last_purchase_price} onChange={(event) => setVendorLinkForm((current) => ({ ...current, last_purchase_price: event.target.value }))} />
                </div>
                <div className="grid gap-2">
                  <Label>Lead Time (days)</Label>
                  <Input type="number" value={vendorLinkForm.lead_time_days} onChange={(event) => setVendorLinkForm((current) => ({ ...current, lead_time_days: event.target.value }))} />
                </div>
              </div>

              <Button onClick={async () => {
                if (!selectedItemId) {
                  toast.error("Select an item first");
                  return;
                }
                const success = await addItemVendorLink(selectedItemId, {
                  vendor_id: vendorLinkForm.vendor_id,
                  vendor_product_id: vendorLinkForm.vendor_product_id || null,
                  vendor_sku: vendorLinkForm.vendor_sku || null,
                  last_purchase_price: vendorLinkForm.last_purchase_price ? Number(vendorLinkForm.last_purchase_price) : null,
                  lead_time_days: vendorLinkForm.lead_time_days ? Number(vendorLinkForm.lead_time_days) : null,
                });
                if (success) {
                  setVendorLinkForm({ vendor_id: "", vendor_product_id: "", vendor_sku: "", last_purchase_price: "", lead_time_days: "" });
                  const rows = await inventoryApi.listItemVendorLinks(selectedItemId);
                  setItemVendorLinks(Array.isArray(rows) ? rows : rows?.data || []);
                }
              }}>
                Link Vendor to Item
              </Button>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Vendor SKU</TableHead>
                    <TableHead>Last Price</TableHead>
                    <TableHead>Lead Time</TableHead>
                    <TableHead className="text-right">Preferred</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLinksLoading ? (
                    <TableRow><TableCell colSpan={5}>Loading vendor links...</TableCell></TableRow>
                  ) : itemVendorLinks.length === 0 ? (
                    <TableRow><TableCell colSpan={5}><EmptyState title="No vendor links yet" description="Link suppliers to internal items instead of copying vendor products into the item master." /></TableCell></TableRow>
                  ) : itemVendorLinks.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-medium">{link.vendor_name || link.vendor_id}</TableCell>
                      <TableCell>{link.vendor_sku || "-"}</TableCell>
                      <TableCell>{formatCurrency(link.last_purchase_price || 0)}</TableCell>
                      <TableCell>{link.lead_time_days ?? "-"}</TableCell>
                      <TableCell className="text-right">
                        {link.preferred_flag ? "Preferred" : <Button size="sm" variant="outline" onClick={() => markPreferredVendor(selectedItemId, link.id)}>Mark Preferred</Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compatibility">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Package2 className="w-4 h-4" />Compatibility Inventory View</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Transitional view only. This list comes from the legacy compatibility inventory surface and should not be treated as the authoritative stock source.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Compatibility Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventory.length === 0 ? (
                    <TableRow><TableCell colSpan={4}><EmptyState title="No compatibility inventory rows" description="The modern stock ledger is active even when this list is empty." /></TableCell></TableRow>
                  ) : inventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product_name}</TableCell>
                      <TableCell>{item.sku}</TableCell>
                      <TableCell>{item.vendor_name || "-"}</TableCell>
                      <TableCell className="text-right">{item.stock_quantity}</TableCell>
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
