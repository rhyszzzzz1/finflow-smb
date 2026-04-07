import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { GoodsReceiptCreateFlow } from "@/components/procurement/GoodsReceiptCreateFlow";
import { useGoodsReceipts } from "@/hooks/useGoodsReceipts";
import { useMasterData } from "@/hooks/useMasterData";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { goodsReceiptApi } from "@/services/api";

export const GoodsReceiptsPage = () => {
  const { vendorOptions, itemOptions, purchaseOrderOptions } = useMasterData();
  const { goodsReceipts, isLoading, createDraft, updateDraft, postReceipt, voidReceipt } = useGoodsReceipts();

  const config: DocumentTypeConfig = {
    type: "goods_receipt",
    counterpartyLabel: "Vendor",
    counterpartyField: "vendor_id",
    dateField: "receipt_date",
    allowServices: false,
    unitAmountLabel: "Unit cost",
    quantityLabel: "Received qty",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: true,
    supportsUnitPrice: false,
    supportsUnitCost: true,
  };

  return (
    <DocumentWorkflowPage
      title="Goods Receipts"
      description="Record received inventory operationally and financially before supplier bills arrive."
      config={config}
      isLoading={isLoading}
      items={goodsReceipts}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.receipt_number || item.id}
      getCounterpartyName={(item: any) => item.vendor_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.receipt_date}
      getTotalAmount={(item: any) => Number(item.total_amount || item.subtotal_amount || 0)}
      columns={[
        { header: "Purchase Order", render: (item: any) => item.purchase_order_number || item.purchase_order_id || "-" },
        { header: "Billed Qty", align: "right", render: (item: any) => Number(item.billed_quantity || 0).toFixed(2) },
      ]}
      actions={[
        { label: "Post", onClick: (item: any) => postReceipt(item.id), visible: (item: any) => statusVisible(item.status, "draft", "approved") },
        { label: "Void", onClick: (item: any) => voidReceipt(item.id), visible: (item: any) => !statusVisible(item.status, "void", "posted"), variant: "destructive" },
      ]}
      counterpartyOptions={vendorOptions}
      itemOptions={itemOptions}
      references={{ sourcePurchaseOrderOptions: purchaseOrderOptions }}
      createInitialState={{
        header: { vendor_id: "", purchase_order_id: "", receipt_date: today(), notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.status, "draft")}
      fetchById={goodsReceiptApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.receipt_number || full.id,
        header: {
          vendor_id: full.vendor_id,
          purchase_order_id: full.purchase_order_id,
          receipt_date: full.receipt_date,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          vendor_id: full.vendor_id || "",
          purchase_order_id: full.purchase_order_id || "",
          receipt_date: full.receipt_date || today(),
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          vendor_id: state.header.vendor_id,
          purchase_order_id: state.header.purchase_order_id || null,
          receipt_date: state.header.receipt_date,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateDraft(id, {
          vendor_id: state.header.vendor_id,
          purchase_order_id: state.header.purchase_order_id || null,
          receipt_date: state.header.receipt_date,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      renderCreate={({ config, counterpartyOptions, itemOptions, references, onCancel, onCreate }) => (
        <GoodsReceiptCreateFlow
          config={config}
          vendorOptions={counterpartyOptions}
          itemOptions={itemOptions}
          purchaseOrderOptions={references?.sourcePurchaseOrderOptions || []}
          onCancel={onCancel}
          onCreate={onCreate}
        />
      )}
    />
  );
};
