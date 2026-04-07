import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesCreditNotes } from "@/hooks/useSalesCreditNotes";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const SalesCreditNotesPage = () => {
  const { customerOptions, itemOptions, salesInvoiceOptions } = useMasterData();
  const { salesCreditNotes, isLoading, createDraft, updateDraft, approveCreditNote, postCreditNote, voidCreditNote } = useSalesCreditNotes();

  return (
    <WorkflowDocumentPage
      title="Sales Credit Notes"
      description="Record customer-side reversals and invoice adjustments without burying them inside invoice screens."
      dialogTitle="Create Sales Credit Note"
      createLabel="New Credit Note"
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
        { label: "Approve", onClick: (item: any) => approveCreditNote(item.id), visible: (item: any) => statusVisible(item.status, "draft") },
        { label: "Post", onClick: (item: any) => postCreditNote(item.id), visible: (item: any) => statusVisible(item.status, "approved") },
        { label: "Void", onClick: (item: any) => voidCreditNote(item.id), visible: (item: any) => !statusVisible(item.status, "void", "posted"), variant: "destructive" },
      ]}
      initialValues={{
        customer_id: "",
        related_sales_invoice_id: "",
        credit_note_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_price: "0",
        return_to_stock: "no",
        notes: "",
      }}
      buildFields={() => [
        { key: "customer_id", label: "Customer", type: "select", required: true, options: customerOptions },
        { key: "related_sales_invoice_id", label: "Related Invoice", type: "select", options: salesInvoiceOptions, placeholder: "Optional reference invoice" },
        { key: "credit_note_date", label: "Credit Note Date", type: "date", required: true },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional returned item" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_price", label: "Unit Price", type: "number", required: true, step: "0.01" },
        { key: "return_to_stock", label: "Return to Stock", type: "select", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          customer_id: values.customer_id,
          related_sales_invoice_id: values.related_sales_invoice_id || null,
          credit_note_date: values.credit_note_date,
          return_to_stock: values.return_to_stock === "yes",
          notes: values.notes || null,
          lines: [
            buildSingleLine({
              description: values.description,
              quantity: values.quantity,
              unitPrice: values.unit_price,
              itemId: values.item_id || undefined,
            }),
          ],
        })
      }
      onUpdate={(id, values) =>
        updateDraft(id, {
          customer_id: values.customer_id,
          related_sales_invoice_id: values.related_sales_invoice_id || null,
          credit_note_date: values.credit_note_date,
          return_to_stock: values.return_to_stock === "yes",
          notes: values.notes || null,
          lines: [
            buildSingleLine({
              description: values.description,
              quantity: values.quantity,
              unitPrice: values.unit_price,
              itemId: values.item_id || undefined,
            }),
          ],
        })
      }
      toEditValues={(item: any) => {
        const line = item.lines?.[0] || {};
        return {
          customer_id: item.customer_id || "",
          related_sales_invoice_id: item.related_sales_invoice_id || "",
          credit_note_date: item.credit_note_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.quantity ?? "1"),
          unit_price: String(line.unit_price ?? "0"),
          return_to_stock: item.return_to_stock ? "yes" : "no",
          notes: item.notes || "",
        };
      }}
    />
  );
};
