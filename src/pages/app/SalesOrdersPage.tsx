import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const SalesOrdersPage = () => {
  const { customerOptions, itemOptions, salesQuoteOptions } = useMasterData();
  const { salesOrders, isLoading, createDraft, acceptOrder, convertToInvoice, voidOrder } = useSalesOrders();

  return (
    <WorkflowDocumentPage
      title="Sales Orders"
      description="Track accepted commercial commitments before they become posted sales invoices."
      dialogTitle="Create Sales Order"
      createLabel="New Sales Order"
      isLoading={isLoading}
      items={salesOrders}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.order_number || item.order_no || item.id}
      getCounterpartyName={(item: any) => item.customer_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.order_date}
      getTotalAmount={(item: any) => Number(item.total_amount || 0)}
      columns={[
        { header: "Quote", render: (item: any) => item.sales_quote_number || item.quote_number || "-" },
        { header: "Invoiced Qty", align: "right", render: (item: any) => Number(item.invoiced_quantity || 0).toFixed(2) },
      ]}
      actions={[
        {
          label: "Mark accepted",
          onClick: (item: any) => acceptOrder(item.id),
          visible: (item: any) => statusVisible(item.status, "draft"),
        },
        { label: "Convert to Invoice", onClick: (item: any) => convertToInvoice(item.id), visible: (item: any) => statusVisible(item.status, "accepted") },
        { label: "Void", onClick: (item: any) => voidOrder(item.id), visible: (item: any) => !statusVisible(item.status, "void", "converted"), variant: "destructive" },
      ]}
      stats={[
        { label: "Draft Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "draft")).length) },
        { label: "Accepted Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "accepted")).length) },
        { label: "Converted Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "converted")).length) },
        { label: "Open Orders", value: String(salesOrders.filter((order: any) => !statusVisible(order.status, "void", "converted")).length) },
      ]}
      initialValues={{
        customer_id: "",
        sales_quote_id: "",
        order_date: today(),
        expected_invoice_date: today(),
        description: "",
        quantity: "1",
        unit_price: "0",
        item_id: "",
        notes: "",
      }}
      buildFields={() => [
        { key: "customer_id", label: "Customer", type: "select", required: true, options: customerOptions },
        { key: "sales_quote_id", label: "Source Quote", type: "select", options: salesQuoteOptions, placeholder: "Optional quote link" },
        { key: "order_date", label: "Order Date", type: "date", required: true },
        { key: "expected_invoice_date", label: "Expected Invoice Date", type: "date" },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional item master link" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Ordered Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_price", label: "Unit Price", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createDraft({
          customer_id: values.customer_id,
          sales_quote_id: values.sales_quote_id || null,
          order_date: values.order_date,
          expected_invoice_date: values.expected_invoice_date || null,
          notes: values.notes || null,
          lines: [
            {
              ...buildSingleLine({
                description: values.description,
                quantity: values.quantity,
                unitPrice: values.unit_price,
                itemId: values.item_id || undefined,
              }),
              ordered_quantity: Number(values.quantity || 0),
            },
          ],
        })
      }
    />
  );
};
