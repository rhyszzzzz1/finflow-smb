import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { purchaseOrderApi } from "@/services/api";

export const PurchaseOrdersPage = () => {
  const { vendorOptions, itemOptions } = useMasterData();
  const { purchaseOrders, isLoading, createDraft, updateDraft, approveOrder, voidOrder } = usePurchaseOrders();

  const config: DocumentTypeConfig = {
    type: "purchase_order",
    counterpartyLabel: "Vendor",
    counterpartyField: "vendor_id",
    dateField: "order_date",
    allowServices: true,
    unitAmountLabel: "Unit cost",
    quantityLabel: "Ordered qty",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: false,
    supportsUnitPrice: false,
    supportsUnitCost: true,
  };

  return (
    <DocumentWorkflowPage
      title="Purchase Orders"
      description="Prepare supplier orders before receiving stock or matching supplier invoices."
      config={config}
      isLoading={isLoading}
      items={purchaseOrders}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.po_number || item.order_number || item.id}
      getCounterpartyName={(item: any) => item.vendor_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.order_date}
      getTotalAmount={(item: any) => Number(item.total_amount || 0)}
      columns={[
        { header: "Expected Date", render: (item: any) => item.expected_date || "-" },
        { header: "Received Qty", align: "right", render: (item: any) => Number(item.received_quantity || 0).toFixed(2) },
      ]}
      actions={[
        { label: "Approve", onClick: (item: any) => approveOrder(item.id), visible: (item: any) => statusVisible(item.status, "draft") },
        { label: "Void", onClick: (item: any) => voidOrder(item.id), visible: (item: any) => !statusVisible(item.status, "void", "approved"), variant: "destructive" },
      ]}
      counterpartyOptions={vendorOptions}
      itemOptions={itemOptions}
      extraFields={[{ key: "expected_date", label: "Expected Date", type: "date" }]}
      createInitialState={{
        header: { vendor_id: "", order_date: today(), expected_date: today(), notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.status, "draft")}
      fetchById={purchaseOrderApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.po_number || full.order_number || full.id,
        header: {
          vendor_id: full.vendor_id,
          order_date: full.order_date,
          expected_date: full.expected_date,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          vendor_id: full.vendor_id || "",
          order_date: full.order_date || today(),
          expected_date: full.expected_date || "",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          vendor_id: state.header.vendor_id,
          order_date: state.header.order_date,
          expected_date: state.header.expected_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateDraft(id, {
          vendor_id: state.header.vendor_id,
          order_date: state.header.order_date,
          expected_date: state.header.expected_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
