export type Money = number;

export type DiscountType = "none" | "percentage" | "fixed";

export type DocumentType =
  | "sales_quote"
  | "sales_order"
  | "sales_invoice"
  | "sales_credit_note"
  | "purchase_order"
  | "goods_receipt"
  | "purchase_bill"
  | "purchase_debit_note";

export type DocumentStatus = string;

export type SelectOption = { value: string; label: string; meta?: unknown };

export type EditableLine = {
  id?: string;
  item_id?: string | null;
  description: string;
  quantity: number;
  unit_price?: number;
  unit_cost?: number;
  line_kind?: "inventory" | "expense";
  expense_account_id?: string | null;
  discount_type?: DiscountType;
  discount_value?: number;
  tax_rate?: number;
  tax_code_id?: string | null;
  source?: {
    sales_quote_line_id?: string;
    sales_order_line_id?: string;
    purchase_order_line_id?: string;
    goods_receipt_line_id?: string;
  };
  // display / computed
  line_subtotal?: Money;
  discount_amount?: Money;
  line_tax_amount?: Money;
  line_total?: Money;
};

export type DocumentTotals = {
  subtotal: Money;
  tax: Money;
  total: Money;
};

export type DocumentEditorMode = "create" | "edit" | "view";

export type DocumentHeaderState = Record<string, unknown>;

export type DocumentEditorState = {
  header: DocumentHeaderState;
  lines: EditableLine[];
};

export type DocumentTypeConfig = {
  type: DocumentType;
  counterpartyLabel: string;
  counterpartyField: string;
  dateField: string;
  allowServices: boolean;
  unitAmountLabel: string;
  quantityLabel: string;
  showDiscounts: boolean;
  showTaxRate: boolean;
  supportsSources: boolean;
  supportsUnitPrice: boolean;
  supportsUnitCost: boolean;
};

export const defaultLine = (config: DocumentTypeConfig): EditableLine => ({
  description: "",
  quantity: 1,
  ...(config.supportsUnitPrice ? { unit_price: 0 } : {}),
  ...(config.supportsUnitCost ? { unit_cost: 0 } : {}),
  ...(config.showDiscounts ? { discount_type: "none", discount_value: 0 } : {}),
  ...(config.showTaxRate ? { tax_rate: 0 } : {}),
});

