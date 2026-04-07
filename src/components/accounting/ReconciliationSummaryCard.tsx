import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/utils/format";

export const ReconciliationSummaryCard = ({
  title,
  report,
}: {
  title: string;
  report: any;
}) => {
  const variance = Number(report?.variance || 0);
  const reconciled = Boolean(report?.is_reconciled ?? report?.validation?.fully_reconciled);

  return (
    <Card className={reconciled ? "border-emerald-200" : "border-rose-200"}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">GL Balance</span>
          <span className="font-semibold">{formatCurrency(report?.gl_account?.gl_balance || 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Subledger</span>
          <span className="font-semibold">{formatCurrency(report?.subledger_balance || 0)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Variance</span>
          <span className={variance === 0 ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>
            {formatCurrency(variance)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
