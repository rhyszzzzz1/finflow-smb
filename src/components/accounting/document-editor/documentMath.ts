import type { DocumentTotals, EditableLine, Money } from "./documentTypes";

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calcLineAmounts(line: EditableLine) {
  const qty = toNumber(line.quantity);
  const unit = toNumber(line.unit_price ?? line.unit_cost ?? 0);
  const gross: Money = round2(qty * unit);

  const discountType = line.discount_type || "none";
  const discountValue = toNumber(line.discount_value);

  const discountAmount =
    discountType === "percentage"
      ? round2((gross * discountValue) / 100)
      : discountType === "fixed"
        ? round2(discountValue)
        : 0;

  const net = round2(Math.max(0, gross - discountAmount));
  const taxRate = toNumber(line.tax_rate);
  const taxAmount = taxRate ? round2((net * taxRate) / 100) : 0;
  const total = round2(net + taxAmount);

  return {
    line_subtotal: gross,
    discount_amount: discountAmount,
    line_tax_amount: taxAmount,
    line_total: total,
  };
}

export function calcDocumentTotals(lines: EditableLine[]): DocumentTotals {
  const computed = lines.map((l) => calcLineAmounts(l));
  const subtotal = round2(computed.reduce((sum, x) => sum + toNumber(x.line_subtotal), 0));
  const tax = round2(computed.reduce((sum, x) => sum + toNumber(x.line_tax_amount), 0));
  const total = round2(computed.reduce((sum, x) => sum + toNumber(x.line_total), 0));
  return { subtotal, tax, total };
}

