# Master Data Model

## Purpose

FinFlow SMB is currently in a transitional backend state. Newer accounting services already post invoices, bills, payments, and journals through document-oriented flows, but master-data resolution is still mixed across:

- `counterparties`
- `clients`
- `vendors`
- `customers`
- `profiles`
- linked profile relationships

This document defines the current transitional model and the intended future-state model so later refactors can move in one direction instead of adding more mixed logic.

## Current Transitional Rule

Accounting document services must resolve parties through [`CounterpartyService`](/C:/fyp/finflow-smb-main/finflow-backend/services/counterpartyService.js), not through ad hoc SQL in individual services.

### Canonical Source

`counterparties` is the canonical accounting identity table.

It provides:

- stable `id`
- `display_name`
- `legal_name`
- `tax_number`
- `email`
- `phone`
- `address`
- `linked_profile_id`
- active/inactive status

Role membership is tracked in `counterparty_roles` so the same party can act as:

- customer
- vendor
- both

### Transitional Inputs Still Accepted

The resolver intentionally accepts multiple historical references while the repo is being migrated:

- canonical `counterparty_id`
- modern `customers.id`
- modern `vendors.id` where available
- legacy `clients.id`
- legacy `vendors.id`
- last-resort display names from older payloads

### Resolution Priority

For customer flows:

1. canonical `counterparty_id`
2. modern `customers` row
3. legacy `clients` row
4. linked profile/name fallback

For vendor flows:

1. canonical `counterparty_id`
2. modern `vendors` row if the normalized vendor model is present
3. legacy `vendors` row
4. linked profile/name fallback

## Snapshot Rule

Transactional documents must store immutable party snapshots. Master-data edits must not rewrite historical documents.

Sales invoice snapshot fields:

- `customer_name`
- `customer_legal_name`
- `customer_pan_vat_number`
- `customer_email`
- `customer_phone`
- `customer_address`

Purchase bill snapshot fields:

- `vendor_name`
- `vendor_legal_name`
- `vendor_pan_vat_number`
- `vendor_email`
- `vendor_phone`
- `vendor_address`

Payments and reports should tie balances to canonical `counterparty_id`, while display values come from document snapshots or current master data only where appropriate.

## Future-State Target

The long-term goal is:

- one canonical counterparty master for accounting
- no accounting identity based on `client_name` or `vendor_name`
- no service-level party lookup outside `CounterpartyService`
- modern customer/vendor APIs as thin role-aware views over canonical counterparties
- legacy `clients` / `vendors` kept only as compatibility wrappers until removed

## Current Service Responsibilities

Authoritative party resolution:

- [`CounterpartyService`](/C:/fyp/finflow-smb-main/finflow-backend/services/counterpartyService.js)

Accounting document services that must use it:

- [`SalesInvoiceService`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesInvoiceService.js)
- [`PurchaseBillService`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseBillService.js)
- [`SettlementService`](/C:/fyp/finflow-smb-main/finflow-backend/services/settlementService.js)

## Migration Notes

### Keep for now

- legacy `clients` and `vendors` tables
- payloads containing `customer_id` / `vendor_id` that may still point to legacy rows
- compatibility snapshot columns on transaction tables

### Stop adding

- new name-based joins for accounting identity
- new business logic that reads `client_name` / `vendor_name` as the source of truth
- service-specific custom lookup logic outside the shared resolver

### Migrate next

1. Move remaining report queries to pure `counterparty_id` joins where document snapshots are not the display source.
2. Expose canonical counterparty identity more explicitly in API responses.
3. Turn legacy `clients` / `vendors` endpoints into compatibility wrappers over canonical counterparties.
4. Retire name-based fallback creation once the frontend stops sending legacy names.
