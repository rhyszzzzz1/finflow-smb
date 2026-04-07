import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { PurchaseBillCreateFlow } from "@/components/procurement/PurchaseBillCreateFlow";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseBills } from "@/hooks/usePurchaseBills";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { purchaseBillApi } from "@/services/api";

export const PurchaseBillsPage = () => {
  const { vendorOptions, itemOptions, goodsReceiptOptions, purchaseOrderOptions } = useMasterData();
  const {
    purchaseBills,
    isLoading,
    createDraft,
    updateDraft,
    submitBill,
    approveBill,
    rejectBill,
    resubmitBill,
    postBill,
    voidBill,
  } = usePurchaseBills();

  const config: DocumentTypeConfig = {
    type: "purchase_bill",
    counterpartyLabel: "Vendor",
    counterpartyField: "vendor_id",
    dateField: "bill_date",
    allowServices: true,
    unitAmountLabel: "Unit cost",
    quantityLabel: "Quantity",
    showDiscounts: true,
    showTaxRate: true,
    supportsSources: true,
    supportsUnitPrice: false,
    supportsUnitCost: true,
  };

  return (
    <DocumentWorkflowPage
      title="Purchase Bills"
      description="Handle direct supplier bills and GRN-linked billing while keeping AP and GRNI behavior visible."
      config={config}
      isLoading={isLoading}
      items={purchaseBills}
      getItemId={(item) => item.id}
      getStatus={(item) => item.base_status || item.status}
      getDocumentNo={(item) => item.bill_number || item.bill_no || item.id}
      getCounterpartyName={(item) => item.vendor_name || item.counterparty_name}
      getPrimaryDate={(item) => item.bill_date}
      getTotalAmount={(item) => Number(item.total_amount || 0)}
      columns={[
        { header: "GRN Link", render: (item: any) => item.goods_receipt_number || item.goods_receipt_id ? "Against receipt" : "Direct bill" },
        { header: "PO Link", render: (item: any) => item.purchase_order_number || item.purchase_order_id || "-" },
        { header: "Approval", render: (item: any) => item.approval?.status || item.approval_status || "-" },
      ]}
      actions={[
        { label: "Submit", onClick: (item) => submitBill(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "draft", "rejected") },
        { label: "Approve", onClick: (item) => approveBill(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "pending_approval", "draft") },
        { label: "Reject", onClick: (item) => rejectBill(item.id, "Rejected from workflow page"), visible: (item: any) => statusVisible(item.base_status || item.status, "pending_approval") },
        { label: "Resubmit", onClick: (item) => resubmitBill(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "rejected") },
        { label: "Post", onClick: (item) => postBill(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "approved") },
        { label: "Void", onClick: (item) => voidBill(item.id), visible: (item: any) => !statusVisible(item.base_status || item.status, "void", "posted"), variant: "destructive" },
      ]}
      counterpartyOptions={vendorOptions}
      itemOptions={itemOptions}
      references={{ sourcePurchaseOrderOptions: purchaseOrderOptions, sourceGoodsReceiptOptions: goodsReceiptOptions }}
      extraFields={[{ key: "due_date", label: "Due Date", type: "date" }]}
      createInitialState={{
        header: { vendor_id: "", purchase_order_id: "", goods_receipt_id: "", bill_date: today(), due_date: today(), notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.base_status || item.status, "draft", "rejected")}
      fetchById={purchaseBillApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.base_status || full.status,
        documentNo: full.bill_number || full.bill_no || full.id,
        header: {
          vendor_id: full.vendor_id,
          purchase_order_id: full.purchase_order_id,
          goods_receipt_id: full.goods_receipt_id,
          bill_date: full.bill_date,
          due_date: full.due_date,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          vendor_id: full.vendor_id || "",
          purchase_order_id: full.purchase_order_id || "",
          goods_receipt_id: full.goods_receipt_id || "",
          bill_date: full.bill_date || today(),
          due_date: full.due_date || today(),
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          vendor_id: state.header.vendor_id,
          purchase_order_id: state.header.purchase_order_id || null,
          goods_receipt_id: state.header.goods_receipt_id || null,
          bill_date: state.header.bill_date,
          due_date: state.header.due_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateDraft(id, {
          vendor_id: state.header.vendor_id,
          purchase_order_id: state.header.purchase_order_id || null,
          goods_receipt_id: state.header.goods_receipt_id || null,
          bill_date: state.header.bill_date,
          due_date: state.header.due_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      renderCreate={({ config, counterpartyOptions, itemOptions, references, defaultInitialState, onCancel, onCreate }) => (
        <PurchaseBillCreateFlow
          config={config}
          vendorOptions={counterpartyOptions}
          itemOptions={itemOptions}
          goodsReceiptOptions={references?.sourceGoodsReceiptOptions || []}
          purchaseOrderOptions={references?.sourcePurchaseOrderOptions || []}
          onCancel={onCancel}
          onCreate={async (state) => {
            // Enforce bill type semantics by how header + lines are constructed in the flow component.
            await onCreate(state);
          }}
        />
      )}
    />
  );
};
