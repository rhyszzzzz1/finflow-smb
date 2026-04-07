import { DocumentWorkflowPage } from "@/components/accounting/document-editor/DocumentWorkflowPage";
import { useInvoices } from "@/hooks/useInvoices";
import { useMasterData } from "@/hooks/useMasterData";
import { statusVisible, today } from "./documentPageUtils";
import type { DocumentTypeConfig } from "@/components/accounting/document-editor/documentTypes";
import { accountingInvoiceApi } from "@/services/api";

export const SalesInvoicesPage = () => {
  const { customerOptions, itemOptions, salesOrderOptions } = useMasterData();
  const {
    invoices,
    isLoading,
    createInvoice,
    updateInvoice,
    submitInvoice,
    approveInvoice,
    rejectInvoice,
    resubmitInvoice,
    postInvoice,
    voidInvoice,
  } = useInvoices();

  const config: DocumentTypeConfig = {
    type: "sales_invoice",
    counterpartyLabel: "Customer",
    counterpartyField: "customer_id",
    dateField: "invoice_date",
    allowServices: true,
    unitAmountLabel: "Unit price",
    quantityLabel: "Quantity",
    showDiscounts: true,
    showTaxRate: true,
    supportsSources: true,
    supportsUnitPrice: true,
    supportsUnitCost: false,
  };

  return (
    <DocumentWorkflowPage
      title="Sales Invoices"
      description="Manage draft, approval, and posting flows for authoritative sales invoices."
      config={config}
      isLoading={isLoading}
      items={invoices}
      getItemId={(item) => item.id}
      getStatus={(item) => item.base_status || item.status}
      getDocumentNo={(item) => item.invoice_number || item.invoice_no || item.id}
      getCounterpartyName={(item) => item.customer_name || item.counterparty_name}
      getPrimaryDate={(item) => item.invoice_date}
      getTotalAmount={(item) => Number(item.total_amount || 0)}
      columns={[
        { header: "Order", render: (item: any) => item.sales_order_number || item.sales_order_id || "-" },
        { header: "Due Date", render: (item: any) => item.due_date || "-" },
        { header: "Approval", render: (item: any) => item.approval?.status || item.approval_status || "-" },
      ]}
      actions={[
        { label: "Submit", onClick: (item) => submitInvoice(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "draft", "rejected") },
        { label: "Approve", onClick: (item) => approveInvoice(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "pending_approval", "draft") },
        { label: "Reject", onClick: (item) => rejectInvoice(item.id, "Rejected from workflow page"), visible: (item: any) => statusVisible(item.base_status || item.status, "pending_approval") },
        { label: "Resubmit", onClick: (item) => resubmitInvoice(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "rejected") },
        { label: "Post", onClick: (item) => postInvoice(item.id), visible: (item: any) => statusVisible(item.base_status || item.status, "approved") },
        { label: "Void", onClick: (item) => voidInvoice(item.id), visible: (item: any) => !statusVisible(item.base_status || item.status, "void", "posted"), variant: "destructive" },
      ]}
      stats={[
        { label: "Draft", value: String(invoices.filter((invoice) => statusVisible(invoice.base_status || invoice.status, "draft")).length) },
        { label: "Pending Approval", value: String(invoices.filter((invoice) => statusVisible(invoice.base_status || invoice.status, "pending_approval")).length) },
        { label: "Approved", value: String(invoices.filter((invoice) => statusVisible(invoice.base_status || invoice.status, "approved")).length) },
        { label: "Posted", value: String(invoices.filter((invoice) => statusVisible(invoice.base_status || invoice.status, "posted")).length) },
      ]}
      counterpartyOptions={customerOptions}
      itemOptions={itemOptions}
      references={{ sourceSalesOrderOptions: salesOrderOptions }}
      extraFields={[{ key: "due_date", label: "Due Date", type: "date" }]}
      createInitialState={{
        header: { customer_id: "", sales_order_id: "", invoice_date: today(), due_date: today(), notes: "" },
        lines: [],
      }}
      canEditDraft={(item: any) => statusVisible(item.base_status || item.status, "draft", "rejected")}
      fetchById={accountingInvoiceApi.getById}
      toDetailPayload={(full: any) => ({
        id: full.id,
        status: full.base_status || full.status,
        documentNo: full.invoice_number || full.invoice_no || full.id,
        header: {
          customer_id: full.customer_id,
          invoice_date: full.invoice_date,
          due_date: full.due_date,
          sales_order_id: full.sales_order_id,
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
        totals: { subtotal: full.subtotal_amount, tax: full.tax_amount, total: full.total_amount },
      })}
      toEditorState={(full: any) => ({
        header: {
          customer_id: full.customer_id || "",
          sales_order_id: full.sales_order_id || "",
          invoice_date: full.invoice_date || today(),
          due_date: full.due_date || today(),
          notes: full.notes || "",
        },
        lines: Array.isArray(full.lines) ? full.lines : [],
      })}
      onCreateDraft={async (state) =>
        createInvoice({
          customer_id: state.header.customer_id,
          sales_order_id: state.header.sales_order_id || null,
          invoice_date: state.header.invoice_date,
          due_date: state.header.due_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
      onUpdateDraft={async (id, state) =>
        updateInvoice(id, {
          customer_id: state.header.customer_id,
          sales_order_id: state.header.sales_order_id || null,
          invoice_date: state.header.invoice_date,
          due_date: state.header.due_date || null,
          notes: state.header.notes || null,
          lines: state.lines,
        })
      }
    />
  );
};
