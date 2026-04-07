# Order To Cash Flow

This repo now has the first lean seller-side commercial chain:

1. `sales_quote_headers` / `sales_quote_lines`
2. `sales_order_headers` / `sales_order_lines`
3. `sales_invoice_headers` / `sales_invoice_lines`

## Workflow

### 1. Quote / Estimate

Quotes are pre-invoice commercial proposals.

- they identify the customer/counterparty
- they store quoted quantities and prices
- they do not create accounting or stock entries

Statuses:

- `draft`
- `sent`
- `accepted`
- `converted`
- `void`

### 2. Sales Order

Sales orders are operational commitments after acceptance.

- they may be created directly or converted from a quote
- they preserve line linkage back to the originating quote lines
- they do not post accounting by themselves

Statuses:

- `draft`
- `accepted`
- derived `partially_invoiced`
- `converted`
- `void`

Derived quantity:

- `invoiced_quantity` from sales invoices linked by `sales_order_line_id`

### 3. Sales Invoice

Invoices remain the accounting and AR document.

- invoices can now reference:
  - `sales_quote_id`
  - `sales_order_id`
  - `sales_quote_line_id`
  - `sales_order_line_id`

That preserves commercial origin without changing the accounting posting model.

## Current Limitations

This first implementation is intentionally backend-lean.

- there is no delivery / shipment document yet
- sales orders do not reserve stock
- invoice conversion assumes ordered quantity is the invoice quantity unless overridden
- tax defaults still come from invoice logic, not quote/order logic

## Recommended Next Steps

1. add shipment / delivery note support
2. let invoice conversion support partial shipment and partial invoicing together
3. add order fulfillment status from delivery events
4. add quote versioning and expiry behavior
