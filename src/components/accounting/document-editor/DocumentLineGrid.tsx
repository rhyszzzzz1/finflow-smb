import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/accounting/EmptyState";
import type { DocumentTypeConfig, EditableLine, SelectOption } from "./documentTypes";
import { defaultLine } from "./documentTypes";
import { DocumentLineRow } from "./DocumentLineRow";

type Props = {
  config: DocumentTypeConfig;
  itemOptions: SelectOption[];
  expenseAccountOptions?: SelectOption[];
  lines: EditableLine[];
  readOnly?: boolean;
  onChangeLines?: (next: EditableLine[]) => void;
  validation?: Array<Partial<Record<keyof EditableLine, string>>>;
};

export function DocumentLineGrid({ config, itemOptions, expenseAccountOptions, lines, readOnly, onChangeLines, validation }: Props) {
  const canEdit = !readOnly && Boolean(onChangeLines);

  const addLine = () => {
    if (!onChangeLines) return;
    onChangeLines([...lines, defaultLine(config)]);
  };

  const patchLine = (index: number, patch: Partial<EditableLine>) => {
    if (!onChangeLines) return;
    onChangeLines(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const removeLine = (index: number) => {
    if (!onChangeLines) return;
    onChangeLines(lines.filter((_, i) => i !== index));
  };

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Lines</CardTitle>
        {canEdit ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={addLine}>
            <Plus className="w-4 h-4" />
            Add line
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <EmptyState
            title="No lines added yet"
            description="Add one or more lines (items, services, or adjustments) to build a real accounting document."
          />
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-background">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[56px]">#</TableHead>
                  {readOnly && config.supportsSources ? <TableHead>Source</TableHead> : null}
                  {config.type === "purchase_bill" && config.allowServices && expenseAccountOptions ? (
                    <TableHead>Line type</TableHead>
                  ) : null}
                  <TableHead className="min-w-[200px]">
                    <div className="flex flex-col gap-0.5">
                      <span>{config.itemColumnLabel ?? "Item"}</span>
                      {config.itemColumnHint ? (
                        <span className="text-xs font-normal text-muted-foreground leading-snug">{config.itemColumnHint}</span>
                      ) : null}
                    </div>
                  </TableHead>
                  {config.type === "purchase_bill" && config.allowServices && expenseAccountOptions ? (
                    <TableHead>Expense account</TableHead>
                  ) : null}
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">{config.quantityLabel}</TableHead>
                  <TableHead className="text-right">{config.unitAmountLabel}</TableHead>
                  {config.showDiscounts ? (
                    <>
                      <TableHead>Discount</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </>
                  ) : null}
                  {config.showTaxRate ? <TableHead className="text-right">Tax %</TableHead> : null}
                  <TableHead className="text-right">Line total</TableHead>
                  <TableHead className="w-[72px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <DocumentLineRow
                    key={line.id || `line-${index}`}
                    config={config}
                    itemOptions={itemOptions}
                    expenseAccountOptions={expenseAccountOptions}
                    line={line}
                    index={index}
                    readOnly={readOnly}
                    onChange={(patch) => patchLine(index, patch)}
                    onRemove={() => removeLine(index)}
                    validation={validation?.[index]}
                    showSource={Boolean(readOnly && config.supportsSources)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

