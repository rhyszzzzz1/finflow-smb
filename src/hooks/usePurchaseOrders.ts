import { purchaseOrderApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeOrder = (order: any) => ({
  ...order,
  subtotal_amount: toNumber(order.subtotal_amount),
  total_amount: toNumber(order.total_amount),
  lines: Array.isArray(order.lines) ? order.lines : [],
});

export const usePurchaseOrders = () => {
  const collection = useDocumentCollection({
    entityName: "purchase orders",
    list: purchaseOrderApi.list,
    normalize: normalizeOrder,
  });

  return {
    purchaseOrders: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", purchaseOrderApi.createDraft, [payload], "Purchase order created"),
    updateDraft: (id: string, payload: any) => collection.callAction("update", purchaseOrderApi.updateDraft, [id, payload], "Purchase order updated"),
    approveOrder: (id: string) => collection.callAction("approve", purchaseOrderApi.approve, [id], "Purchase order approved"),
    voidOrder: (id: string) => collection.callAction("void", purchaseOrderApi.void, [id], "Purchase order voided"),
  };
};
