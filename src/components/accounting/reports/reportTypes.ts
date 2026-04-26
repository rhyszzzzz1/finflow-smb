export type ReportSectionKey = "financial_statements" | "subledger" | "inventory" | "reconciliations";

export type DateRange = { startDate: string; endDate: string };

export type AsOf = { asOfDate: string };

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const yearRange = (year: number): DateRange => ({
  startDate: `${year}-01-01`,
  endDate: `${year}-12-31`,
});

