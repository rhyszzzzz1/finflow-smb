import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Eye, Pencil } from "lucide-react";
import { LoadingState } from "@/components/accounting/LoadingState";
import { EmptyState } from "@/components/accounting/EmptyState";
import { DocumentStatusBadge } from "@/components/accounting/DocumentStatusBadge";
import { formatCurrency, formatDate } from "@/utils/format";
import type { DocumentEditorState, DocumentTypeConfig, EditableLine, SelectOption } from "./documentTypes";
import { DocumentEditor } from "./DocumentEditor";
import { DocumentDetailView } from "./DocumentDetailView";

type Column<T> = {
  header: string;
  align?: "left" | "center" | "right";
  render: (item: T) => React.ReactNode;
};

type Action<T> = {
  label: string;
  onClick: (item: T) => Promise<unknown> | unknown;
  visible?: (item: T) => boolean;
  variant?: "default" | "outline" | "ghost" | "destructive";
};

type Stat = {
  label: string;
  value: string;
  helper?: string;
  className?: string;
};

type DetailPayload = {
  id: string;
  status?: string | null;
  documentNo?: string | null;
  header: Record<string, unknown>;
  lines: EditableLine[];
  totals?: { subtotal?: number; tax?: number; total?: number };
};

type Props<T> = {
  title: string;
  description: string;
  config: DocumentTypeConfig;
  isLoading: boolean;
  items: T[];
  stats?: Stat[];
  getItemId: (item: T) => string;
  getStatus?: (item: T) => string | null | undefined;
  getDocumentNo?: (item: T) => string;
  getCounterpartyName?: (item: T) => string | null | undefined;
  getTotalAmount?: (item: T) => number;
  getPrimaryDate?: (item: T) => string | null | undefined;
  columns?: Column<T>[];
  actions?: Action<T>[];

  // master data
  counterpartyOptions: SelectOption[];
  itemOptions: SelectOption[];
  references?: import("./DocumentHeaderFields").DocumentHeaderReferences;
  extraFields?: import("./DocumentHeaderFields").DocumentHeaderExtraField[];

  // editor + detail operations
  canEditDraft?: (item: T) => boolean;
  fetchById: (id: string) => Promise<unknown>;
  toDetailPayload: (full: unknown) => DetailPayload;
  toEditorState: (full: unknown) => DocumentEditorState;
  onCreateDraft: (state: DocumentEditorState) => Promise<unknown>;
  onUpdateDraft?: (id: string, state: DocumentEditorState) => Promise<unknown>;
  createInitialState?: DocumentEditorState;
  renderCreate?: (args: {
    config: DocumentTypeConfig;
    counterpartyOptions: SelectOption[];
    itemOptions: SelectOption[];
    references?: import("./DocumentHeaderFields").DocumentHeaderReferences;
    extraFields?: import("./DocumentHeaderFields").DocumentHeaderExtraField[];
    defaultInitialState: DocumentEditorState;
    onCancel: () => void;
    onCreate: (state: DocumentEditorState) => Promise<void>;
  }) => React.ReactNode;
};

