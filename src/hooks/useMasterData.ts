import { useEffect, useState } from "react";
import { accountingInvoiceApi, clientsApi, goodsReceiptApi, inventoryApi, purchaseBillApi, purchaseOrderApi, salesOrderApi, salesQuoteApi } from "@/services/api";
import { toast } from "sonner";

type Option = {
  value: string;
  label: string;
  meta?: any;
};

const toOptions = (rows: any[], idKey: string, labelBuilder: (row: any) => string): Option[] =>
  rows.map((row) => ({
    value: String(row[idKey]),
    label: labelBuilder(row),
    meta: row,
  }));

export const useMasterData = () => {
  const [customers, setCustomers] = useState<Option[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [items, setItems] = useState<Option[]>([]);
  const [warehouses, setWarehouses] = useState<Option[]>([]);
  const [registeredAccounts, setRegisteredAccounts] = useState<Option[]>([]);
  const [salesQuotes, setSalesQuotes] = useState<Option[]>([]);
  const [salesOrders, setSalesOrders] = useState<Option[]>([]);
  const [salesInvoices, setSalesInvoices] = useState<Option[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<Option[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<Option[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAll = async () => {
    try {
      const [
        customerRows,
        vendorRows,
        itemRows,
        warehouseRows,
        accountRows,
        quoteRows,
        orderRows,
        invoiceRows,
        purchaseOrderRows,
        receiptRows,
        purchaseBillRows,
      ] = await Promise.allSettled([
        clientsApi.getClientList(),
        clientsApi.getVendorList(),
        inventoryApi.getItems(),
        inventoryApi.getWarehouses(),
        clientsApi.getRegisteredAccounts(),
        salesQuoteApi.list(),
        salesOrderApi.list(),
        accountingInvoiceApi.list(),
        purchaseOrderApi.list(),
        goodsReceiptApi.list(),
        purchaseBillApi.list(),
      ]);

      const unwrap = (result: PromiseSettledResult<any>) =>
        result.status === "fulfilled" ? result.value : [];

      const customerList = Array.isArray(unwrap(customerRows)) ? unwrap(customerRows) : unwrap(customerRows)?.data || [];
      const vendorList = Array.isArray(unwrap(vendorRows)) ? unwrap(vendorRows) : unwrap(vendorRows)?.data || [];
      const itemList = Array.isArray(unwrap(itemRows)) ? unwrap(itemRows) : unwrap(itemRows)?.data || [];
      const warehouseList = Array.isArray(unwrap(warehouseRows)) ? unwrap(warehouseRows) : unwrap(warehouseRows)?.data || [];
      const accountList = Array.isArray(unwrap(accountRows)) ? unwrap(accountRows) : unwrap(accountRows)?.data || [];
      const quoteList = Array.isArray(unwrap(quoteRows)) ? unwrap(quoteRows) : unwrap(quoteRows)?.data || [];
      const orderList = Array.isArray(unwrap(orderRows)) ? unwrap(orderRows) : unwrap(orderRows)?.data || [];
      const invoiceList = Array.isArray(unwrap(invoiceRows)) ? unwrap(invoiceRows) : unwrap(invoiceRows)?.data || [];
      const purchaseOrderList = Array.isArray(unwrap(purchaseOrderRows)) ? unwrap(purchaseOrderRows) : unwrap(purchaseOrderRows)?.data || [];
      const receiptList = Array.isArray(unwrap(receiptRows)) ? unwrap(receiptRows) : unwrap(receiptRows)?.data || [];
      const purchaseBillList = Array.isArray(unwrap(purchaseBillRows)) ? unwrap(purchaseBillRows) : unwrap(purchaseBillRows)?.data || [];

      // Prefer canonical counterparty id so Select values match persisted document headers (vendor_id / client_id).
      const buildUniqueOptions = (rows: any[], mapRow: (row: any) => Option): Option[] => {
        const seen = new Set<string>();
        const out: Option[] = [];
        for (const row of rows) {
          const opt = mapRow(row);
          const v = String(opt.value || "").trim();
          if (!v || seen.has(v)) continue;
          seen.add(v);
          out.push({ ...opt, value: v, label: String(opt.label || "").trim() || v });
        }
        return out;
      };

      setCustomers(
        buildUniqueOptions(customerList, (row: any) => ({
          value: String(row.counterparty_id || row.id),
          label: String(
            row.client_name || row.display_name || row.customer_name || row.name || row.email || row.counterparty_id || row.id
          ),
          meta: row,
        }))
      );
      setVendors(
        buildUniqueOptions(vendorList, (row: any) => ({
          value: String(row.counterparty_id || row.id),
          label: String(row.vendor_name || row.display_name || row.name || row.email || row.counterparty_id || row.id),
          meta: row,
        }))
      );
      setItems(toOptions(itemList, "id", (row) => `${row.name || row.product_name || row.description || "Unnamed Item"}${row.sku ? ` (${row.sku})` : ""}`));
      setWarehouses(toOptions(warehouseList, "id", (row) => `${row.name || row.warehouse_name || row.code || row.id}${row.code ? ` (${row.code})` : ""}`));
      setRegisteredAccounts(toOptions(accountList, "id", (row) => `${row.business_name || row.name || row.email}${row.email ? ` (${row.email})` : ""}`));
      setSalesQuotes(toOptions(quoteList, "id", (row) => row.quote_number || row.quote_no || row.id));
      setSalesOrders(toOptions(orderList, "id", (row) => row.order_number || row.order_no || row.id));
      setSalesInvoices(toOptions(invoiceList, "id", (row) => row.invoice_number || row.invoice_no || row.id));
      setPurchaseOrders(toOptions(purchaseOrderList, "id", (row) => row.order_number || row.order_no || row.id));
      setGoodsReceipts(toOptions(receiptList, "id", (row) => row.receipt_number || row.receipt_no || row.id));
      setPurchaseBills(toOptions(purchaseBillList, "id", (row) => row.bill_number || row.bill_no || row.id));

      const failures = [
        customerRows,
        vendorRows,
        itemRows,
        warehouseRows,
        accountRows,
        quoteRows,
        orderRows,
        invoiceRows,
        purchaseOrderRows,
        receiptRows,
        purchaseBillRows,
      ].filter((result) => result.status === "rejected");

      if (failures.length > 0) {
        console.warn("Workflow master data partially failed to load", failures);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to load workflow master data");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  return {
    customers,
    customerOptions: customers,
    vendors,
    vendorOptions: vendors,
    items,
    itemOptions: items,
    warehouses,
    warehouseOptions: warehouses,
    registeredAccounts,
    registeredAccountOptions: registeredAccounts,
    salesQuotes,
    salesQuoteOptions: salesQuotes,
    salesOrders,
    salesOrderOptions: salesOrders,
    salesInvoices,
    salesInvoiceOptions: salesInvoices,
    purchaseOrders,
    purchaseOrderOptions: purchaseOrders,
    goodsReceipts,
    goodsReceiptOptions: goodsReceipts,
    purchaseBills,
    purchaseBillOptions: purchaseBills,
    isLoading,
    refetch: fetchAll,
  };
};
