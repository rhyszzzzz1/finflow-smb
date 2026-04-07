import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseBills } from "@/hooks/usePurchaseBills";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

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

  return (
    <WorkflowDocumentPage
      title="Purchase Bills"
      description="Handle direct supplier bills and GRN-linked billing while keeping AP and GRNI behavior visible."
      dialogTitle="Create Purchase Bill"
      createLabel="New Purchase Bill"
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
      initialValues={{
        vendor_id: "",
        purchase_order_id: "",
        goods_receipt_id: "",
        bill_date: today(),
        due_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_cost: "0",
        notes: "",
      }}
      buildFields={() => [
        { key: "vendor_id", label: "Vendor", type: "select", required: true, options: vendorOptions },
        { key: "purchase_order_id", label: "Purchase Order", type: "select", options: purchaseOrderOptions, placeholder: "Optional PO link" },
        { key: "goods_receipt_id", label: "Goods Receipt", type: "select", options: goodsReceiptOptions, placeholder: "Optional GRN link" },
        { key: "bill_date", label: "Bill Date", type: "date", required: true },
        { key: "due_date", label: "Due Date", type: "date" },
        { key: "item_id", label: "Inventory Item", type: "select", required: true, options: itemOptions, placeholder: "Select billed inventory item" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_cost", label: "Unit Cost", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          vendor_id: values.vendor_id,
          purchase_order_id: values.purchase_order_id || null,
          goods_receipt_id: values.goods_receipt_id || null,
          bill_date: values.bill_date,
          due_date: values.due_date || null,
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
          purchase_order_id: values.purchase_order_id || null,
          goods_receipt_id: values.goods_receipt_id || null,
          bill_date: values.bill_date,
          due_date: values.due_date || null,
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
          purchase_order_id: item.purchase_order_id || "",
          goods_receipt_id: item.goods_receipt_id || "",
          bill_date: item.bill_date || today(),
          due_date: item.due_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.quantity ?? "1"),
          unit_cost: String(line.unit_cost ?? "0"),
          notes: item.notes || "",
        };
      }}
    />
  );
};
