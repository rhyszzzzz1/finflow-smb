import { salesQuoteApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeQuote = (quote: any) => ({
  ...quote,
  subtotal_amount: toNumber(quote.subtotal_amount),
  tax_amount: toNumber(quote.tax_amount),
  total_amount: toNumber(quote.total_amount),
  lines: Array.isArray(quote.lines) ? quote.lines : [],
});

export const useSalesQuotes = () => {
  const collection = useDocumentCollection({
    entityName: "sales quotes",
    list: salesQuoteApi.list,
    normalize: normalizeQuote,
  });

  return {
    salesQuotes: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", salesQuoteApi.createDraft, [payload], "Sales quote created"),
    sendQuote: (id: string) => collection.callAction("send", salesQuoteApi.send, [id], "Quote sent"),
    acceptQuote: (id: string) => collection.callAction("accept", salesQuoteApi.accept, [id], "Quote accepted"),
    convertToOrder: (id: string, payload?: any) => collection.callAction("convert", salesQuoteApi.convertToOrder, [id, payload], "Quote converted to sales order"),
    voidQuote: (id: string) => collection.callAction("void", salesQuoteApi.void, [id], "Quote voided"),
  };
};
