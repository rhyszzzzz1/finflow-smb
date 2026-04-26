import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/accounting/EmptyState";
import { formatCurrency } from "@/utils/format";

type Reco = {
  gl_balance?: number;
  subledger_balance?: number;
  variance?: number;
  is_reconciled?: boolean;
  lines?: Array<Record<string, unknown>>;
};

function varianceClass(variance: number) {
  return Math.abs(variance) < 0.0001 ? "text-emerald-600" : "text-amber-600";
}

export function ReconciliationDrilldown({
  title,
  report,
  hint,
}: {
  title: string;
  report: Reco | null | undefined;
  hint?: string;
}) {
  const gl = Number(report?.gl_balance || 0);
  const subledger = Number(report?.subledger_balance || 0);
  const variance = Number(report?.variance ?? gl - subledger);
  const reconciled = Boolean(report?.is_reconciled ?? Math.abs(variance) < 0.0001);

  const hasLines = Array.isArray(report?.lines) && report!.lines!.length > 0;

  return (
    <Card className={reconciled ? "border-emerald-200" : "border-amber-200"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-3">
          <span className="text-base">{title}</span>
          <span className={`inline-flex items-center gap-2 text-sm ${reconciled ? "text-emerald-700" : "text-amber-700"}`}>
            {reconciled ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {reconciled ? "Reconciled" : "Variance"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {hint ? <div className="text-sm text-muted-foreground">{hint}</div> : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">GL balance</div>
            <div className="text-lg font-semibold">{formatCurrency(gl)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Subledger balance</div>
            <div className="text-lg font-semibold">{formatCurrency(subledger)}</div>
          </div>
          <div className="rounded-md border border-border p-3">
            <div className="text-xs text-muted-foreground">Variance</div>
            <div className={`text-lg font-semibold ${varianceClass(variance)}`}>{formatCurrency(variance)}</div>
          </div>
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          {hasLines ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report!.lines!.slice(0, 200).map((row, idx) => {
                  const label = String((row as any).label ?? (row as any).description ?? (row as any).document_no ?? (row as any).id ?? `Row ${idx + 1}`);
                  const amount = Number((row as any).amount ?? (row as any).variance ?? (row as any).balance ?? 0);
                  return (
                    <TableRow key={String((row as any).id ?? idx)}>
                      <TableCell className="font-medium">{label}</TableCell>
                      <TableCell className="text-right">{formatCurrency(amount)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="p-4">
              <EmptyState
                title="Drilldown not available yet"
                description="This reconciliation currently returns only control totals. The UI is ready for detailed variance lines when the backend exposes them."
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

