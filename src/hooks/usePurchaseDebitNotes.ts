import { purchaseDebitNoteApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDebitNote = (note: any) => ({
  ...note,
  subtotal_amount: toNumber(note.subtotal_amount),
  tax_amount: toNumber(note.tax_amount),
  total_amount: toNumber(note.total_amount),
  lines: Array.isArray(note.lines) ? note.lines : [],
});

export const usePurchaseDebitNotes = () => {
  const collection = useDocumentCollection({
    entityName: "purchase debit notes",
    list: purchaseDebitNoteApi.list,
    normalize: normalizeDebitNote,
  });

  return {
    purchaseDebitNotes: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", purchaseDebitNoteApi.createDraft, [payload], "Purchase debit note created"),
    updateDraft: (id: string, payload: any) => collection.callAction("update", purchaseDebitNoteApi.updateDraft, [id, payload], "Purchase debit note updated"),
    approveDebitNote: (id: string) => collection.callAction("approve", purchaseDebitNoteApi.approve, [id], "Purchase debit note approved"),
    postDebitNote: (id: string) => collection.callAction("post", purchaseDebitNoteApi.post, [id], "Purchase debit note posted"),
    voidDebitNote: (id: string) => collection.callAction("void", purchaseDebitNoteApi.void, [id], "Purchase debit note voided"),
  };
};
