import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesOrders } from "@/hooks/useSalesOrders";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { salesOrderApi } from "@/services/api";

export const SalesOrdersPage = () => {
  const { customerOptions, itemOptions, salesQuoteOptions } = useMasterData();
  const { salesOrders, isLoading, createDraft, acceptOrder, convertToInvoice, voidOrder } = useSalesOrders();

  const config: DocumentTypeConfig = {
    type: "sales_order",
    counterpartyLabel: "Customer",
    counterpartyField: "customer_id",
    dateField: "order_date",
    allowServices: true,
    unitAmountLabel: "Unit price",
    quantityLabel: "Ordered qty",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: true,
    supportsUnitPrice: true,
    supportsUnitCost: false,
  };

  return (
    <DocumentWorkflowPage
      title="Sales Orders"
      description="Track accepted commercial commitments before they become posted sales invoices."
      config={config}
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
        {
          label: "Void Sales Order",
          onClick: (item: any) => voidOrder(item.id),
          visible: (item: any) => !statusVisible(item.status, "void", "converted"),
          variant: "destructive",
          confirm: {
            title: "Void sales order",
            confirmLabel: "Void order",
            description: "Void only when you must cancel this commercial commitment. If already converted, void the resulting document instead.",
            variant: "destructive",
          },
        },
      ]}
      stats={[
        { label: "Draft Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "draft")).length) },
        { label: "Accepted Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "accepted")).length) },
        { label: "Converted Orders", value: String(salesOrders.filter((order: any) => statusVisible(order.status, "converted")).length) },
        { label: "Open Orders", value: String(salesOrders.filter((order: any) => !statusVisible(order.status, "void", "converted")).length) },
      ]}
      counterpartyOptions={customerOptions}
      itemOptions={itemOptions}
      references={{ sourceSalesQuoteOptions: salesQuoteOptions }}
      extraFields={[
        { key: "expected_invoice_date", label: "Expected Invoice Date", type: "date" },
      ]}
      createInitialState={{
        header: { customer_id: "", sales_quote_id: "", order_date: today(), expected_invoice_date: today(), notes: "" },
        lines: [],
      }}
      fetchById={salesOrderApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.order_number || full.order_no || full.id,
        header: {
          customer_id: full.customer_id,
          order_date: full.order_date,
          expected_invoice_date: full.expected_invoice_date,
          sales_quote_id: full.sales_quote_id,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          customer_id: full.customer_id || "",
          sales_quote_id: full.sales_quote_id || "",
          order_date: full.order_date || today(),
          expected_invoice_date: full.expected_invoice_date || "",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          customer_id: state.header.customer_id,
          sales_quote_id: state.header.sales_quote_id || null,
          order_date: state.header.order_date,
          expected_invoice_date: state.header.expected_invoice_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
