import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/utils/format";

export const today = () => new Date().toISOString().slice(0, 10);

export const buildSingleLine = (values: {
  description: string;
  quantity?: string;
  unitPrice?: string;
  unitCost?: string;
  itemId?: string;
  salesOrderLineId?: string;
  salesQuoteLineId?: string;
  purchaseOrderLineId?: string;
  goodsReceiptLineId?: string;
  expenseAccountId?: string;
}) => {
  const line: Record<string, any> = {
    description: values.description,
  };

  if (values.quantity !== undefined) {
    const parsedQuantity = Number(values.quantity || 0);
    line.quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
    line.ordered_quantity = line.quantity;
    line.received_quantity = line.quantity;
  }

  if (values.unitPrice !== undefined) {
    const parsedUnitPrice = Number(values.unitPrice || 0);
    line.unit_price = Number.isFinite(parsedUnitPrice) ? parsedUnitPrice : 0;
  }

  if (values.unitCost !== undefined) {
    const parsedUnitCost = Number(values.unitCost || 0);
    line.unit_cost = Number.isFinite(parsedUnitCost) ? parsedUnitCost : 0;
  }

  if (values.itemId) line.item_id = values.itemId;
  if (values.salesOrderLineId) line.sales_order_line_id = values.salesOrderLineId;
  if (values.salesQuoteLineId) line.sales_quote_line_id = values.salesQuoteLineId;
  if (values.purchaseOrderLineId) line.purchase_order_line_id = values.purchaseOrderLineId;
  if (values.goodsReceiptLineId) line.goods_receipt_line_id = values.goodsReceiptLineId;
  if (values.expenseAccountId) line.expense_account_id = values.expenseAccountId;

  return line;
};

export const statusVisible = (status: unknown, ...allowed: string[]) =>
  allowed.includes(String(status || "").toLowerCase());

export const relationshipRoleBadge = (role: string | null | undefined): ReactNode => {
  if (!role) return <span className="text-muted-foreground">-</span>;
  return (
    <Badge variant="outline" className="capitalize">
      {role}
    </Badge>
  );
};

export const varianceTone = (variance: number) => {
  if (Math.abs(variance) < 0.0001) return "text-emerald-600";
  return "text-amber-600";
};

export const reconciliationLabel = (label: string, variance: number) => ({
  label,
  value: formatCurrency(variance),
  helper: Math.abs(variance) < 0.0001 ? "Reconciled" : "Variance requires review",
  className: Math.abs(variance) < 0.0001 ? "bg-emerald-500/5" : "bg-amber-500/5",
});
