import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesCreditNotes } from "@/hooks/useSalesCreditNotes";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { salesCreditNoteApi } from "@/services/api";

export const SalesCreditNotesPage = () => {
  const { customerOptions, itemOptions, salesInvoiceOptions } = useMasterData();
  const { salesCreditNotes, isLoading, createDraft, updateDraft, approveCreditNote, postCreditNote, voidCreditNote } = useSalesCreditNotes();

  const config: DocumentTypeConfig = {
    type: "sales_credit_note",
    counterpartyLabel: "Customer",
    counterpartyField: "customer_id",
    dateField: "credit_note_date",
    allowServices: true,
    unitAmountLabel: "Unit price",
    quantityLabel: "Quantity",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: true,
    supportsUnitPrice: true,
    supportsUnitCost: false,
  };

  return (
    <DocumentWorkflowPage
      title="Sales Credit Notes"
      description="Record customer-side reversals and invoice adjustments without burying them inside invoice screens."
      config={config}
      isLoading={isLoading}
      items={salesCreditNotes}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.credit_note_number || item.id}
      getCounterpartyName={(item: any) => item.customer_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.credit_note_date}
      getTotalAmount={(item: any) => Number(item.total_amount || 0)}
      columns={[
        { header: "Invoice", render: (item: any) => item.related_sales_invoice_number || item.related_sales_invoice_id || "-" },
        { header: "Return Stock", align: "center", render: (item: any) => item.return_to_stock ? "Yes" : "No" },
      ]}
      actions={[
        {
          label: "Approve Credit Note",
          onClick: (item: any) => approveCreditNote(item.id),
          visible: (item: any) => statusVisible(item.status, "draft"),
          confirm: {
            title: "Approve sales credit note",
            confirmLabel: "Approve credit note",
            description: "Approving moves the credit note to posting. Confirm invoice references and stock return selection.",
          },
        },
        {
          label: "Post Credit Note",
          onClick: (item: any) => postCreditNote(item.id),
          visible: (item: any) => statusVisible(item.status, "approved"),
          confirm: {
            title: "Post sales credit note",
            confirmLabel: "Post credit note",
            description: "Posting creates the accounting reversal and makes the document read-only.",
          },
        },
        {
          label: "Void Credit Note",
          onClick: (item: any) => voidCreditNote(item.id),
          visible: (item: any) => !statusVisible(item.status, "void", "posted"),
          variant: "destructive",
          confirm: {
            title: "Void sales credit note",
            confirmLabel: "Void credit note",
            description: "Void only when you must cancel this credit note. If posted, a correcting note may be required instead.",
            variant: "destructive",
          },
        },
      ]}
      counterpartyOptions={customerOptions}
      itemOptions={itemOptions}
      references={{ sourceSalesInvoiceOptions: salesInvoiceOptions }}
      extraFields={[
        {
          key: "return_to_stock",
          label: "Return to Stock",
          type: "select",
          options: [
            { value: "no", label: "No" },
            { value: "yes", label: "Yes" },
          ],
        },
      ]}
      createInitialState={{
        header: { customer_id: "", related_sales_invoice_id: "", credit_note_date: today(), return_to_stock: "no", notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.status, "draft")}
      fetchById={salesCreditNoteApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.credit_note_number || full.id,
        header: {
          customer_id: full.customer_id,
          related_sales_invoice_id: full.related_sales_invoice_id,
          credit_note_date: full.credit_note_date,
          return_to_stock: full.return_to_stock ? "yes" : "no",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          customer_id: full.customer_id || "",
          related_sales_invoice_id: full.related_sales_invoice_id || "",
          credit_note_date: full.credit_note_date || today(),
          return_to_stock: full.return_to_stock ? "yes" : "no",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          customer_id: state.header.customer_id,
          related_sales_invoice_id: state.header.related_sales_invoice_id || null,
          credit_note_date: state.header.credit_note_date,
          return_to_stock: state.header.return_to_stock === "yes",
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateDraft(id, {
          customer_id: state.header.customer_id,
          related_sales_invoice_id: state.header.related_sales_invoice_id || null,
          credit_note_date: state.header.credit_note_date,
          return_to_stock: state.header.return_to_stock === "yes",
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
