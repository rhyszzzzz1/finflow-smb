import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseDebitNotes } from "@/hooks/usePurchaseDebitNotes";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { purchaseDebitNoteApi } from "@/services/api";

export const PurchaseDebitNotesPage = () => {
  const { vendorOptions, itemOptions, purchaseBillOptions } = useMasterData();
  const { purchaseDebitNotes, isLoading, createDraft, updateDraft, approveDebitNote, postDebitNote, voidDebitNote } = usePurchaseDebitNotes();

  const config: DocumentTypeConfig = {
    type: "purchase_debit_note",
    counterpartyLabel: "Vendor",
    counterpartyField: "vendor_id",
    dateField: "debit_note_date",
    allowServices: true,
    unitAmountLabel: "Unit cost",
    quantityLabel: "Quantity",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: true,
    supportsUnitPrice: false,
    supportsUnitCost: true,
  };

  return (
    <DocumentWorkflowPage
      title="Purchase Debit Notes"
      description="Record supplier-side purchase reversals and postable procurement adjustments."
      config={config}
      isLoading={isLoading}
      items={purchaseDebitNotes}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.debit_note_number || item.id}
      getCounterpartyName={(item: any) => item.vendor_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.debit_note_date}
      getTotalAmount={(item: any) => Number(item.total_amount || 0)}
      columns={[
        { header: "Purchase Bill", render: (item: any) => item.related_purchase_bill_number || item.related_purchase_bill_id || "-" },
        { header: "Return Vendor", align: "center", render: (item: any) => item.return_to_vendor ? "Yes" : "No" },
      ]}
      actions={[
        { label: "Approve", onClick: (item: any) => approveDebitNote(item.id), visible: (item: any) => statusVisible(item.status, "draft") },
        { label: "Post", onClick: (item: any) => postDebitNote(item.id), visible: (item: any) => statusVisible(item.status, "approved") },
        { label: "Void", onClick: (item: any) => voidDebitNote(item.id), visible: (item: any) => !statusVisible(item.status, "void", "posted"), variant: "destructive" },
      ]}
      counterpartyOptions={vendorOptions}
      itemOptions={itemOptions}
      references={{ sourcePurchaseBillOptions: purchaseBillOptions }}
      extraFields={[
        {
          key: "return_to_vendor",
          label: "Return to Vendor",
          type: "select",
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        },
      ]}
      createInitialState={{
        header: { vendor_id: "", related_purchase_bill_id: "", debit_note_date: today(), return_to_vendor: "no", notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.status, "draft")}
      fetchById={purchaseDebitNoteApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.debit_note_number || full.id,
        header: {
          vendor_id: full.vendor_id,
          related_purchase_bill_id: full.related_purchase_bill_id,
          debit_note_date: full.debit_note_date,
          return_to_vendor: full.return_to_vendor ? "yes" : "no",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          vendor_id: full.vendor_id || "",
          related_purchase_bill_id: full.related_purchase_bill_id || "",
          debit_note_date: full.debit_note_date || today(),
          return_to_vendor: full.return_to_vendor ? "yes" : "no",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          vendor_id: state.header.vendor_id,
          related_purchase_bill_id: state.header.related_purchase_bill_id || null,
          debit_note_date: state.header.debit_note_date,
          return_to_vendor: state.header.return_to_vendor === "yes",
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateDraft(id, {
          vendor_id: state.header.vendor_id,
          related_purchase_bill_id: state.header.related_purchase_bill_id || null,
          debit_note_date: state.header.debit_note_date,
          return_to_vendor: state.header.return_to_vendor === "yes",
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
