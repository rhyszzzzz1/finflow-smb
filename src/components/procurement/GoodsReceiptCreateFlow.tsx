import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SELECT_VALUE_ALL } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { formatCurrency } from "@/utils/format";
import { purchaseOrderApi } from "@/services/api";
import { DocumentEditor } from "@/components/accounting/document-editor/DocumentEditor";
import type { DocumentEditorState, DocumentTypeConfig, EditableLine, SelectOption } from "@/components/accounting/document-editor/documentTypes";
import { calcDocumentTotals } from "@/components/accounting/document-editor/documentMath";
import { today } from "@/pages/app/documentPageUtils";

type Mode = "pick" | "po" | "direct";

type Props = {
  config: DocumentTypeConfig;
  vendorOptions: SelectOption[];
  itemOptions: SelectOption[];
  purchaseOrderOptions: SelectOption[];
  onCancel: () => void;
  onCreate: (state: DocumentEditorState) => Promise<void>;
};

type POLine = {
  id: string;
  item_id: string | null;
  description: string;
  ordered_quantity: number;
  received_quantity: number;
  outstanding_receive_quantity: number;
  unit_cost: number;
  line_no?: number;
};

const toNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function GoodsReceiptCreateFlow({ config, vendorOptions, itemOptions, purchaseOrderOptions, onCancel, onCreate }: Props) {
  const [mode, setMode] = useState<Mode>("pick");

  const [vendorId, setVendorId] = useState<string>("");
  const [poId, setPoId] = useState<string>("");
  const [po, setPo] = useState<any>(null);
  const [isPoLoading, setIsPoLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [unitCost, setUnitCost] = useState<Record<string, number>>({});

  const eligiblePOOptions = useMemo(() => {
    if (!vendorId) return purchaseOrderOptions;
    return purchaseOrderOptions.filter((opt) => String(opt.meta?.vendor_id || "") === vendorId);
  }, [purchaseOrderOptions, vendorId]);

  useEffect(() => {
    if (!poId) {
      setPo(null);
      setSelected({});
      setReceiveQty({});
      setUnitCost({});
      return;
    }
    const run = async () => {
      setIsPoLoading(true);
      try {
        const full = await purchaseOrderApi.getById(poId);
        setPo(full);
        const lines = Array.isArray(full?.lines) ? full.lines : [];
        const initSelected: Record<string, boolean> = {};
        const initQty: Record<string, number> = {};
        const initCost: Record<string, number> = {};
        for (const l of lines) {
          const remaining = toNumber(l.outstanding_receive_quantity ?? (toNumber(l.ordered_quantity) - toNumber(l.received_quantity)));
          if (remaining > 0) {
            initSelected[String(l.id)] = true;
            initQty[String(l.id)] = remaining;
          }
          initCost[String(l.id)] = toNumber(l.unit_cost);
        }
        setSelected(initSelected);
        setReceiveQty(initQty);
        setUnitCost(initCost);
      } finally {
        setIsPoLoading(false);
      }
    };
    run();
  }, [poId]);

  const poLines: POLine[] = useMemo(() => {
    const lines = Array.isArray(po?.lines) ? po.lines : [];
    return lines.map((l: any) => ({
      id: String(l.id),
      item_id: l.item_id ? String(l.item_id) : null,
      description: String(l.description || ""),
      ordered_quantity: toNumber(l.ordered_quantity),
      received_quantity: toNumber(l.received_quantity),
      outstanding_receive_quantity: toNumber(l.outstanding_receive_quantity ?? (toNumber(l.ordered_quantity) - toNumber(l.received_quantity))),
      unit_cost: toNumber(l.unit_cost),
      line_no: l.line_no,
    }));
  }, [po]);

  const receiptLinesFromPO: EditableLine[] = useMemo(() => {
    const lines: EditableLine[] = [];
    for (const l of poLines) {
      if (!selected[l.id]) continue;
      const remaining = l.outstanding_receive_quantity;
      const qty = Math.max(0, Math.min(toNumber(receiveQty[l.id] ?? 0), remaining || l.ordered_quantity));
      if (qty <= 0) continue;
      const cost = Math.max(0, toNumber(unitCost[l.id] ?? l.unit_cost));
      lines.push({
        item_id: l.item_id,
        description: l.description,
        quantity: qty,
        received_quantity: qty,
        unit_cost: cost,
        // Backend supports this reference.
        ...( { purchase_order_line_id: l.id, ordered_quantity_snapshot: l.ordered_quantity } as any ),
      });
    }
    return lines;
  }, [poLines, selected, receiveQty, unitCost]);

  const totals = useMemo(() => calcDocumentTotals(receiptLinesFromPO), [receiptLinesFromPO]);

  const directInitialState: DocumentEditorState = useMemo(
    () => ({
      header: { vendor_id: "", purchase_order_id: "", receipt_date: today(), notes: "" },
      lines: [],
    }),
    []
  );

  if (mode === "pick") {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Receive against Purchase Order <Badge variant="outline">PO-based</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Primary receiving workflow. Select a purchase order, see open quantities per line, and record a <strong>partial</strong> or <strong>full</strong> receipt.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Ordered vs received-to-date vs remaining per line</li>
              <li>Enter “this receipt qty” per line</li>
              <li>Creates a multi-line GRN linked to PO lines</li>
            </ul>
            <Button className="w-full" onClick={() => setMode("po")}>
              Start PO receiving
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Direct receipt (no PO) <Badge variant="outline">Secondary</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Use this only when you need to receive inventory without a purchase order reference.</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Manual item + qty + unit cost entry</li>
              <li>Still posts inventory/GRNI on posting (accounting impact)</li>
            </ul>
            <Button variant="outline" className="w-full" onClick={() => setMode("direct")}>
              Start direct receipt
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Button variant="ghost" onClick={onCancel}>
            Back to list
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "po") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">New Goods Receipt</h2>
            <div className="text-sm text-muted-foreground">
              <Badge variant="outline" className="mr-2">PO-based</Badge>
              Receive against purchase order lines (partial receiving supported).
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMode("pick")}>Change entry path</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Select PO to receive</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <div className="text-sm font-medium">Vendor (optional filter)</div>
              <Select
                value={vendorId || SELECT_VALUE_ALL}
                onValueChange={(v) => {
                  setVendorId(v === SELECT_VALUE_ALL ? "" : v);
                  setPoId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by vendor" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value={SELECT_VALUE_ALL}>All vendors</SelectItem>
                  {vendorOptions
                    .filter((opt) => opt.value !== "")
                    .map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium">Purchase order</div>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select purchase order" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  {eligiblePOOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Tip: Prefer orders with remaining open quantities.</p>
            </div>
          </CardContent>
        </Card>

        {!poId ? (
          <EmptyState title="Select a purchase order" description="Choose the PO you want to receive against to load open quantities." />
        ) : isPoLoading ? (
          <LoadingState title="Purchase order" message="Loading PO lines..." />
        ) : (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Open PO lines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                PO: <span className="font-medium text-foreground">{po?.order_no || po?.po_number || poId}</span>{" "}
                · Vendor: <span className="font-medium text-foreground">{po?.vendor_name || "-"}</span>
              </div>

              {poLines.length === 0 ? (
                <EmptyState title="No PO lines found" description="This purchase order has no lines to receive." />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[52px]" />
                        <TableHead>Item</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Ordered</TableHead>
                        <TableHead className="text-right">Received to date</TableHead>
                        <TableHead className="text-right">Open</TableHead>
                        <TableHead className="text-right">This receipt qty</TableHead>
                        <TableHead className="text-right">Unit cost</TableHead>
                        <TableHead className="text-right">Line total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poLines.map((l) => {
                        const open = l.outstanding_receive_quantity;
                        const isChecked = Boolean(selected[l.id]);
                        const qty = toNumber(receiveQty[l.id] ?? 0);
                        const cost = toNumber(unitCost[l.id] ?? l.unit_cost);
                        const lineTotal = Math.max(0, Math.min(qty, open)) * Math.max(0, cost);
                        return (
                          <TableRow key={l.id} className={open <= 0 ? "opacity-60" : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(v) => setSelected((cur) => ({ ...cur, [l.id]: Boolean(v) }))}
                                disabled={open <= 0}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {l.item_id ? (itemOptions.find((o) => o.value === l.item_id)?.label || l.item_id) : "-"}
                            </TableCell>
                            <TableCell className="max-w-[360px] whitespace-pre-wrap">{l.description}</TableCell>
                            <TableCell className="text-right">{l.ordered_quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{l.received_quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{open.toFixed(2)}</TableCell>
                            <TableCell className="text-right w-[160px]">
                              <Input
                                type="number"
                                step="0.01"
                                value={String(qty)}
                                onChange={(e) => setReceiveQty((cur) => ({ ...cur, [l.id]: toNumber(e.target.value) }))}
                                disabled={!isChecked || open <= 0}
                              />
                            </TableCell>
                            <TableCell className="text-right w-[160px]">
                              <Input
                                type="number"
                                step="0.01"
                                value={String(cost)}
                                onChange={(e) => setUnitCost((cur) => ({ ...cur, [l.id]: toNumber(e.target.value) }))}
                                disabled={!isChecked || open <= 0}
                              />
                            </TableCell>
                            <TableCell className="text-right font-semibold">{formatCurrency(lineTotal)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  Posting a GRN will debit <strong>Inventory</strong> and credit <strong>GRNI</strong> (receipt-based procurement accounting).
                </div>
                <div className="text-sm font-semibold">Total (selected): {formatCurrency(totals.total)}</div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMode("pick")}>Back</Button>
                <Button
                  onClick={async () => {
                    if (!po) return;
                    if (receiptLinesFromPO.length === 0) return;
                    const header = {
                      vendor_id: po.vendor_id || po.counterparty_id || "",
                      purchase_order_id: po.id,
                      receipt_date: today(),
                      notes: "",
                    };
                    await onCreate({ header, lines: receiptLinesFromPO });
                  }}
                  disabled={!po || receiptLinesFromPO.length === 0}
                >
                  Create draft receipt
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Direct receipt editor (secondary)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">New Goods Receipt</h2>
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2">Direct receipt</Badge>
            No purchase order reference.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("pick")}>Change entry path</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      <DocumentEditor
        title="Direct goods receipt"
        config={config}
        mode="create"
        counterpartyOptions={vendorOptions}
        itemOptions={itemOptions}
        references={{ sourcePurchaseOrderOptions: purchaseOrderOptions }}
        initialState={directInitialState}
        onCancel={() => setMode("pick")}
        onSave={async (state) => {
          const header = { ...state.header, purchase_order_id: "" };
          await onCreate({ header, lines: state.lines });
        }}
        saveLabel="Create draft (direct)"
      />
    </div>
  );
}

