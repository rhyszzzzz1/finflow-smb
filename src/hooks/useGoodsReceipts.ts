import { goodsReceiptApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeReceipt = (receipt: any) => ({
  ...receipt,
  lines: Array.isArray(receipt.lines)
    ? receipt.lines.map((line: any) => ({
        ...line,
        received_quantity: toNumber(line.received_quantity),
        unit_cost: toNumber(line.unit_cost),
        line_total: toNumber(line.line_total),
      }))
    : [],
});

export const useGoodsReceipts = () => {
  const collection = useDocumentCollection({
    entityName: "goods receipts",
    list: goodsReceiptApi.list,
    normalize: normalizeReceipt,
  });

  return {
    goodsReceipts: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", goodsReceiptApi.createDraft, [payload], "Goods receipt created"),
    updateDraft: (id: string, payload: any) => collection.callAction("update", goodsReceiptApi.updateDraft, [id, payload], "Goods receipt updated"),
    postReceipt: (id: string) => collection.callAction("post", goodsReceiptApi.post, [id], "Goods receipt posted"),
    voidReceipt: (id: string) => collection.callAction("void", goodsReceiptApi.void, [id], "Goods receipt voided"),
  };
};
