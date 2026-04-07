# Procurement Flow

This repo now has the first lean procurement chain for buyer-side operations:

1. `purchase_order_headers` / `purchase_order_lines`
2. `goods_receipt_headers` / `goods_receipt_lines`
3. `purchase_bill_headers` / `purchase_bill_lines`

## Workflow

### 1. Purchase Order

Purchase orders are operational commitment documents.

- they identify the vendor/counterparty
- they store ordered quantities and expected pricing
- they do **not** create stock or accounting entries

Status behavior:

- `draft`
- `approved`
- derived display statuses:
  - `partially_received`
  - `received`
  - `partially_billed`
  - `billed`
- `void`

Derived quantities per PO line:

- `received_quantity` from posted goods receipts
- `billed_quantity` from approved/posted purchase bills

## 2. Goods Receipt

Goods receipts are the first stock-control document in the chain.

- they can reference a purchase order and purchase order lines
- they support partial receipts
- posting a goods receipt creates stock movements

Current design choice:

- inventory receipt is now allowed from goods receipt posting
- purchase bill posting will skip stock receipt for any line already linked to a goods receipt line

This keeps inventory from being double-received.

## 3. Purchase Bill

Purchase bills remain the financial/AP document.

- bills can now reference:
  - `purchase_order_line_id`
  - `goods_receipt_line_id`
- linked bills preserve procurement traceability
- partial billing is supported at the data-model foundation level

## Current Limitations

This first implementation is intentionally lean.

- goods receipts create stock movements but do **not** yet create GRNI / accrued liability journals
- purchase bills still perform the main AP/accounting recognition
- because of that, stock can be received before financial recognition exists in the ledger
- this is acceptable for the current repo step, but it is the main follow-up for a more complete accrual procurement design

## Future Migration Direction

Recommended next steps:

1. add GRNI / accrued purchases accounting on goods receipt posting
2. let purchase bills clear GRNI when billed against receipts
3. add tolerance logic for over/under receipt and invoice variance
4. optionally add purchase invoice matching rules by PO line and receipt line
