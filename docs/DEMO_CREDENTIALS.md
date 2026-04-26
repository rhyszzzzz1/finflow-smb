# FinFlow / FinTrac — demo credentials

These are **intentional demo values** from the repository. Do not use in production.

---

## Regular app login (tenant users)

If you have run the dummy-tenant seed script, **all** of these accounts share the same password.

**Shared password:** `FinFlowDemo2026!`

**Emails** (sign in at the normal app login, not admin):

| Email | Display / business (from seed) |
|-------|----------------------------------|
| `demo-tenant-01@finflow.local` | Asha Sharma — Himalaya General Suppliers |
| `demo-tenant-02@finflow.local` | Bikash Thapa — Pokhara Fresh Mart |
| `demo-tenant-03@finflow.local` | Chitra Gurung — Everest Hardware & Tools |
| `demo-tenant-04@finflow.local` | Dipak K.C. — Valley Electronics Nepal |
| `demo-tenant-05@finflow.local` | Elena Tamang — GreenLeaf Agro Traders |
| `demo-tenant-06@finflow.local` | Firoz Ansari — Metro Textiles & Garments |
| `demo-tenant-07@finflow.local` | Gita Maharjan — Kathmandu Stationery House |
| `demo-tenant-08@finflow.local` | Hari Pradhan — BuildRight Construction Supply |
| `demo-tenant-09@finflow.local` | Indira Basnet — Sunrise Home & Kitchen |
| `demo-tenant-10@finflow.local` | Jeevan Rai — Terai Grain & Oil Mills |

**Create these users in the database:**

```bash
npm run seed:dummy-tenants --prefix finflow-backend
```

After a successful run, a machine-readable copy is written to:

`finflow-backend/scripts/dummy-tenant-credentials.json`  
(that path is gitignored; regenerate it with the command above.)

---

## Admin portal (KYC)

There is **no fixed default admin email/password** in the database. You bootstrap an admin in development:

1. Backend running (e.g. `npm run backend` from repo root).
2. `POST /api/admin/seed` with JSON body, for example:

```json
{
  "secret": "finflow_seed",
  "email": "admin@example.com",
  "password": "choose-a-strong-password",
  "name": "Demo Admin"
}
```

- **Default seed secret** (if `ADMIN_SEED_SECRET` is not set): `finflow_seed`
- In production, admin seed is blocked unless you explicitly allow it (see backend `index.js`).

Then sign in at `/admin/login` with the **email** and **password** you sent in that request.

**Alternative (direct DB):**  
`node finflow-backend/scripts/ensureAdmin.js [email] [password] [name]`  
Script defaults if omitted: `admin@finflow.com` / `123456` / `Admin` — use only for local dev.

---

## Your own account

If you registered through the normal signup flow, use **that** email and password. Demo tenants above are unrelated unless you ran the seed script.
