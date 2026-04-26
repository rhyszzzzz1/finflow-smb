import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SELECT_VALUE_NONE } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { DocumentTypeConfig, SelectOption } from "./documentTypes";

function counterpartyDisplayLabel(
  config: DocumentTypeConfig,
  id: string,
  counterpartyOptions: SelectOption[],
  header: Record<string, unknown>
): string {
  if (!id) return "";
  const direct = counterpartyOptions.find((o) => o.value === id);
  if (direct?.label && String(direct.label).trim()) return String(direct.label).trim();
  const byLegacy = counterpartyOptions.find((o) => {
    const m = o.meta as { id?: string } | undefined;
    return m?.id != null && String(m.id) === id;
  });
  if (byLegacy?.label && String(byLegacy.label).trim()) return String(byLegacy.label).trim();
  if (config.counterpartyField === "customer_id") {
    const n = String(header.customer_name || "").trim();
    if (n) return n;
  }
  if (config.counterpartyField === "vendor_id") {
    const n = String(header.vendor_name || "").trim();
    if (n) return n;
  }
  return id;
}

export type DocumentHeaderReferences = {
  sourceSalesQuoteOptions?: SelectOption[];
  sourceSalesOrderOptions?: SelectOption[];
  sourcePurchaseOrderOptions?: SelectOption[];
  sourceGoodsReceiptOptions?: SelectOption[];
  sourceSalesInvoiceOptions?: SelectOption[];
  sourcePurchaseBillOptions?: SelectOption[];
};

