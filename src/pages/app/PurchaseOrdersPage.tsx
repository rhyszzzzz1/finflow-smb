import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { usePurchaseOrders } from "@/hooks/usePurchaseOrders";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const PurchaseOrdersPage = () => {
  const { vendorOptions, itemOptions } = useMasterData();
  const { purchaseOrders, isLoading, createDraft, updateDraft, approveOrder, voidOrder } = usePurchaseOrders();

  return (
    <WorkflowDocumentPage
      title="Purchase Orders"
      description="Prepare supplier orders before receiving stock or matching supplier invoices."
      dialogTitle="Create Purchase Order"
      createLabel="New Purchase Order"
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
      initialValues={{
        vendor_id: "",
        order_date: today(),
        expected_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_cost: "0",
        notes: "",
      }}
      buildFields={() => [
        { key: "vendor_id", label: "Vendor", type: "select", required: true, options: vendorOptions },
        { key: "order_date", label: "Order Date", type: "date", required: true },
        { key: "expected_date", label: "Expected Date", type: "date" },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional item master link" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Ordered Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_cost", label: "Unit Cost", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          vendor_id: values.vendor_id,
          order_date: values.order_date,
          expected_date: values.expected_date || null,
          notes: values.notes || null,
          lines: [
            {
              ...buildSingleLine({
                description: values.description,
                quantity: values.quantity,
                unitCost: values.unit_cost,
                itemId: values.item_id || undefined,
              }),
              ordered_quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
      onUpdate={(id, values) =>
        updateDraft(id, {
          vendor_id: values.vendor_id,
          order_date: values.order_date,
          expected_date: values.expected_date || null,
          notes: values.notes || null,
          lines: [
            {
              ...buildSingleLine({
                description: values.description,
                quantity: values.quantity,
                unitCost: values.unit_cost,
                itemId: values.item_id || undefined,
              }),
              ordered_quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
      toEditValues={(item: any) => {
        const line = item.lines?.[0] || {};
        return {
          vendor_id: item.vendor_id || "",
          order_date: item.order_date || today(),
          expected_date: item.expected_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.ordered_quantity ?? line.quantity ?? "1"),
          unit_cost: String(line.unit_cost ?? "0"),
          notes: item.notes || "",
        };
      }}
    />
  );
};
