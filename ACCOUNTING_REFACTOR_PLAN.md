# Accounting Refactor Plan

This file documents the current backend state of FinFlow SMB so later prompts can migrate business logic toward a disciplined accounting model without accidentally expanding the hybrid state.

## Goal

Keep runtime behavior stable while making the current boundaries explicit:

- authoritative modern accounting modules
- legacy operational tables and compatibility routes still in use
- dangerous overlap areas where legacy and modern paradigms still mix
- the recommended migration order to reduce accounting drift

See also:

- [`docs/authoritative-accounting-boundaries.md`](/C:/fyp/finflow-smb-main/docs/authoritative-accounting-boundaries.md)
  - quick source-of-truth map for master data, documents, stock, and settlement

## Product Context

- Project type: accounting-oriented final year project backend
- Broader profile context: buyer, seller, admin
- Main focus for the refactor: business-logic clarity and accounting correctness
- Non-goal for this phase: full enterprise-grade tenancy/security redesign

## Current Architecture Summary

The backend is in a hybrid state:

- modern accounting-ledger modules exist for invoices, purchase bills, payments, journal posting, tax, stock movements, and reports
- legacy operational tables and compatibility endpoints still exist in the runtime
- some modern services still fall back to legacy tables or legacy foreign-key substitutes
- `profiles` still acts as the runtime root for auth, tenancy, and many foreign keys

The repo should not add more business logic to legacy operational tables.

## Authoritative Modern Modules

These modules are the intended direction and should be treated as authoritative for new work:

- [`finflow-backend/services/salesInvoiceService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesInvoiceService.js)
  - authoritative sales invoice workflow
  - uses `sales_invoice_headers` and `sales_invoice_lines`
- [`finflow-backend/services/purchaseBillService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseBillService.js)
  - authoritative purchase bill workflow
  - uses `purchase_bill_headers` and `purchase_bill_lines`
- [`finflow-backend/services/settlementService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/settlementService.js)
  - authoritative settlement logic
  - uses `payments` and `payment_allocations`
- [`finflow-backend/services/journalService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/journalService.js)
  - authoritative journal-entry lifecycle
- [`finflow-backend/services/taxService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/taxService.js)
  - authoritative line-level tax calculation and tax transaction recording
- [`finflow-backend/services/inventoryLedgerService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryLedgerService.js)
  - authoritative inventory movement model
  - uses `items`, `warehouses`, `stock_movements`
- [`finflow-backend/services/accountingReportsService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/accountingReportsService.js)
  - authoritative direction for accounting reports
  - uses posted journals, allocations, and stock movements
- [`finflow-backend/routes/salesInvoiceRoutes.js`](/C:/fyp/finflow-smb-main/finflow-backend/routes/salesInvoiceRoutes.js)
- [`finflow-backend/routes/purchaseBillRoutes.js`](/C:/fyp/finflow-smb-main/finflow-backend/routes/purchaseBillRoutes.js)
- [`finflow-backend/routes/paymentRoutes.js`](/C:/fyp/finflow-smb-main/finflow-backend/routes/paymentRoutes.js)
- [`finflow-backend/routes/inventoryRoutes.js`](/C:/fyp/finflow-smb-main/finflow-backend/routes/inventoryRoutes.js)

## Legacy Modules And Tables Still In Use

These remain in runtime for compatibility and historical reads. They should not receive new business logic.

### Legacy operational tables still bootstrapped in `index.js`

Defined in [`finflow-backend/index.js`](/C:/fyp/finflow-smb-main/finflow-backend/index.js):

- `profiles`
- `inventory`
- `clients`
- `vendors`
- `invoices`
- `receivables`
- `payables`
- `sales`
- `purchases`
- `company_settings`

### Legacy compatibility routes still present

Also in [`finflow-backend/index.js`](/C:/fyp/finflow-smb-main/finflow-backend/index.js):

- `GET /api/invoices`
- `GET /api/sales`
- `GET /api/purchases`
- disabled legacy inventory handlers on `_legacy_disabled` paths

Write paths for these legacy routes have already been deprecated or disabled. Reads remain temporarily for compatibility.

## Transitional / Compatibility Layers

These files are important because they still bridge old and new paradigms:

- [`finflow-backend/services/salesInvoiceService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/salesInvoiceService.js)
  - `getCustomerSnapshot()` prefers `customers` but falls back to legacy `clients` joined to `profiles`
- [`finflow-backend/services/purchaseBillService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/purchaseBillService.js)
  - `getVendorSnapshot()` prefers modern vendor rows but falls back to legacy vendor/profile linkage
- [`finflow-backend/services/settlementService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/settlementService.js)
  - outstanding logic prefers modern documents but still supports legacy `invoice_id` and `purchase_id`
- [`finflow-backend/services/inventoryService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryService.js)
  - compatibility service that still bridges legacy `inventory` CRUD with modern stock-ledger services
- [`finflow-backend/repositories/inventoryRepository.js`](/C:/fyp/finflow-smb-main/finflow-backend/repositories/inventoryRepository.js)
  - compatibility repository around legacy `inventory`, `vendors`, and `vendor_products`
- [`finflow-backend/services/accountingReportsService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/accountingReportsService.js)
  - report logic is modern in direction but still uses migration-era heuristics

