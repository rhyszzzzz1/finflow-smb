import { WorkflowDocumentPage } from "@/components/accounting/WorkflowDocumentPage";
import { useInvoices } from "@/hooks/useInvoices";
import { useMasterData } from "@/hooks/useMasterData";
import { buildSingleLine, statusVisible, today } from "./documentPageUtils";

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

  return (
    <WorkflowDocumentPage
      title="Sales Invoices"
      description="Manage draft, approval, and posting flows for authoritative sales invoices."
      dialogTitle="Create Sales Invoice"
      createLabel="New Invoice"
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
      initialValues={{
        customer_id: "",
        sales_order_id: "",
        invoice_date: today(),
        due_date: today(),
        item_id: "",
        description: "",
        quantity: "1",
        unit_price: "0",
        notes: "",
      }}
      buildFields={() => [
        { key: "customer_id", label: "Customer", type: "select", required: true, options: customerOptions },
        { key: "sales_order_id", label: "Sales Order", type: "select", options: salesOrderOptions, placeholder: "Optional order link" },
        { key: "invoice_date", label: "Invoice Date", type: "date", required: true },
        { key: "due_date", label: "Due Date", type: "date" },
        { key: "item_id", label: "Item", type: "select", options: itemOptions, placeholder: "Optional stock/service item" },
        { key: "description", label: "Description", type: "text", required: true },
        { key: "quantity", label: "Quantity", type: "number", required: true, step: "0.01" },
        { key: "unit_price", label: "Unit Price", type: "number", required: true, step: "0.01" },
        { key: "notes", label: "Notes", type: "textarea" },
      ]}
      onCreate={(values) =>
        createInvoice({
          customer_id: values.customer_id,
          sales_order_id: values.sales_order_id || null,
          invoice_date: values.invoice_date,
          due_date: values.due_date || null,
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
        updateInvoice(id, {
          customer_id: values.customer_id,
          sales_order_id: values.sales_order_id || null,
          invoice_date: values.invoice_date,
          due_date: values.due_date || null,
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
          sales_order_id: item.sales_order_id || "",
          invoice_date: item.invoice_date || today(),
          due_date: item.due_date || today(),
          item_id: line.item_id || "",
          description: line.description || "",
          quantity: String(line.quantity ?? "1"),
          unit_price: String(line.unit_price ?? "0"),
          notes: item.notes || "",
        };
      }}
    />
  );
};
