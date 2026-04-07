import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseDebitNotes } from "@/hooks/usePurchaseDebitNotes";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const PurchaseDebitNotesPage = () => {
  const { vendorOptions, itemOptions, purchaseBillOptions } = useMasterData();
  const { purchaseDebitNotes, isLoading, createDraft, updateDraft, approveDebitNote, postDebitNote, voidDebitNote } = usePurchaseDebitNotes();

  return (
    <WorkflowDocumentPage
      title="Purchase Debit Notes"
      description="Record supplier-side purchase reversals and postable procurement adjustments."
      dialogTitle="Create Purchase Debit Note"
      createLabel="New Debit Note"
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
      initialValues={{
        vendor_id: "",
        related_purchase_bill_id: "",
        debit_note_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_cost: "0",
        return_to_vendor: "no",
        notes: "",
      }}
      buildFields={() => [
        { key: "vendor_id", label: "Vendor", type: "select", required: true, options: vendorOptions },
        { key: "related_purchase_bill_id", label: "Related Bill", type: "select", options: purchaseBillOptions, placeholder: "Optional source bill" },
        { key: "debit_note_date", label: "Debit Note Date", type: "date", required: true },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional returned item" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_cost", label: "Unit Cost", type: "number", required: true, step: "0.01" },
        { key: "return_to_vendor", label: "Return to Vendor", type: "select", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          vendor_id: values.vendor_id,
          related_purchase_bill_id: values.related_purchase_bill_id || null,
          debit_note_date: values.debit_note_date,
          return_to_vendor: values.return_to_vendor === "yes",
          notes: values.notes || null,
          lines: [
            buildSingleLine({
              description: values.description,
              quantity: values.quantity,
              unitCost: values.unit_cost,
              itemId: values.item_id || undefined,
            }),
          ],
        })
      }
      onUpdate={(id, values) =>
        updateDraft(id, {
          vendor_id: values.vendor_id,
          related_purchase_bill_id: values.related_purchase_bill_id || null,
          debit_note_date: values.debit_note_date,
          return_to_vendor: values.return_to_vendor === "yes",
          notes: values.notes || null,
          lines: [
            buildSingleLine({
              description: values.description,
              quantity: values.quantity,
              unitCost: values.unit_cost,
              itemId: values.item_id || undefined,
            }),
          ],
        })
      }
      toEditValues={(item: any) => {
        const line = item.lines?.[0] || {};
        return {
          vendor_id: item.vendor_id || "",
          related_purchase_bill_id: item.related_purchase_bill_id || "",
          debit_note_date: item.debit_note_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.quantity ?? "1"),
          unit_cost: String(line.unit_cost ?? "0"),
          return_to_vendor: item.return_to_vendor ? "yes" : "no",
          notes: item.notes || "",
        };
      }}
    />
  );
};
