import { useCallback } from "react";
import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig, SelectOption } from "@/components/accounting/document-editor/documentTypes";
import { inventoryApi, purchaseOrderApi } from "@/services/api";

export const PurchaseOrdersPage = () => {
  const { vendorOptions, itemOptions } = useMasterData();
  const { purchaseOrders, isLoading, createDraft, updateDraft, approveOrder, voidOrder } = usePurchaseOrders();

  const resolveItemOptionsForVendor = useCallback(async (vendorRef: string) => {
    const data = await inventoryApi.getItemsForPurchase(vendorRef);
    const rows = Array.isArray(data?.items) ? data.items : [];
    const options: SelectOption[] = rows.map((row: any) => ({
      value: String(row.id),
      label: `${row.name || "Item"}${row.sku ? ` (${row.sku})` : ""}${row.vendor_sku ? ` — supplier SKU: ${row.vendor_sku}` : ""}`,
      meta: row,
    }));
    return { filterActive: Boolean(data?.filterActive), options };
  }, []);

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
    itemColumnLabel: "Your item master",
    itemColumnHint:
      "Optional. Pick a vendor first: if you linked items to them in Inventory, only those show here (you can show all). Otherwise use Description.",
    itemSelectPlaceholder: "Optional internal SKU",
  };

  return (
    <DocumentWorkflowPage
      title="Purchase Orders"
      description="Order from a vendor using line description, quantity, and unit cost — that is what you ask them to supply. Linking an internal item is optional: it helps goods receipts hit the right stock record and is separate from anything the vendor lists in their own inventory. Tie items to suppliers under Inventory when you use registered vendors."
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
        {
          label: "Approve Purchase Order",
          onClick: (item: any) => approveOrder(item.id),
          visible: (item: any) => statusVisible(item.status, "draft"),
          confirm: {
            title: "Approve purchase order",
            confirmLabel: "Approve PO",
            description: "Approval signals the order is ready to be issued and received against.",
          },
        },
        {
          label: "Void Purchase Order",
          onClick: (item: any) => voidOrder(item.id),
          visible: (item: any) => !statusVisible(item.status, "void", "approved"),
          variant: "destructive",
          confirm: {
            title: "Void purchase order",
            confirmLabel: "Void PO",
            description: "Void only when you must cancel the order. If partially received, review stock receipts first.",
            variant: "destructive",
          },
        },
      ]}
      counterpartyOptions={vendorOptions}
      itemOptions={itemOptions}
      resolveItemOptionsForVendor={resolveItemOptionsForVendor}
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
