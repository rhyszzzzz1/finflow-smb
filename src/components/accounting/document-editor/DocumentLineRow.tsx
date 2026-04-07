import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { formatCurrency } from "@/utils/format";
import type { DocumentTypeConfig, EditableLine, SelectOption } from "./documentTypes";
import { calcLineAmounts } from "./documentMath";
import type { DiscountType } from "./documentTypes";

type Props = {
  config: DocumentTypeConfig;
  itemOptions: SelectOption[];
  expenseAccountOptions?: SelectOption[];
  line: EditableLine;
  index: number;
  readOnly?: boolean;
  onChange: (patch: Partial<EditableLine>) => void;
  onRemove: () => void;
  validation?: Partial<Record<keyof EditableLine, string>>;
  showSource?: boolean;
};

const num = (v: string) => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function DocumentLineRow({
  config,
  itemOptions,
  expenseAccountOptions,
  line,
  index,
  readOnly,
  onChange,
  onRemove,
  validation,
  showSource,
}: Props) {
  const computed = calcLineAmounts(line);
  const lineTotal = computed.line_total ?? 0;

  const sourceBadges: string[] = [];
  const anyLine = line as any;
  if (anyLine.goods_receipt_line_id) sourceBadges.push("GRN line");
  if (anyLine.purchase_order_line_id) sourceBadges.push("PO line");

  return (
    <TableRow className="align-top">
      <TableCell className="w-[56px] text-muted-foreground">{index + 1}</TableCell>
      {showSource ? (
        <TableCell className="min-w-[120px]">
          {sourceBadges.length ? (
            <div className="flex flex-wrap gap-1">
              {sourceBadges.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
      ) : null}
      {config.type === "purchase_bill" && config.allowServices && expenseAccountOptions ? (
        <TableCell className="w-[160px]">
          {readOnly ? (
            <div className="text-sm capitalize">{line.line_kind || (line.expense_account_id ? "expense" : "inventory")}</div>
          ) : (
            <Select
              value={line.line_kind || (line.expense_account_id ? "expense" : "inventory")}
              onValueChange={(value) =>
                onChange({
                  line_kind: value as "inventory" | "expense",
                  ...(value === "expense" ? { item_id: null } : { expense_account_id: null }),
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="expense">Service / Expense</SelectItem>
              </SelectContent>
            </Select>
          )}
        </TableCell>
      ) : null}
      <TableCell className="min-w-[220px]">
        {readOnly ? (
          <div className="text-sm">{line.item_id ? (itemOptions.find((o) => o.value === line.item_id)?.label || line.item_id) : "-"}</div>
        ) : (
          <Select value={line.item_id || ""} onValueChange={(value) => onChange({ item_id: value || null })}>
            <SelectTrigger>
              <SelectValue placeholder="Select item (optional)" />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              <SelectItem value="">No item</SelectItem>
              {itemOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {validation?.item_id ? <p className="text-xs text-destructive mt-1">{validation.item_id}</p> : null}
      </TableCell>
      {config.type === "purchase_bill" && config.allowServices && expenseAccountOptions ? (
        <TableCell className="min-w-[240px]">
          {readOnly ? (
            <div className="text-sm">
              {line.expense_account_id
                ? expenseAccountOptions.find((o) => o.value === line.expense_account_id)?.label || line.expense_account_id
                : "—"}
            </div>
          ) : (
            <Select
              value={line.expense_account_id || ""}
              onValueChange={(value) => onChange({ expense_account_id: value || null })}
              disabled={(line.line_kind || (line.expense_account_id ? "expense" : "inventory")) !== "expense"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Expense account (required for services)" />
              </SelectTrigger>
              <SelectContent className="bg-popover border border-border">
                <SelectItem value="">None</SelectItem>
                {expenseAccountOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {validation?.expense_account_id ? <p className="text-xs text-destructive mt-1">{validation.expense_account_id}</p> : null}
        </TableCell>
      ) : null}
      <TableCell className="min-w-[260px]">
        {readOnly ? (
          <div className="text-sm whitespace-pre-wrap">{line.description || "-"}</div>
        ) : (
          <Input
            value={line.description || ""}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Description"
          />
        )}
        {validation?.description ? <p className="text-xs text-destructive mt-1">{validation.description}</p> : null}
      </TableCell>
      <TableCell className="w-[120px]">
        {readOnly ? (
          <div className="text-sm text-right">{Number(line.quantity || 0).toFixed(2)}</div>
        ) : (
          <Input
            type="number"
            step="0.01"
            value={String(line.quantity ?? 0)}
            onChange={(e) => onChange({ quantity: num(e.target.value) })}
          />
        )}
        {validation?.quantity ? <p className="text-xs text-destructive mt-1">{validation.quantity}</p> : null}
      </TableCell>
      <TableCell className="w-[140px]">
        {config.supportsUnitPrice ? (
          readOnly ? (
            <div className="text-sm text-right">{formatCurrency(line.unit_price ?? 0)}</div>
          ) : (
            <Input
              type="number"
              step="0.01"
              value={String(line.unit_price ?? 0)}
              onChange={(e) => onChange({ unit_price: num(e.target.value) })}
            />
          )
        ) : config.supportsUnitCost ? (
          readOnly ? (
            <div className="text-sm text-right">{formatCurrency(line.unit_cost ?? 0)}</div>
          ) : (
            <Input
              type="number"
              step="0.01"
              value={String(line.unit_cost ?? 0)}
              onChange={(e) => onChange({ unit_cost: num(e.target.value) })}
            />
          )
        ) : (
          <div className="text-sm text-muted-foreground text-right">—</div>
        )}
      </TableCell>

      {config.showDiscounts ? (
        <>
          <TableCell className="w-[150px]">
            {readOnly ? (
              <div className="text-sm capitalize">{line.discount_type || "none"}</div>
            ) : (
              <Select
                value={line.discount_type || "none"}
                onValueChange={(value) => onChange({ discount_type: value as DiscountType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            )}
          </TableCell>
          <TableCell className="w-[120px]">
            {readOnly ? (
              <div className="text-sm text-right">{formatCurrency(computed.discount_amount || 0)}</div>
            ) : (
              <Input
                type="number"
                step="0.01"
                value={String(line.discount_value ?? 0)}
                onChange={(e) => onChange({ discount_value: num(e.target.value) })}
              />
            )}
          </TableCell>
        </>
      ) : null}

      {config.showTaxRate ? (
        <TableCell className="w-[120px]">
          {readOnly ? (
            <div className="text-sm text-right">{Number(line.tax_rate || 0).toFixed(2)}%</div>
          ) : (
            <Input
              type="number"
              step="0.01"
              value={String(line.tax_rate ?? 0)}
              onChange={(e) => onChange({ tax_rate: num(e.target.value) })}
            />
          )}
        </TableCell>
      ) : null}

      <TableCell className="w-[140px] text-right font-semibold">{formatCurrency(lineTotal)}</TableCell>
      <TableCell className="w-[72px] text-right">
        {readOnly ? null : (
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remove line">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

