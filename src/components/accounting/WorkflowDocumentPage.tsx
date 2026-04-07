import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { formatCurrency, formatDate } from "@/utils/format";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import { EmptyState } from "./EmptyState";
import { LoadingState } from "./LoadingState";

type FieldOption = { value: string; label: string };
type FormField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select";
  required?: boolean;
  options?: FieldOption[];
  placeholder?: string;
  step?: string;
  disabled?: boolean;
  helpText?: string;
};

type Column<T> = {
  header: string;
  align?: "left" | "center" | "right";
  render: (item: T) => React.ReactNode;
};

type Action<T> = {
  label: string;
  onClick: (item: T) => Promise<any> | any;
  visible?: (item: T) => boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
};

type Stat = {
  label: string;
  value: string;
  helper?: string;
  className?: string;
};

type Props<T> = {
  title: string;
  description: string;
  dialogTitle: string;
  createLabel: string;
  isLoading: boolean;
  items: T[];
  getItemId: (item: T) => string;
  getStatus?: (item: T) => string | null | undefined;
  getDocumentNo?: (item: T) => string;
  getCounterpartyName?: (item: T) => string | null | undefined;
  getTotalAmount?: (item: T) => number;
  getPrimaryDate?: (item: T) => string | null | undefined;
  columns?: Column<T>[];
  actions?: Action<T>[];
  stats?: Stat[];
  buildFields: (draft: Record<string, string>, editingItem: T | null) => FormField[];
  initialValues: Record<string, string>;
  onCreate: (values: Record<string, string>) => Promise<any>;
  onUpdate?: (id: string, values: Record<string, string>) => Promise<any>;
  toEditValues?: (item: T) => Record<string, string>;
  emptyState?: {
    title: string;
    description: string;
  };
};

const alignClass: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function WorkflowDocumentPage<T>({
  title,
  description,
  dialogTitle,
  createLabel,
  isLoading,
  items,
  getItemId,
  getStatus,
  getDocumentNo,
  getCounterpartyName,
  getTotalAmount,
  getPrimaryDate,
  columns = [],
  actions = [],
  stats = [],
  buildFields,
  initialValues,
  onCreate,
  onUpdate,
  toEditValues,
  emptyState,
}: Props<T>) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>(initialValues);
  const [editingItem, setEditingItem] = useState<T | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isDialogOpen) {
      setFormValues(initialValues);
      setEditingItem(null);
    }
  }, [isDialogOpen, initialValues]);

  const fields = useMemo(() => buildFields(formValues, editingItem), [buildFields, formValues, editingItem]);

  const openCreate = () => {
    setEditingItem(null);
    setFormValues(initialValues);
    setIsDialogOpen(true);
  };

  const openEdit = (item: T) => {
    if (!onUpdate || !toEditValues) return;
    setEditingItem(item);
    setFormValues(toEditValues(item));
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingItem && onUpdate) {
        await onUpdate(getItemId(editingItem), formValues);
      } else {
        await onCreate(formValues);
      }
      setIsDialogOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <LoadingState title={title} message={`Loading ${title.toLowerCase()}...`} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" onClick={openCreate}>
              <Plus className="w-4 h-4" />
              {createLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>{editingItem ? `Edit ${dialogTitle}` : dialogTitle}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 py-2">
                {fields.map((field) => (
                  <div key={field.key} className="grid gap-2">
                    <Label>{field.label}{field.required ? " *" : ""}</Label>
                    {field.type === "select" ? (
                      <Select
                        value={formValues[field.key] || ""}
                        onValueChange={(value) => setFormValues((current) => ({ ...current, [field.key]: value }))}
                        disabled={field.disabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border border-border">
                          {(field.options || []).map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : field.type === "textarea" ? (
                      <Textarea
                        value={formValues[field.key] || ""}
                        onChange={(event) => setFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        placeholder={field.placeholder}
                        disabled={field.disabled}
                      />
                    ) : (
                      <Input
                        type={field.type}
                        value={formValues[field.key] || ""}
                        onChange={(event) => setFormValues((current) => ({ ...current, [field.key]: event.target.value }))}
                        placeholder={field.placeholder}
                        required={field.required}
                        step={field.step}
                        disabled={field.disabled}
                      />
                    )}
                    {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : editingItem ? "Update" : "Create"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {stats.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className={stat.className}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                {stat.helper ? <p className="text-xs text-muted-foreground mt-1">{stat.helper}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="bg-card rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              {getDocumentNo ? <TableHead>Document</TableHead> : null}
              {getCounterpartyName ? <TableHead>Counterparty</TableHead> : null}
              {getPrimaryDate ? <TableHead>Date</TableHead> : null}
              {getTotalAmount ? <TableHead className="text-right">Amount</TableHead> : null}
              {getStatus ? <TableHead>Status</TableHead> : null}
              {columns.map((column, index) => (
                <TableHead key={`${column.header}-${index}`} className={alignClass[column.align || "left"]}>
                  {column.header}
                </TableHead>
              ))}
              {(actions.length > 0 || onUpdate) ? <TableHead className="text-right">Actions</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6 + columns.length} className="py-8">
                  <EmptyState
                    title={emptyState?.title || `No ${title.toLowerCase()} yet`}
                    description={emptyState?.description || `Create your first ${title.toLowerCase().slice(0, -1)} to get started.`}
                  />
                </TableCell>
              </TableRow>
            ) : items.map((item) => (
              <TableRow key={getItemId(item)} className="hover:bg-muted/30">
                {getDocumentNo ? <TableCell className="font-medium">{getDocumentNo(item)}</TableCell> : null}
                {getCounterpartyName ? <TableCell>{getCounterpartyName(item) || "-"}</TableCell> : null}
                {getPrimaryDate ? <TableCell>{getPrimaryDate(item) ? formatDate(getPrimaryDate(item) as string) : "-"}</TableCell> : null}
                {getTotalAmount ? <TableCell className="text-right font-semibold">{formatCurrency(getTotalAmount(item) || 0)}</TableCell> : null}
                {getStatus ? <TableCell><DocumentStatusBadge status={getStatus(item)} /></TableCell> : null}
                {columns.map((column, index) => (
                  <TableCell key={`${getItemId(item)}-${index}`} className={alignClass[column.align || "left"]}>
                    {column.render(item)}
                  </TableCell>
                ))}
                {(actions.length > 0 || onUpdate) ? (
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {onUpdate && getStatus && ["draft", "rejected"].includes(String(getStatus(item) || "").toLowerCase()) ? (
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          Edit
                        </Button>
                      ) : null}
                      {actions
                        .filter((action) => (action.visible ? action.visible(item) : true))
                        .map((action) => (
                          <Button
                            key={`${getItemId(item)}-${action.label}`}
                            variant={action.variant || "outline"}
                            size="sm"
                            onClick={() => action.onClick(item)}
                          >
                            {action.label}
                          </Button>
                        ))}
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
