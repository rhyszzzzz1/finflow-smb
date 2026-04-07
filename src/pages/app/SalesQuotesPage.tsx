import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useMasterData } from "@/hooks/useMasterData";
import { useSalesQuotes } from "@/hooks/useSalesQuotes";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { salesQuoteApi } from "@/services/api";

export const SalesQuotesPage = () => {
  const { customerOptions, itemOptions } = useMasterData();
  const { salesQuotes, isLoading, createDraft, sendQuote, acceptQuote, convertToOrder, voidQuote } = useSalesQuotes();

  const config: DocumentTypeConfig = {
    type: "sales_quote",
    counterpartyLabel: "Customer",
    counterpartyField: "customer_id",
    dateField: "quote_date",
    allowServices: true,
    unitAmountLabel: "Unit price",
    quantityLabel: "Quantity",
    showDiscounts: false,
    showTaxRate: false,
    supportsSources: false,
    supportsUnitPrice: true,
    supportsUnitCost: false,
  };

  return (
    <DocumentWorkflowPage
      title="Sales Quotes"
      description="Prepare estimates, send them to customers, and convert accepted quotes into sales orders."
      config={config}
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
      counterpartyOptions={customerOptions}
      itemOptions={itemOptions}
      extraFields={[
        { key: "valid_until", label: "Valid Until", type: "date", placeholder: "Optional" },
      ]}
      createInitialState={{
        header: { customer_id: "", quote_date: today(), valid_until: today(), notes: "" },
        lines: [],
      }}
      fetchById={salesQuoteApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.status,
        documentNo: full.quote_number || full.quote_no || full.id,
        header: {
          customer_id: full.customer_id,
          quote_date: full.quote_date,
          valid_until: full.valid_until,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          customer_id: full.customer_id || "",
          quote_date: full.quote_date || today(),
          valid_until: full.valid_until || "",
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createDraft({
          customer_id: state.header.customer_id,
          quote_date: state.header.quote_date,
          valid_until: state.header.valid_until || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
