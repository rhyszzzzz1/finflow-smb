# Business Relationship Model

## Purpose

FinFlow SMB now has an additive bilateral relationship model for buyer and seller businesses.

This exists to solve a core accounting problem:

- legacy `clients` and `vendors` are unilateral address-book style links
- accounting documents increasingly use canonical counterparties
- future shared-document and connected-accounting flows need a real buyer/seller relationship, not just a saved contact name

## Transitional Model

Current master-data layers now coexist like this:

- `profiles`
  - runtime auth/profile records
- `counterparties`
  - canonical accounting-facing party master for customers/vendors
- `business_relationships`
  - bilateral buyer/seller relationship between two businesses
- `clients` / `vendors`
  - legacy compatibility address-book tables

The important distinction is:

- `counterparties` answer: "who is this accounting party?"
- `business_relationships` answer: "is there an active buyer/seller relationship between these businesses?"

## Schema

`business_relationships`

- `id`
- `company_id`
  - transitional owner/context for the row creator
- `buyer_company_id`
- `seller_company_id`
- `buyer_profile_id`
- `seller_profile_id`
- `relationship_status`
  - `invited`
  - `accepted`
  - `rejected`
  - `blocked`
  - `inactive`
- `default_payment_terms_days`
- `default_currency`
- `credit_limit`
- `notes`
- `accepted_at`
- `responded_by_user_id`
- `created_by_user_id`
- `created_at`
- `updated_at`

Unique key:

- `(buyer_company_id, seller_company_id)`

## Preferred Usage

Use `business_relationships` as the preferred source of truth for connected counterparties.

Preferred document direction:

- sales invoice
  - actor company = seller
  - counterparty = buyer
  - optional `business_relationship_id`
- purchase bill
  - actor company = buyer
  - counterparty = seller
  - optional `business_relationship_id`

## Legacy Coexistence

Legacy flows are still supported.

When a user adds:

- a client link
  - the system keeps the `clients` row
  - and also ensures an accepted buyer/seller relationship where:
    - linked business = buyer
    - current user business = seller
- a vendor link
  - the system keeps the `vendors` row
  - and also ensures an accepted buyer/seller relationship where:
    - current user business = buyer
    - linked business = seller

This keeps existing screens stable while giving the backend a more realistic business-relationship foundation.

## Desired Future State

Long term:

- connected business flows should resolve through:
  - canonical `counterparties`
  - accepted `business_relationships`
- `clients` and `vendors` should become compatibility wrappers or views
- shared billing, purchase, inventory sourcing, and relationship-specific terms should all hang off the bilateral relationship model

## Current API Surface

Minimal relationship endpoints:

- `GET /api/business-relationships`
- `GET /api/business-relationships/active`
- `POST /api/business-relationships/invite`
- `POST /api/business-relationships/:id/accept`

These are intentionally small and accounting-focused, not a full marketplace workflow.
