import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentStatusBadge } from "@/components/accounting/DocumentStatusBadge";
import { formatCurrency } from "@/utils/format";
import type { DocumentTypeConfig, EditableLine, SelectOption } from "./documentTypes";
import { DocumentHeaderFields, type DocumentHeaderExtraField, type DocumentHeaderReferences } from "./DocumentHeaderFields";
import { DocumentLineGrid } from "./DocumentLineGrid";
import { DocumentTotalsPanel } from "./DocumentTotalsPanel";

type Props = {
  config: DocumentTypeConfig;
  title: string;
  status?: string | null;
  documentNo?: string | null;
  header: Record<string, unknown>;
  counterpartyOptions: SelectOption[];
  itemOptions: SelectOption[];
  lines: EditableLine[];
  totals?: { subtotal?: number; tax?: number; total?: number };
  references?: DocumentHeaderReferences;
  extraFields?: DocumentHeaderExtraField[];
};

export function DocumentDetailView({
  config,
  title,
  status,
  documentNo,
  header,
  counterpartyOptions,
  itemOptions,
  lines,
  totals,
  references,
  extraFields,
}: Props) {
  const billTypeBadge =
    config.type === "purchase_bill"
      ? ((header as any)?.goods_receipt_id ? "Receipt-based bill (GRNI-clearing)" : "Direct supplier bill")
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="text-sm text-muted-foreground">{documentNo ? `Document: ${documentNo}` : null}</div>
          {billTypeBadge ? (
            <div className="mt-2">
              <Badge variant="outline">{billTypeBadge}</Badge>
            </div>
          ) : null}
        </div>
        {status ? <DocumentStatusBadge status={status} /> : null}
      </div>

      <DocumentHeaderFields
        config={config}
        header={header}
        readOnly
        counterpartyOptions={counterpartyOptions}
        references={references}
        extraFields={extraFields}
      />

      <DocumentLineGrid config={config} itemOptions={itemOptions} lines={lines} readOnly />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DocumentTotalsPanel lines={lines} />
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Recorded totals (server)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">{formatCurrency(Number(totals?.subtotal || 0))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">{formatCurrency(Number(totals?.tax || 0))}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2">
              <span className="font-semibold">Total</span>
              <span className="font-bold">{formatCurrency(Number(totals?.total || 0))}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

