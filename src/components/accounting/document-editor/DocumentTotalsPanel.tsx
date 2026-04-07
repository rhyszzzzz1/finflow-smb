import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/format";
import type { EditableLine } from "./documentTypes";
import { calcDocumentTotals } from "./documentMath";

type Props = {
  lines: EditableLine[];
  label?: string;
};

export function DocumentTotalsPanel({ lines, label = "Totals" }: Props) {
  const totals = calcDocumentTotals(lines);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span className="font-medium">{formatCurrency(totals.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2">
          <span className="font-semibold">Total</span>
          <span className="font-bold">{formatCurrency(totals.total)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

