/**
 * Backend `/reports/reconciliations/summary` returns `reports` as an object
 * (ar, ap, inventory, grni, tax, advances), not an array. Normalize to rows
 * the dashboard and reports table can use.
 */
export type ReconciliationSummaryRow = {
  report_key: string;
  report_name: string;
  gl_balance: number;
  subledger_balance: number;
  variance: number;
  is_reconciled: boolean;
};

function rowFromPayload(key: string, payload: Record<string, unknown> | null | undefined): ReconciliationSummaryRow | null {
  if (!payload || typeof payload !== "object") return null;
  const gl = payload.gl_account as { gl_balance?: number } | undefined;
  if (typeof payload.is_reconciled !== "boolean" || !gl) return null;
  const reportType = typeof payload.report_type === "string" ? payload.report_type : key;
  return {
    report_key: key,
    report_name: reportType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    gl_balance: Number(gl.gl_balance ?? 0),
    subledger_balance: Number(payload.subledger_balance ?? 0),
    variance: Number(payload.variance ?? 0),
    is_reconciled: payload.is_reconciled,
  };
}

export function normalizeReconciliationSummaryReports(reports: unknown): ReconciliationSummaryRow[] {
  if (reports == null) return [];
  if (Array.isArray(reports)) {
    return reports.map((raw, index) => {
      const p = raw as Record<string, unknown>;
      const gl = p.gl_account as { gl_balance?: number } | undefined;
      return {
        report_key: String(p.report_key ?? p.report_type ?? index),
        report_name: String(p.report_name ?? p.report_type ?? `Report ${index + 1}`).replace(/_/g, " "),
        gl_balance: Number(p.gl_balance ?? gl?.gl_balance ?? 0),
        subledger_balance: Number(p.subledger_balance ?? 0),
        variance: Number(p.variance ?? 0),
        is_reconciled: Boolean(p.is_reconciled),
      };
    });
  }
  if (typeof reports !== "object") return [];

  const r = reports as Record<string, unknown>;
  const out: ReconciliationSummaryRow[] = [];

  const push = (key: string, payload: unknown) => {
    const row = rowFromPayload(key, payload as Record<string, unknown>);
    if (row) out.push(row);
  };

  push("ar", r.ar);
  push("ap", r.ap);
  push("inventory", r.inventory);
  push("grni", r.grni);

  const tax = r.tax as Record<string, unknown> | undefined;
  if (tax) {
    push("tax_output", tax.output_tax);
    push("tax_input", tax.input_tax);
  }

  const advances = r.advances as Record<string, unknown> | undefined;
  if (advances) {
    push("advances_customer", advances.customer_advances);
    push("advances_vendor", advances.vendor_prepayments);
  }

  return out;
}
