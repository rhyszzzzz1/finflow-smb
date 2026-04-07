import { salesCreditNoteApi } from "@/services/api";
import { useDocumentCollection } from "./useDocumentCollection";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeCreditNote = (note: any) => ({
  ...note,
  subtotal_amount: toNumber(note.subtotal_amount),
  tax_amount: toNumber(note.tax_amount),
  total_amount: toNumber(note.total_amount),
  lines: Array.isArray(note.lines) ? note.lines : [],
});

export const useSalesCreditNotes = () => {
  const collection = useDocumentCollection({
    entityName: "sales credit notes",
    list: salesCreditNoteApi.list,
    normalize: normalizeCreditNote,
  });

  return {
    salesCreditNotes: collection.items,
    isLoading: collection.isLoading,
    refetch: collection.refetch,
    createDraft: (payload: any) => collection.callAction("create", salesCreditNoteApi.createDraft, [payload], "Sales credit note created"),
    updateDraft: (id: string, payload: any) => collection.callAction("update", salesCreditNoteApi.updateDraft, [id, payload], "Sales credit note updated"),
    approveCreditNote: (id: string) => collection.callAction("approve", salesCreditNoteApi.approve, [id], "Sales credit note approved"),
    postCreditNote: (id: string) => collection.callAction("post", salesCreditNoteApi.post, [id], "Sales credit note posted"),
    voidCreditNote: (id: string) => collection.callAction("void", salesCreditNoteApi.void, [id], "Sales credit note voided"),
  };
};
