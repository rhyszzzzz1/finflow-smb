import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useGoodsReceipts } from "@/hooks/useGoodsReceipts";
import { useMasterData } from "@/hooks/useMasterData";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const GoodsReceiptsPage = () => {
  const { vendorOptions, itemOptions, purchaseOrderOptions } = useMasterData();
  const { goodsReceipts, isLoading, createDraft, updateDraft, postReceipt, voidReceipt } = useGoodsReceipts();

  return (
    <WorkflowDocumentPage
      title="Goods Receipts"
      description="Record received inventory operationally and financially before supplier bills arrive."
      dialogTitle="Record Goods Receipt"
      createLabel="New Goods Receipt"
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
      initialValues={{
        vendor_id: "",
        purchase_order_id: "",
        receipt_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_cost: "0",
        notes: "",
      }}
      buildFields={() => [
        { key: "vendor_id", label: "Vendor", type: "select", required: true, options: vendorOptions },
        { key: "purchase_order_id", label: "Purchase Order", type: "select", options: purchaseOrderOptions, placeholder: "Optional PO link" },
        { key: "receipt_date", label: "Receipt Date", type: "date", required: true },
        { key: "item_id", label: "Item", type: "select", required: true, options: itemOptions },
        { key: "description", label: "Description", type: "text", required: true, helpText: "Goods receipt is a receiving workflow and should describe the received line clearly." },
        { key: "quantity", label: "Received Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_cost", label: "Unit Cost", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          vendor_id: values.vendor_id,
          purchase_order_id: values.purchase_order_id || null,
          receipt_date: values.receipt_date,
          notes: values.notes || null,
          lines: [
            {
              ...buildSingleLine({
                description: values.description,
                quantity: values.quantity,
                unitCost: values.unit_cost,
                itemId: values.item_id || undefined,
              }),
              received_quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
      onUpdate={(id, values) =>
        updateDraft(id, {
          vendor_id: values.vendor_id,
          purchase_order_id: values.purchase_order_id || null,
          receipt_date: values.receipt_date,
          notes: values.notes || null,
          lines: [
            {
              ...buildSingleLine({
                description: values.description,
                quantity: values.quantity,
                unitCost: values.unit_cost,
                itemId: values.item_id || undefined,
              }),
              received_quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
      toEditValues={(item: any) => {
        const line = item.lines?.[0] || {};
        return {
          vendor_id: item.vendor_id || "",
          purchase_order_id: item.purchase_order_id || "",
          receipt_date: item.receipt_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.received_quantity ?? line.quantity ?? "1"),
          unit_cost: String(line.unit_cost ?? "0"),
          notes: item.notes || "",
        };
      }}
    />
  );
};
