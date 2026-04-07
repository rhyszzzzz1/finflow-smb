import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { DocumentHeaderFields } from "./DocumentHeaderFields";
import { DocumentLineGrid } from "./DocumentLineGrid";
import { DocumentTotalsPanel } from "./DocumentTotalsPanel";
import type { DocumentEditorState, DocumentTypeConfig, EditableLine, SelectOption } from "./documentTypes";
import { defaultLine, type DiscountType } from "./documentTypes";
import { calcLineAmounts } from "./documentMath";

type HeaderValidation = Record<string, string>;
type LineValidation = Array<Partial<Record<keyof EditableLine, string>>>;

type Props = {
  title: string;
  config: DocumentTypeConfig;
  mode: "create" | "edit";
  counterpartyOptions: SelectOption[];
  itemOptions: SelectOption[];
  expenseAccountOptions?: SelectOption[];
  references?: Parameters<typeof DocumentHeaderFields>[0]["references"];
  extraFields?: Parameters<typeof DocumentHeaderFields>[0]["extraFields"];
  initialState: DocumentEditorState;
  onCancel: () => void;
  onSave: (state: DocumentEditorState) => Promise<any>;
  saveLabel?: string;
};

function validate(config: DocumentTypeConfig, state: DocumentEditorState): { header: HeaderValidation; lines: LineValidation; ok: boolean } {
  const headerErrors: HeaderValidation = {};
  const lineErrors: LineValidation = state.lines.map(() => ({}));

  if (!state.header[config.counterpartyField]) headerErrors[config.counterpartyField] = `${config.counterpartyLabel} is required`;
  if (!state.header[config.dateField]) headerErrors[config.dateField] = "Date is required";

  if (!state.lines.length) {
    toast.error("Add at least one line");
    return { header: headerErrors, lines: lineErrors, ok: false };
  }

  state.lines.forEach((line, idx) => {
    if (!String(line.description || "").trim()) lineErrors[idx].description = "Description is required";
    if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) lineErrors[idx].quantity = "Quantity must be > 0";

    if (config.supportsUnitPrice) {
      if (!Number.isFinite(Number(line.unit_price)) || Number(line.unit_price) < 0) lineErrors[idx].unit_price = "Unit price must be ≥ 0";
    }
    if (config.supportsUnitCost) {
      if (!Number.isFinite(Number(line.unit_cost)) || Number(line.unit_cost) < 0) lineErrors[idx].unit_cost = "Unit cost must be ≥ 0";
    }

    if (config.type === "goods_receipt") {
      if (!line.item_id) lineErrors[idx].item_id = "Item is required for goods receipts";
    }

    if (config.type === "purchase_bill" && config.allowServices) {
      const lineKind = line.line_kind || (line.expense_account_id ? "expense" : "inventory");
      if (lineKind === "expense") {
        if (!line.expense_account_id) lineErrors[idx].expense_account_id = "Expense account is required for service/expense lines";
      } else {
        if (!line.item_id) lineErrors[idx].item_id = "Item is required for inventory bill lines";
      }
    }
  });

  const ok = Object.keys(headerErrors).length === 0 && lineErrors.every((e) => Object.keys(e).length === 0);
  return { header: headerErrors, lines: lineErrors, ok };
}

function normalizeForSave(config: DocumentTypeConfig, state: DocumentEditorState) {
  const lines = state.lines.map((line) => {
    const computed = calcLineAmounts(line);
    const base: Record<string, unknown> = {
      ...line,
      ...computed,
    };
    // Remove UI-only fields not understood by older endpoints.
    delete (base as any).source;

    if (config.supportsUnitPrice) {
      base.unit_price = Number((base as any).unit_price || 0);
    }
    if (config.supportsUnitCost) {
      base.unit_cost = Number((base as any).unit_cost || 0);
    }
    base.quantity = Number((base as any).quantity || 0);
    base.description = String((base as any).description || "").trim();

    // Some endpoints historically expect ordered/received quantity fields even when `quantity` exists.
    if (config.type === "sales_order") (base as any).ordered_quantity = (base as any).ordered_quantity ?? base.quantity;
    if (config.type === "purchase_order") (base as any).ordered_quantity = (base as any).ordered_quantity ?? base.quantity;
    if (config.type === "goods_receipt") (base as any).received_quantity = (base as any).received_quantity ?? base.quantity;

    return base as unknown as EditableLine;
  });

  return {
    header: state.header,
    lines,
  };
}

export function DocumentEditor({
  title,
  config,
  mode,
  counterpartyOptions,
  itemOptions,
  expenseAccountOptions,
  references,
  extraFields,
  initialState,
  onCancel,
  onSave,
  saveLabel,
}: Props) {
  const [state, setState] = useState<DocumentEditorState>(() => ({
    header: { ...initialState.header },
    lines: initialState.lines?.length ? [...initialState.lines] : [defaultLine(config)],
  }));
  const [isSaving, setIsSaving] = useState(false);
  const [headerValidation, setHeaderValidation] = useState<HeaderValidation>({});
  const [lineValidation, setLineValidation] = useState<LineValidation>([]);

  const canSave = useMemo(() => state.lines.length > 0, [state.lines.length]);

  const handleSave = async () => {
    const result = validate(config, state);
    setHeaderValidation(result.header);
    setLineValidation(result.lines);
    if (!result.ok) return;

    setIsSaving(true);
    try {
      const normalized = normalizeForSave(config, state);
      await onSave({ header: normalized.header, lines: normalized.lines });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <div className="text-sm text-muted-foreground">{mode === "create" ? "Create a draft document" : "Edit draft lines and header"}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving}>
            {isSaving ? "Saving..." : saveLabel || (mode === "create" ? "Create" : "Save")}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <DocumentHeaderFields
            config={config}
            header={state.header}
            onChange={(patch) => setState((cur) => ({ ...cur, header: { ...cur.header, ...patch } }))}
            counterpartyOptions={counterpartyOptions}
            references={references}
            extraFields={extraFields}
            validation={headerValidation}
          />
          <DocumentLineGrid
            config={config}
            itemOptions={itemOptions}
            expenseAccountOptions={expenseAccountOptions}
            lines={state.lines}
            onChangeLines={(lines) => setState((cur) => ({ ...cur, lines }))}
            validation={lineValidation}
          />
        </div>
        <div className="space-y-4">
          <DocumentTotalsPanel lines={state.lines} />
          <Card className="p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground mb-2">Guidance</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Add multiple lines for real documents (items, services, adjustments).</li>
              <li>Use per-line discounts and tax rates where applicable.</li>
              <li>Posted/finalised documents will be read-only in detail view.</li>
            </ul>
            <div className="my-3 h-px bg-border" />
            <div>
              <span className="font-medium text-foreground">Note:</span> This editor sends <span className="font-medium">line arrays</span> to the backend (no single-line shortcuts).
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