export type DocumentHeaderExtraField = {
  key: string;
  label: string;
  type: "text" | "date" | "select";
  options?: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

type Props = {
  config: DocumentTypeConfig;
  header: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: (patch: Record<string, unknown>) => void;
  counterpartyOptions: SelectOption[];
  references?: DocumentHeaderReferences;
  extraFields?: DocumentHeaderExtraField[];
  validation?: Record<string, string>;
};

export function DocumentHeaderFields({
  config,
  header,
  readOnly,
  onChange,
  counterpartyOptions,
  references,
  extraFields = [],
  validation,
}: Props) {
  const canEdit = !readOnly && Boolean(onChange);

  const set = (patch: Record<string, any>) => {
    if (!onChange) return;
    onChange(patch);
  };

  const counterpartyRaw = (header as Record<string, unknown>)[config.counterpartyField];
  const counterpartyId =
    counterpartyRaw != null && String(counterpartyRaw).trim() !== "" ? String(counterpartyRaw).trim() : "";
  const counterpartySelectValue = counterpartyId ? counterpartyId : SELECT_VALUE_NONE;
  const dateValue = String((header as Record<string, unknown>)[config.dateField] || "");
  const hasCounterpartyOption =
    Boolean(counterpartyId) && counterpartyOptions.some((o) => o.value === counterpartyId);
  const counterpartyShownLabel = counterpartyDisplayLabel(config, counterpartyId, counterpartyOptions, header as Record<string, unknown>);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Header</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>{config.counterpartyLabel}</Label>
            {readOnly ? (
              <div className="text-sm">{counterpartyShownLabel || counterpartyId || "-"}</div>
            ) : (
              <Select
                value={counterpartySelectValue}
                onValueChange={(value) => {
                  const nextId = value === SELECT_VALUE_NONE ? "" : value;
                  const opt = counterpartyOptions.find((o) => o.value === nextId);
                  const label = opt?.label != null ? String(opt.label).trim() : "";
                  const patch: Record<string, unknown> = {
                    [config.counterpartyField]: nextId,
                  };
                  if (config.counterpartyField === "customer_id") {
                    patch.customer_name = nextId ? label || null : "";
                  } else if (config.counterpartyField === "vendor_id") {
                    patch.vendor_name = nextId ? label || null : "";
                  }
                  set(patch);
                }}
                disabled={!canEdit}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${config.counterpartyLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value={SELECT_VALUE_NONE}>
                    <span className="text-muted-foreground">{`Select ${config.counterpartyLabel.toLowerCase()}`}</span>
                  </SelectItem>
                  {counterpartyId && !hasCounterpartyOption ? (
                    <SelectItem value={counterpartyId}>
                      {counterpartyShownLabel || counterpartyId}
                    </SelectItem>
                  ) : null}
                  {counterpartyOptions
                    .filter((opt) => opt.value !== "" && opt.value !== SELECT_VALUE_NONE)
                    .map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label || opt.value}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            {validation?.[config.counterpartyField] ? (
              <p className="text-xs text-destructive">{validation[config.counterpartyField]}</p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>Date</Label>
            {readOnly ? (
              <div className="text-sm">{dateValue || "-"}</div>
            ) : (
              <Input
                type="date"
                value={dateValue}
                onChange={(e) => set({ [config.dateField]: e.target.value })}
                disabled={!canEdit}
              />
            )}
            {validation?.[config.dateField] ? <p className="text-xs text-destructive">{validation[config.dateField]}</p> : null}
          </div>

          {extraFields.map((field) => {
            const value = String((header as Record<string, unknown>)[field.key] || "");
            return (
              <div key={field.key} className="grid gap-2">
                <Label>
                  {field.label}
                  {field.required ? " *" : ""}
                </Label>
                {readOnly ? (
                  <div className="text-sm">{value || "-"}</div>
                ) : field.type === "select" ? (
                  <Select value={value} onValueChange={(v) => set({ [field.key]: v })} disabled={!canEdit || field.disabled}>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      {(field.options || [])
                        .filter((opt) => opt.value !== "")
                        .map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={field.type}
                    value={value}
                    onChange={(e) => set({ [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                    disabled={!canEdit || field.disabled}
                  />
                )}
                {validation?.[field.key] ? <p className="text-xs text-destructive">{validation[field.key]}</p> : null}
              </div>
            );
          })}
        </div>

        <div className="grid gap-2">
          <Label>Notes</Label>
          {readOnly ? (
            <div className="text-sm whitespace-pre-wrap">{String((header as Record<string, unknown>).notes || "") || "-"}</div>
          ) : (
            <Textarea
              value={String((header as Record<string, unknown>).notes || "")}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Internal notes"
            />
          )}
        </div>

        {references ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {references.sourceSalesQuoteOptions ? (
              <div className="grid gap-2">
                <Label>Source Quote</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourceSalesQuoteOptions.find((o) => o.value === String((header as any).sales_quote_id || ""))?.label ||
                      String((header as any).sales_quote_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.sales_quote_id || "") ? String(header.sales_quote_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ sales_quote_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional quote link" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourceSalesQuoteOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {references.sourceSalesOrderOptions ? (
              <div className="grid gap-2">
                <Label>Source Sales Order</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourceSalesOrderOptions.find((o) => o.value === String((header as any).sales_order_id || ""))?.label ||
                      String((header as any).sales_order_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.sales_order_id || "") ? String(header.sales_order_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ sales_order_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional order link" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourceSalesOrderOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {references.sourcePurchaseOrderOptions ? (
              <div className="grid gap-2">
                <Label>Source Purchase Order</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourcePurchaseOrderOptions.find((o) => o.value === String((header as any).purchase_order_id || ""))?.label ||
                      String((header as any).purchase_order_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.purchase_order_id || "") ? String(header.purchase_order_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ purchase_order_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional PO link" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourcePurchaseOrderOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {references.sourceGoodsReceiptOptions ? (
              <div className="grid gap-2">
                <Label>Source Goods Receipt</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourceGoodsReceiptOptions.find((o) => o.value === String((header as any).goods_receipt_id || ""))?.label ||
                      String((header as any).goods_receipt_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.goods_receipt_id || "") ? String(header.goods_receipt_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ goods_receipt_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional GRN link" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourceGoodsReceiptOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {references.sourceSalesInvoiceOptions ? (
              <div className="grid gap-2">
                <Label>Related Sales Invoice</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourceSalesInvoiceOptions.find((o) => o.value === String((header as any).related_sales_invoice_id || ""))?.label ||
                      String((header as any).related_sales_invoice_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.related_sales_invoice_id || "") ? String(header.related_sales_invoice_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ related_sales_invoice_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional reference invoice" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourceSalesInvoiceOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}

            {references.sourcePurchaseBillOptions ? (
              <div className="grid gap-2">
                <Label>Related Purchase Bill</Label>
                {readOnly ? (
                  <div className="text-sm">
                    {references.sourcePurchaseBillOptions.find((o) => o.value === String((header as any).related_purchase_bill_id || ""))?.label ||
                      String((header as any).related_purchase_bill_id || "") ||
                      "-"}
                  </div>
                ) : (
                  <Select
                    value={String(header.related_purchase_bill_id || "") ? String(header.related_purchase_bill_id) : SELECT_VALUE_NONE}
                    onValueChange={(v) => set({ related_purchase_bill_id: v === SELECT_VALUE_NONE ? "" : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Optional source bill" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border">
                      <SelectItem value={SELECT_VALUE_NONE}>None</SelectItem>
                      {references.sourcePurchaseBillOptions.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

