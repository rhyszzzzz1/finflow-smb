import { salesOrderApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOrder = (order: any) => ({
  ...order,
  subtotal_amount: toNumber(order.subtotal_amount),
  tax_amount: toNumber(order.tax_amount),
  total_amount: toNumber(order.total_amount),
  lines: Array.isArray(order.lines) ? order.lines : [],
});

export const useSalesOrders = () => {
  const collection = useDocumentCollection({
    entityName: "sales orders",
    list: salesOrderApi.list,
    normalize: normalizeOrder,
  });

  return {
    salesOrders: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", salesOrderApi.createDraft, [payload], "Sales order created"),
    acceptOrder: (id: string) => collection.callAction("accept", salesOrderApi.accept, [id], "Sales order accepted"),
    convertToInvoice: (id: string, payload?: any) => collection.callAction("convert", salesOrderApi.convertToInvoice, [id, payload], "Sales order converted to invoice"),
    voidOrder: (id: string) => collection.callAction("void", salesOrderApi.void, [id], "Sales order voided"),
  };
};
