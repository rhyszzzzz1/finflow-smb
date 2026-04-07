import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

export const SalesQuotesPage = () => {
  const { customerOptions, itemOptions } = useMasterData();
  const { salesQuotes, isLoading, createDraft, sendQuote, acceptQuote, convertToOrder, voidQuote } = useSalesQuotes();

  return (
    <WorkflowDocumentPage
      title="Sales Quotes"
      description="Prepare estimates, send them to customers, and convert accepted quotes into sales orders."
      dialogTitle="Create Sales Quote"
      createLabel="New Quote"
      isLoading={isLoading}
      items={salesQuotes}
      getItemId={(item: any) => item.id}
      getStatus={(item: any) => item.status}
      getDocumentNo={(item: any) => item.quote_number || item.quote_no || item.id}
      getCounterpartyName={(item: any) => item.customer_name || item.counterparty_name}
      getPrimaryDate={(item: any) => item.quote_date}
      getTotalAmount={(item: any) => Number(item.total_amount || 0)}
      columns={[
        { header: "Valid Until", render: (item: any) => item.valid_until || "-" },
        { header: "Converted", align: "center", render: (item: any) => item.converted_order_id || item.sales_order_id ? "Yes" : "No" },
      ]}
      actions={[
        { label: "Send", onClick: (item: any) => sendQuote(item.id), visible: (item: any) => statusVisible(item.status, "draft") },
        {
          label: "Mark accepted",
          onClick: (item: any) => acceptQuote(item.id),
          visible: (item: any) => statusVisible(item.status, "draft", "sent"),
        },
        { label: "Convert to Order", onClick: (item: any) => convertToOrder(item.id), visible: (item: any) => statusVisible(item.status, "accepted") },
        { label: "Void", onClick: (item: any) => voidQuote(item.id), visible: (item: any) => !statusVisible(item.status, "void", "converted"), variant: "destructive" },
      ]}
      stats={[
        { label: "Draft Quotes", value: String(salesQuotes.filter((quote: any) => statusVisible(quote.status, "draft")).length) },
        { label: "Sent Quotes", value: String(salesQuotes.filter((quote: any) => statusVisible(quote.status, "sent")).length) },
        { label: "Accepted Quotes", value: String(salesQuotes.filter((quote: any) => statusVisible(quote.status, "accepted")).length) },
        { label: "Converted Quotes", value: String(salesQuotes.filter((quote: any) => statusVisible(quote.status, "converted")).length) },
      ]}
      initialValues={{
        customer_id: "",
        quote_date: today(),
        valid_until: today(),
        description: "",
        quantity: "1",
        unit_price: "0",
        item_id: "",
        notes: "",
      }}
      buildFields={() => [
        { key: "customer_id", label: "Customer", type: "select", required: true, options: customerOptions },
        { key: "quote_date", label: "Quote Date", type: "date", required: true },
        { key: "valid_until", label: "Valid Until", type: "date" },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional stock/service item" },
        { key: "description", label: "Description", type: "text", required: true, placeholder: "Workscope or item summary" },
        { key: "quantity", label: "Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_price", label: "Unit Price", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea", placeholder: "Commercial notes or terms" },
      ]}
      onCreate={(values) =>
        createDraft({
          customer_id: values.customer_id,
          quote_date: values.quote_date,
          valid_until: values.valid_until || null,
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
    />
  );
};
