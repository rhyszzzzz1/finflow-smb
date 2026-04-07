import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { formatCurrency } from "@/utils/format";
import { goodsReceiptApi } from "@/services/api";
import { DocumentEditor } from "@/components/accounting/document-editor/DocumentEditor";
import type { DocumentEditorState, DocumentTypeConfig, EditableLine, SelectOption } from "@/components/accounting/document-editor/documentTypes";
import { calcDocumentTotals } from "@/components/accounting/document-editor/documentMath";
import { today } from "@/pages/app/documentPageUtils";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";

type Mode = "pick" | "receipt" | "direct";

type Props = {
  config: DocumentTypeConfig;
  vendorOptions: SelectOption[];
  itemOptions: SelectOption[];
  goodsReceiptOptions: SelectOption[];
  purchaseOrderOptions: SelectOption[];
  expenseAccountOptions?: SelectOption[];
  onCancel: () => void;
  onCreate: (state: DocumentEditorState) => Promise<void>;
};

type ReceiptLine = {
  id: string;
  item_id: string;
  description: string;
  received_quantity: number;
  billed_quantity: number;
  outstanding_bill_quantity: number;
  unit_cost: number;
  purchase_order_line_id?: string | null;
};

const toNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function PurchaseBillCreateFlow({
  config,
  vendorOptions,
  itemOptions,
  goodsReceiptOptions,
  purchaseOrderOptions,
  expenseAccountOptions,
  onCancel,
  onCreate,
}: Props) {
  const [mode, setMode] = useState<Mode>("pick");

  // Receipt-based state
  const [vendorId, setVendorId] = useState<string>("");
  const [receiptId, setReceiptId] = useState<string>("");
  const [receipt, setReceipt] = useState<any>(null);
  const [isReceiptLoading, setIsReceiptLoading] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [billedQty, setBilledQty] = useState<Record<string, number>>({});

  const eligibleReceiptOptions = useMemo(() => {
    // `goodsReceiptOptions` may include fully billed receipts; we filter after loading details list (below),
    // but keep this basic list to avoid blocking UI.
    if (!vendorId) return goodsReceiptOptions;
    return goodsReceiptOptions.filter((opt) => String(opt.meta?.vendor_id || "") === vendorId);
  }, [goodsReceiptOptions, vendorId]);

  // Load receipt detail on selection so we can show outstanding quantities.
  useEffect(() => {
    if (!receiptId) {
      setReceipt(null);
      setSelected({});
      setBilledQty({});
      return;
    }
    const run = async () => {
      setIsReceiptLoading(true);
      try {
        const full = await goodsReceiptApi.getById(receiptId);
        setReceipt(full);
        const lines = Array.isArray(full?.lines) ? full.lines : [];
        const initSelected: Record<string, boolean> = {};
        const initQty: Record<string, number> = {};
        for (const l of lines) {
          const outstanding = toNumber(l.outstanding_bill_quantity ?? (toNumber(l.received_quantity) - toNumber(l.billed_quantity)));
          if (outstanding > 0) {
            initSelected[String(l.id)] = true;
            initQty[String(l.id)] = outstanding;
          }
        }
        setSelected(initSelected);
        setBilledQty(initQty);
      } finally {
        setIsReceiptLoading(false);
      }
    };
    run();
  }, [receiptId]);

  const receiptLines: ReceiptLine[] = useMemo(() => {
    const lines = Array.isArray(receipt?.lines) ? receipt.lines : [];
    return lines.map((l: any) => ({
      id: String(l.id),
      item_id: String(l.item_id),
      description: String(l.description || ""),
      received_quantity: toNumber(l.received_quantity),
      billed_quantity: toNumber(l.billed_quantity),
      outstanding_bill_quantity: toNumber(l.outstanding_bill_quantity ?? (toNumber(l.received_quantity) - toNumber(l.billed_quantity))),
      unit_cost: toNumber(l.unit_cost),
      purchase_order_line_id: l.purchase_order_line_id || null,
    }));
  }, [receipt]);

  const receiptSelectedLines: EditableLine[] = useMemo(() => {
    const lines: EditableLine[] = [];
    for (const l of receiptLines) {
      if (!selected[l.id]) continue;
      const qty = Math.max(0, Math.min(toNumber(billedQty[l.id] ?? 0), l.outstanding_bill_quantity || l.received_quantity));
      if (qty <= 0) continue;
      lines.push({
        item_id: l.item_id,
        description: l.description,
        quantity: qty,
        unit_cost: l.unit_cost,
        // backend supports this reference for GRNI clearing:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...( { goods_receipt_line_id: l.id, purchase_order_line_id: l.purchase_order_line_id || null } as any ),
        line_kind: "inventory",
      });
    }
    return lines;
  }, [receiptLines, selected, billedQty]);

  const receiptTotals = useMemo(() => calcDocumentTotals(receiptSelectedLines), [receiptSelectedLines]);

  const { options: expenseOptions } = useChartOfAccounts({ type: "expense" });
  const directExpenseOptions = expenseAccountOptions?.length ? expenseAccountOptions : expenseOptions;

  const directInitialState: DocumentEditorState = useMemo(
    () => ({
      header: {
        vendor_id: "",
        purchase_order_id: "",
        goods_receipt_id: "",
        bill_date: today(),
        due_date: today(),
        notes: "",
      },
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
              Bill against Goods Receipt <Badge variant="outline">Receipt-based bill</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Use this when inventory was already received and posted to <strong>GRNI</strong>. This bill will be linked to a GRN and clears GRNI appropriately.
            </p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Select eligible receipt</li>
              <li>Pick lines and billed quantities (supports partial billing)</li>
              <li>No manual detachment from receipt lines</li>
            </ul>
            <Button className="w-full" onClick={() => setMode("receipt")}>
              Start receipt-based bill
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-2">
              Direct Supplier Bill <Badge variant="outline">Direct bill</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Use this when you are billing without a GRN (services, expenses, or direct inventory purchases).</p>
            <ul className="list-disc pl-4 space-y-1">
              <li>Add inventory lines or service/expense lines</li>
              <li>Optional PO reference</li>
              <li>Clear labeling so it’s not mistaken for GRN-linked billing</li>
            </ul>
            <Button variant="outline" className="w-full" onClick={() => setMode("direct")}>
              Start direct bill
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

  if (mode === "receipt") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">New Purchase Bill</h2>
            <div className="text-sm text-muted-foreground">
              <Badge variant="outline" className="mr-2">Receipt-based bill</Badge>
              Linked to a goods receipt and clears GRNI.
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setMode("pick")}>Change entry path</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </div>

        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-base">Select receipt to bill</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <div className="text-sm font-medium">Vendor (optional filter)</div>
              <Select
                value={vendorId}
                onValueChange={(v) => {
                  setVendorId(v);
                  setReceiptId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by vendor" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="">All vendors</SelectItem>
                  {vendorOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium">Goods receipt</div>
              <Select value={receiptId} onValueChange={setReceiptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select receipt" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  {eligibleReceiptOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Tip: Prefer receipts showing outstanding bill quantity. Fully billed receipts will result in no selectable lines.
              </p>
            </div>
          </CardContent>
        </Card>

        {!receiptId ? (
          <EmptyState title="Select a goods receipt" description="Choose the receipt you want to bill against to load outstanding quantities." />
        ) : isReceiptLoading ? (
          <LoadingState title="Goods receipt" message="Loading receipt lines..." />
        ) : (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Receipt lines available for billing</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Receipt: <span className="font-medium text-foreground">{receipt?.receipt_no || receipt?.receipt_number || receiptId}</span>{" "}
                · Vendor: <span className="font-medium text-foreground">{receipt?.vendor_name || "-"}</span>
              </div>

              {receiptLines.length === 0 ? (
                <EmptyState title="No receipt lines found" description="This receipt has no lines to bill." />
              ) : (
                <div className="overflow-x-auto rounded-md border border-border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[52px]" />
                        <TableHead>Item</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Billed</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead className="text-right">Bill qty</TableHead>
                        <TableHead className="text-right">Unit cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {receiptLines.map((l) => {
                        const remaining = l.outstanding_bill_quantity;
                        const isChecked = Boolean(selected[l.id]);
                          return (
                            <TableRow key={l.id} className={remaining <= 0 ? "opacity-60" : undefined}>
                            <TableCell>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(v) => setSelected((cur) => ({ ...cur, [l.id]: Boolean(v) }))}
                                disabled={remaining <= 0}
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              {itemOptions.find((o) => o.value === l.item_id)?.label || l.item_id}
                            </TableCell>
                            <TableCell className="max-w-[360px] whitespace-pre-wrap">{l.description}</TableCell>
                            <TableCell className="text-right">{l.received_quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right">{l.billed_quantity.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-semibold">{remaining.toFixed(2)}</TableCell>
                            <TableCell className="text-right w-[140px]">
                              <Input
                                type="number"
                                step="0.01"
                                value={String(billedQty[l.id] ?? 0)}
                                onChange={(e) => setBilledQty((cur) => ({ ...cur, [l.id]: toNumber(e.target.value) }))}
                                disabled={!isChecked || remaining <= 0}
                              />
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(l.unit_cost)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-muted-foreground">
                  This bill will be created as <strong>GRN-linked</strong> and should clear <strong>GRNI</strong> on posting.
                </div>
                <div className="text-sm font-semibold">
                  Total (selected): {formatCurrency(receiptTotals.total)}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMode("pick")}>Back</Button>
                <Button
                  onClick={async () => {
                    if (!receipt) return;
                    if (receiptSelectedLines.length === 0) return;
                    const header = {
                      vendor_id: receipt.vendor_id || receipt.counterparty_id || "",
                      purchase_order_id: receipt.purchase_order_id || null,
                      goods_receipt_id: receipt.id,
                      bill_date: today(),
                      due_date: today(),
                      notes: "",
                    };
                    await onCreate({ header, lines: receiptSelectedLines });
                  }}
                  disabled={!receipt || receiptSelectedLines.length === 0}
                >
                  Create draft bill
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Direct bill editor
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">New Purchase Bill</h2>
          <div className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2">Direct bill</Badge>
            Not linked to a goods receipt.
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("pick")}>Change entry path</Button>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      <DocumentEditor
        title="Direct supplier bill"
        config={config}
        mode="create"
        counterpartyOptions={vendorOptions}
        itemOptions={itemOptions}
        expenseAccountOptions={directExpenseOptions}
        references={{ sourcePurchaseOrderOptions: purchaseOrderOptions }}
        extraFields={[{ key: "due_date", label: "Due Date", type: "date" }]}
        initialState={directInitialState}
        onCancel={() => setMode("pick")}
        onSave={async (state) => {
          // Ensure direct bills do not carry GRN linkage.
          const header = { ...state.header, goods_receipt_id: "" };
          await onCreate({ header, lines: state.lines });
        }}
        saveLabel="Create draft (direct)"
      />

      <Card className="border-border bg-muted/30">
        <CardHeader>
          <CardTitle className="text-base">Direct bill guidance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Direct bills can include <strong>inventory</strong> lines (item-based) and <strong>service/expense</strong> lines.
            Service/expense lines require an <strong>expense account</strong> (backend rule).
          </p>
          <p>
            If you intended to clear <strong>GRNI</strong>, use “Bill against Goods Receipt” instead.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