## Dangerous Overlap Areas

These are the main places where the repo still mixes paradigms.

### 1. `profiles` is still overloaded

[`finflow-backend/index.js`](/C:/fyp/finflow-smb-main/finflow-backend/index.js) and several modern services still treat `profiles` as:

- auth user
- acting company
- foreign-key target for operational rows
- creator/actor identity

This is acceptable for the current phase, but it is the main conceptual bottleneck in the model.

### 2. Name-based counterparty references still exist

Hotspots:

- legacy `invoices.customer_name`
- legacy `purchases.vendor_name`
- legacy `inventory.vendor_name`
- snapshot fields in new documents:
  - `sales_invoice_headers.customer_name`
  - `purchase_bill_headers.vendor_name`

Snapshot names are acceptable for document realism, but business relationships should come from IDs:

- `customer_id`
- `vendor_id`
- later, normalized company/user/counterparty ids

### 3. Settlement still carries legacy document references

[`finflow-backend/services/settlementService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/settlementService.js) still supports:

- `payment_allocations.invoice_id`
- `payment_allocations.purchase_id`
- alongside:
  - `payment_allocations.sales_invoice_id`
  - `payment_allocations.purchase_bill_id`

This is a deliberate migration bridge, but it is a real overlap area.

### 4. Inventory still has two conceptual models

- modern stock authority:
  - `items`
  - `warehouses`
  - `stock_movements`
- transitional operational compatibility:
  - `inventory`
  - `vendor_products`
  - legacy vendor-linked inventory flows

[`finflow-backend/services/inventoryService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/inventoryService.js) and [`finflow-backend/repositories/inventoryRepository.js`](/C:/fyp/finflow-smb-main/finflow-backend/repositories/inventoryRepository.js) are the main bridge here.

### 5. Reporting still contains compatibility heuristics

[`finflow-backend/services/accountingReportsService.js`](/C:/fyp/finflow-smb-main/finflow-backend/services/accountingReportsService.js) still uses:

- `tableExists(...)` checks for partially migrated domains
- account-type inference from `account_code` prefixes if chart-of-accounts metadata is incomplete

That is acceptable for now, but it should not become the long-term reporting model.

## Name-Based References To Migrate Later

The following patterns should be removed or reduced over time:

- legacy invoice/purchase/inventory counterparty names used as operational references
- joins that resolve counterparties by display/name fields instead of durable IDs
- inventory purchase/sale logic that still carries `product_name` as a structural key
- any fallback that resolves modern behavior through legacy tables first

Document snapshots may keep display names for legal/business realism, but the relational keys should remain ID-based.

## Runtime Guardrails Already Present

The repo already contains useful discipline that should be kept:

- legacy writes are deprecated or disabled for old finance endpoints
- legacy endpoint usage is logged
- dual-write from modern invoices/purchase bills into legacy tables has been removed
- legacy write guards exist for key tables through [`finflow-backend/utils/legacyWriteGuard.js`](/C:/fyp/finflow-smb-main/finflow-backend/utils/legacyWriteGuard.js)
- approval history is now explicit for invoices and purchase bills through
  approval workflow tables instead of a pure status flip

## Recommended Migration Order

1. Stop expanding legacy compatibility layers
   - no new business rules in `invoices`, `purchases`, `sales`, `receivables`, `payables`, or legacy `inventory`

2. Normalize counterparties
   - migrate remaining invoice/purchase/inventory flows to stable counterparty IDs
   - reduce fallback reliance on `clients`, `vendors`, and linked `profiles`

3. Finish inventory consolidation
   - move operational reads away from legacy `inventory`
   - keep `items`, `warehouses`, and `stock_movements` as the only stock authority

4. Simplify settlement references
   - move allocations fully to `sales_invoice_id` and `purchase_bill_id`
   - retire `invoice_id` and `purchase_id` compatibility usage when historical data is migrated

5. Tighten reporting assumptions
   - reduce account-code inference
   - rely on chart-of-accounts metadata and posted documents only

6. Untangle `profiles`
   - split tenancy/business identity concerns from auth/profile concerns in a later, deliberate phase

## Near-Term Migration Priorities

If later prompts ask what to migrate first, the recommended order is:

1. Counterparty fallback removal in invoice and purchase services
2. Inventory compatibility layer shrinkage
3. Settlement allocation cleanup from legacy document IDs
4. Reporting heuristic cleanup
5. `profiles` model separation

## What Not To Do In The Next Step

Until each domain is migrated intentionally:

- do not delete legacy tables just because they look old
- do not rewrite `index.js` wholesale in one prompt
- do not add new features on top of legacy finance tables
- do not reintroduce dual-write behavior into legacy `invoices`, `purchases`, or `sales`

## Practical Rule For Future Prompts

When touching business logic, prefer this question first:

> Is this flow authoritative modern accounting behavior, or is it compatibility code that should be isolated and eventually removed?

If it is compatibility code, label it clearly and avoid deepening its responsibilities.
