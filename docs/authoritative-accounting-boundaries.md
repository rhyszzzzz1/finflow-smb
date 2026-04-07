# Authoritative Accounting Boundaries

This file is the quick source-of-truth map for the current FinFlow SMB backend.

It exists to reduce confusion while the repo is still in a hybrid migration
state.

## Authoritative Master Data

### Counterparties

Preferred master data:

- `counterparties`
- `counterparty_roles`
- `business_relationships`

Runtime services:

- [`finflow-backend/services/counterpartyService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/counterpartyService.js)
- [`finflow-backend/services/businessRelationshipService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/businessRelationshipService.js)

Legacy compatibility still present:

- `clients`
- `vendors`
- `profiles` linkage

Why legacy still exists:

- older endpoints and screens still expect unilateral client/vendor lists
- some historical rows still reference old ids or linked profiles

Rule:

- use `counterparty_id` for accounting identity
- keep snapshot names on documents for historical realism only

## Authoritative Document Tables

### Sales side

Authoritative:

- `sales_quote_headers`
- `sales_quote_lines`
- `sales_order_headers`
- `sales_order_lines`
- `sales_invoice_headers`
- `sales_invoice_lines`
- `sales_credit_note_headers`
- `sales_credit_note_lines`

Primary services:

- [`finflow-backend/services/salesQuoteService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesQuoteService.js)
- [`finflow-backend/services/salesOrderService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesOrderService.js)
- [`finflow-backend/services/salesInvoiceService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesInvoiceService.js)
- [`finflow-backend/services/salesCreditNoteService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesCreditNoteService.js)

Legacy compatibility:

- `invoices`
- `sales`
- `GET /api/invoices`
- `GET /api/sales`
- `GET /api/v2/sales-invoices*`

Write status:

- legacy writes are deprecated/blocked

### Purchase side

Authoritative:

- `purchase_order_headers`
- `purchase_order_lines`
- `goods_receipt_headers`
- `goods_receipt_lines`
- `purchase_bill_headers`
- `purchase_bill_lines`
- `purchase_debit_note_headers`
- `purchase_debit_note_lines`

Primary services:

- [`finflow-backend/services/purchaseOrderService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseOrderService.js)
- [`finflow-backend/services/goodsReceiptService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/goodsReceiptService.js)
- [`finflow-backend/services/purchaseBillService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseBillService.js)
- [`finflow-backend/services/purchaseDebitNoteService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseDebitNoteService.js)

Legacy compatibility:

- `purchases`
- `GET /api/purchases`
- `GET /api/v2/purchase-bills*`

Write status:

- legacy writes are deprecated/blocked

## Authoritative Stock Source

Authoritative stock source:

- `items`
- `warehouses`
- `stock_movements`

Primary services:

- [`finflow-backend/services/inventoryLedgerService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryLedgerService.js)
- [`finflow-backend/services/inventoryService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryService.js)

Compatibility layer still present:

- `inventory`
- `vendor_products`
- `item_vendor_links`

Important rule:

- `inventory.stock_quantity` is not the operational stock authority
- stock balances should come from ledger calculations over `stock_movements`
- `inventory` is currently a compatibility metadata/read model

What still writes to legacy inventory:

- compatibility item creation/update in [`finflow-backend/services/inventoryService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryService.js)

Why it still exists:

- some frontend screens still expect legacy inventory-shaped records
- old vendor-product-driven flows still need a bridge while item master and
  item-vendor mapping continue migrating

## Authoritative Payment And Settlement Logic

Authoritative tables:

- `payments`
- `payment_allocations`
- `bank_accounts`

Primary service:

- [`finflow-backend/services/settlementService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/settlementService.js)

Derived balances only:

- receivables
- payables
- AR aging
- AP aging

Important rule:

- receivables/payables are derived from posted documents and allocations
- they are not editable primary ledgers

Compatibility endpoints:

- `GET /api/receivables`
- `GET /api/payables`

Blocked write endpoints:

- `POST/PUT/DELETE /api/receivables*`
- `POST/PUT/DELETE /api/payables*`

## Authoritative Accounting Engine

Authoritative tables:

- `chart_of_accounts`
- `journal_entries`
- `journal_lines`
- `tax_codes`
- `tax_transactions`

Primary services:

- [`finflow-backend/services/chartOfAccountsService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/chartOfAccountsService.js)
- [`finflow-backend/services/journalService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/journalService.js)
- [`finflow-backend/services/taxService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/taxService.js)

Rule:

- accounting reports should come from posted journals, document subledgers, and
  stock/tax subledgers

## Approval And Audit Trail

Authoritative approval structures:

- `approval_workflows`
- `approval_steps`
- `approval_decisions`

Primary service:

- [`finflow-backend/services/approvalWorkflowService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/approvalWorkflowService.js)

Authoritative audit trail:

- `audit_logs`
- [`finflow-backend/services/auditService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/auditService.js)

## What Is Still Legacy

These remain because the product is mid-migration, not because they are the
right long-term design:

- `profiles`
- `clients`
- `vendors`
- `inventory`
- `invoices`
- `sales`
- `purchases`
- `receivables`
- `payables`
- compatibility routes in [`finflow-backend/index.js`](/C:/fyp/finflow-smb-main/finflow-backend/index.js)

## Practical Rule

When touching business logic, ask:

1. Is this data authoritative?
2. If not, is it a compatibility read model or a migration bridge?
3. If it is a bridge, is the code clearly labeled as transitional?

If the answer to 3 is no, add the label before expanding the logic.