const alignClass: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function DocumentWorkflowPage<T>({
  title,
  description,
  config,
  isLoading,
  items,
  stats = [],
  getItemId,
  getStatus,
  getDocumentNo,
  getCounterpartyName,
  getTotalAmount,
  getPrimaryDate,
  columns = [],
  actions = [],
  counterpartyOptions,
  itemOptions,
  references,
  extraFields,
  canEditDraft,
  fetchById,
  toDetailPayload,
  toEditorState,
  onCreateDraft,
  onUpdateDraft,
  createInitialState,
  renderCreate,
}: Props<T>) {
  const [tab, setTab] = useState<"list" | "create" | "view" | "edit">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const loadDetail = async (id: string) => {
    setIsDetailLoading(true);
    try {
      const full = await fetchById(id);
      setDetail(toDetailPayload(full));
    } finally {
      setIsDetailLoading(false);
    }
  };

  const openView = async (id: string) => {
    setSelectedId(id);
    setTab("view");
    await loadDetail(id);
  };

  const openEdit = async (id: string) => {
    setSelectedId(id);
    setTab("edit");
    await loadDetail(id);
  };

  const editorInitialState = useMemo<DocumentEditorState>(() => {
    if (!detail) return { header: {}, lines: [] };
    const fullLike = { ...detail.header, lines: detail.lines };
    return toEditorState(fullLike);
  }, [detail, toEditorState]);

  useEffect(() => {
    if (tab === "list") {
      setSelectedId(null);
      setDetail(null);
    }
  }, [tab]);

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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setTab("list")}>
            List
          </Button>
          <Button className="gap-2" onClick={() => setTab("create")}>
            <Plus className="w-4 h-4" />
            New
          </Button>
        </div>
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="view" disabled={!selectedId}>
            View
          </TabsTrigger>
          <TabsTrigger value="edit" disabled={!selectedId || !onUpdateDraft}>
            Edit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {getDocumentNo ? <TableHead>Document</TableHead> : null}
                  {getCounterpartyName ? <TableHead>{config.counterpartyLabel}</TableHead> : null}
                  {getPrimaryDate ? <TableHead>Date</TableHead> : null}
                  {getTotalAmount ? <TableHead className="text-right">Amount</TableHead> : null}
                  {getStatus ? <TableHead>Status</TableHead> : null}
                  {columns.map((column, index) => (
                    <TableHead key={`${column.header}-${index}`} className={alignClass[column.align || "left"]}>
                      {column.header}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6 + columns.length} className="py-8">
                      <EmptyState title={`No ${title.toLowerCase()} yet`} description={`Create your first ${title.toLowerCase().slice(0, -1)} to get started.`} />
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const id = getItemId(item);
                    const status = getStatus ? getStatus(item) : null;
                    const canEdit = Boolean(onUpdateDraft) && (canEditDraft ? canEditDraft(item) : String(status || "").toLowerCase() === "draft");
                    return (
                      <TableRow key={id} className="hover:bg-muted/30">
                        {getDocumentNo ? <TableCell className="font-medium">{getDocumentNo(item)}</TableCell> : null}
                        {getCounterpartyName ? <TableCell>{getCounterpartyName(item) || "-"}</TableCell> : null}
                        {getPrimaryDate ? <TableCell>{getPrimaryDate(item) ? formatDate(getPrimaryDate(item) as string) : "-"}</TableCell> : null}
                        {getTotalAmount ? <TableCell className="text-right font-semibold">{formatCurrency(getTotalAmount(item) || 0)}</TableCell> : null}
                        {getStatus ? (
                          <TableCell>
                            <DocumentStatusBadge status={status} />
                          </TableCell>
                        ) : null}
                        {columns.map((column, index) => (
                          <TableCell key={`${id}-${index}`} className={alignClass[column.align || "left"]}>
                            {column.render(item)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" size="sm" className="gap-1" onClick={() => openView(id)}>
                              <Eye className="w-4 h-4" /> View
                            </Button>
                            {canEdit ? (
                              <Button variant="ghost" size="sm" className="gap-1" onClick={() => openEdit(id)}>
                                <Pencil className="w-4 h-4" /> Edit
                              </Button>
                            ) : null}
                            {actions
                              .filter((action) => (action.visible ? action.visible(item) : true))
                              .map((action) => (
                                <Button key={`${id}-${action.label}`} variant={action.variant || "outline"} size="sm" onClick={() => action.onClick(item)}>
                                  {action.label}
                                </Button>
                              ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="create">
          {renderCreate ? (
            renderCreate({
              config,
              counterpartyOptions,
              itemOptions,
              references,
              extraFields,
              defaultInitialState: createInitialState || { header: {}, lines: [] },
              onCancel: () => setTab("list"),
              onCreate: async (state) => {
                await onCreateDraft(state);
                setTab("list");
              },
            })
          ) : (
            <DocumentEditor
              title={`Create ${title.toLowerCase().slice(0, -1)}`}
              config={config}
              mode="create"
              counterpartyOptions={counterpartyOptions}
              itemOptions={itemOptions}
              references={references}
              extraFields={extraFields}
              initialState={createInitialState || { header: {}, lines: [] }}
              onCancel={() => setTab("list")}
              onSave={async (state) => {
                await onCreateDraft(state);
                setTab("list");
              }}
              saveLabel="Create draft"
            />
          )}
        </TabsContent>

        <TabsContent value="view">
          {selectedId ? (
            isDetailLoading ? (
              <LoadingState title={title} message="Loading document..." />
            ) : detail ? (
              <DocumentDetailView
                config={config}
                title={`${title.toLowerCase().slice(0, -1)} detail`}
                status={detail.status || null}
                documentNo={detail.documentNo || null}
                header={detail.header}
                counterpartyOptions={counterpartyOptions}
                itemOptions={itemOptions}
                lines={detail.lines}
                totals={detail.totals}
                references={references}
                extraFields={extraFields}
              />
            ) : (
              <EmptyState title="No document loaded" description="Select a document from the list to view details." />
            )
          ) : (
            <EmptyState title="No document selected" description="Select a document from the list to view details." />
          )}
        </TabsContent>

        <TabsContent value="edit">
          {selectedId && onUpdateDraft ? (
            isDetailLoading ? (
              <LoadingState title={title} message="Loading draft..." />
            ) : detail ? (
              <DocumentEditor
                title={`Edit ${title.toLowerCase().slice(0, -1)}`}
                config={config}
                mode="edit"
                counterpartyOptions={counterpartyOptions}
                itemOptions={itemOptions}
                references={references}
                extraFields={extraFields}
                initialState={editorInitialState}
                onCancel={() => setTab("list")}
                onSave={async (state) => {
                  await onUpdateDraft(selectedId, state);
                  setTab("list");
                }}
                saveLabel="Save draft"
              />
            ) : (
              <EmptyState title="No draft loaded" description="Select a draft document from the list to edit." />
            )
          ) : (
            <EmptyState title="Editing not available" description="This document type does not support draft edits via the current API." />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

