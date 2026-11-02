# HomeSplit — Shared Bill Splitter

A full-stack SDE internship assignment for splitting household bills fairly across members,
with integer-cent precision, idempotent payments, and concurrency-safe double-payment prevention.

> Built with **Hono** on **Cloudflare Workers** + **D1** (SQLite), and a **React + Vite + TanStack Router** frontend.

---

## Features

- **Create homes** — group members and bills under a household.
- **Add members** — members are ordered by insertion; ordering drives remainder-cent allocation.
- **Create bills** — a bill is split equally across all home members the instant it is created.
- **Integer-cent splitting** — totals are stored as integer cents. Remainder cents are distributed
  deterministically to the first N members so `sum(shares) === total` is always true.
- **Pay individual shares** — each share is paid independently via an idempotent endpoint.
- **Idempotent payments** — replaying the same `Idempotency-Key` returns the original response.
  A different key on an already-paid share returns `409 Conflict`.
- **Concurrency-safe** — a single atomic conditional `UPDATE` (`WHERE paid_at IS NULL`) guarantees
  that exactly one concurrent request can pay a share, even under high parallelism.
- **Home balances** — per-member outstanding amounts (excluding paid shares) and home totals.
- **Premium UI** — a fintech-inspired dashboard with stat cards, balance table, split preview,
  loading / empty / error states, and a responsive sidebar that collapses on mobile.

---

## Tech stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 18, TypeScript, Vite 5, TanStack Router, TanStack Query |
| Backend    | Hono 4 on Cloudflare Workers, TypeScript |
| Database   | Cloudflare D1 (SQLite), with `wrangler` for local dev + migrations |
| Testing    | Vitest + `@cloudflare/vitest-pool-workers` (backend), Vitest + jsdom (frontend) |
| Tooling    | pnpm workspaces, Biome (lint/format) |

---

## Architecture

```mermaid
flowchart LR
    subgraph Browser
        UI["React + TanStack Router<br/>(Vite dev server :5173)"]
    end
    subgraph Edge["Cloudflare Workers"]
        API["Hono API<br/>/api/homes<br/>/api/bills<br/>/api/homes/:id/balances"]
    end
    subgraph Store["Cloudflare D1 (SQLite)"]
        H[("homes")]
        M[("members")]
        B[("bills")]
        S[("shares")]
        IK[("idempotency_keys")]
    end

    UI -- "fetch /api/*" --> API
    API --> H
    API --> M
    API --> B
    API --> S
    API --> IK
```

### Monorepo layout

```
HomeSplit-FullStack/
├── api/                      # Cloudflare Worker (Hono + D1)
│   ├── src/
│   │   ├── index.ts          # Hono app, middleware, error handler
│   │   ├── env.ts            # D1 binding types
│   │   ├── types.ts          # Shared domain types
│   │   ├── lib/
│   │   │   ├── split.ts      # Integer-cent splitting (pure, unit-tested)
│   │   │   ├── validation.ts # Boundary input validation
│   │   │   ├── errors.ts     # HttpError + helpers
│   │   │   ├── ids.ts        # Web-Crypto ID generator
│   │   │   └── mappers.ts    # DB row → API model
│   │   └── routes/
│   │       ├── homes.ts      # POST /api/homes, POST /api/homes/:id/members, GET /api/homes/:id
│   │       ├── bills.ts      # POST /api/homes/:id/bills, GET /api/bills/:id
│   │       ├── payments.ts   # POST /api/bills/:billId/shares/:shareId/pay
│   │       └── balances.ts   # GET /api/homes/:id/balances
│   ├── migrations/
│   │   └── 0001_init.sql     # Schema with named constraints
│   ├── test/                 # 49 Vitest tests (incl. concurrency)
│   ├── wrangler.jsonc
│   ├── vitest.config.ts
│   └── package.json
├── web/                      # React frontend (Vite)
│   ├── src/
│   │   ├── main.tsx
│   │   ├── routes/           # TanStack Router file routes
│   │   ├── components/       # Layout, UI primitives, modals
│   │   ├── hooks/api.ts      # TanStack Query hooks
│   │   ├── services/api.ts   # Typed API client + formatters
│   │   ├── types/index.ts
│   │   └── styles/globals.css
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json
├── README.md
├── package.json              # Root workspace scripts
├── pnpm-workspace.yaml
├── biome.json
└── .gitignore
```

---

## Installation

**Prerequisites:** Node ≥ 20, pnpm ≥ 9.

```bash
# from the repository root
pnpm install              # installs both api + web workspaces

# apply the D1 schema to a local SQLite database (for `wrangler dev`)
pnpm db:migrate:local
```

---

## Environment setup

No `.env` file is required for local development. The API runs entirely on local
Miniflare/D1 simulation. For production, set these as Worker secrets / vars:

| Variable         | Where        | Default | Purpose |
|------------------|--------------|---------|---------|
| `CORS_ORIGIN`    | `wrangler.jsonc` `vars` | `*` | Allowed origin for CORS |
| `ENVIRONMENT`    | `wrangler.jsonc` `vars` | `development` | Runtime label |
| `VITE_API_BASE_URL` | `web/` build env | `''` (uses Vite proxy in dev) | Deployed Worker URL |

The frontend's Vite dev server proxies `/api/*` to `http://localhost:8787` (the wrangler dev port).
Override with `VITE_API_TARGET` if you run wrangler on a different port.

---

## Database migrations

```bash
# local (writes to api/.wrangler/state — used by `wrangler dev`)
pnpm db:migrate:local

# remote (requires `npx wrangler login` and a real D1 database_id in wrangler.jsonc)
pnpm db:migrate
```

The schema (`api/migrations/0001_init.sql`) defines **five tables** and **named constraints**:

- `uk_member_home_position` — `(home_id, position)` UNIQUE, preserves member ordering
- `uk_share_per_bill_member` — `(bill_id, member_id)` UNIQUE, a member appears once per bill
- `uk_share_paid_key` — `paid_idempotency_key` UNIQUE, database-enforced double-payment mutex

Plus `CHECK` constraints on `homes.name`, `members.name`, `bills.title`, `bills.total_amount > 0`,
`shares.amount >= 0`, and a status range on `idempotency_keys.response_status`.

---

## API documentation

All monetary values are **integer cents**. Responses are JSON. Errors use the shape
`{ "error": "<CODE>", "message": "<human-readable>" }`.

### `POST /api/homes`
Create a home.

**Request:** `{ "name": "Apartment 4A" }`
**Response `201`:** `{ "id": "…", "name": "Apartment 4A", "createdAt": "…" }`
**Errors:** `400 VALIDATION_ERROR` (missing/blank/non-string name)

### `POST /api/homes/:homeId/members`
Add a member to a home. Members are assigned incremental `position` values in insertion order.

**Request:** `{ "name": "Alice" }`
**Response `201`:** `{ "id": "…", "homeId": "…", "name": "Alice", "position": 0, "createdAt": "…" }`
**Errors:** `404 HOME_NOT_FOUND`, `400 VALIDATION_ERROR`

### `POST /api/homes/:homeId/bills`
Create a bill and atomically split it across all home members.

**Request:** `{ "title": "Groceries", "totalAmount": 1000 }` (cents, positive integer)
**Response `201`:**
```json
{
  "id": "…", "homeId": "…", "title": "Groceries", "totalAmount": 1000, "createdAt": "…",
  "shares": [
    { "id": "…", "billId": "…", "memberId": "…", "memberName": "Alice", "amount": 334, "paid": false, "paidAt": null },
    { "id": "…", "billId": "…", "memberId": "…", "memberName": "Bob",   "amount": 333, "paid": false, "paidAt": null },
    { "id": "…", "billId": "…", "memberId": "…", "memberName": "Carol", "amount": 333, "paid": false, "paidAt": null }
  ]
}
```
**Errors:** `404 HOME_NOT_FOUND`, `400 NO_MEMBERS`, `400 VALIDATION_ERROR` (zero/negative/decimal amount, missing title)

### `POST /api/bills/:billId/shares/:shareId/pay`
Pay an individual share. **Idempotent** via the `Idempotency-Key` header.

**Header:** `Idempotency-Key: <any unique string>`
**Response `200`:** the paid `Share` object (`{ …, "paid": true, "paidAt": "…" }`)

| Scenario | Status | Body |
|---|---|---|
| First payment with key K | `200` | paid share |
| Replay with the same key K | `200` | the **original** stored response (identical `paidAt`) |
| A different key K2 on an already-paid share | `409` | `{ "error": "SHARE_ALREADY_PAID", "message": "…" }` |
| Unknown bill/share, or bill↔share mismatch | `404` | `SHARE_NOT_FOUND` |
| Missing/empty `Idempotency-Key` | `400` | `VALIDATION_ERROR` |

### `GET /api/homes/:homeId/balances`
Per-member balances and home totals. Paid shares are excluded from outstanding amounts.

**Response `200`:**
```json
{
  "homeId": "…",
  "members": [
    { "memberId": "…", "memberName": "Alice", "totalShare": 334, "paidAmount": 334, "outstandingBalance": 0 },
    { "memberId": "…", "memberName": "Bob",   "totalShare": 333, "paidAmount": 0,   "outstandingBalance": 333 }
  ],
  "totals": { "totalBilled": 1000, "totalPaid": 334, "totalOutstanding": 666 }
}
```
**Errors:** `404 HOME_NOT_FOUND`

### Convenience endpoints
- `GET /api/health` → `{ "status": "ok", "timestamp": "…" }`
- `GET /api/homes/:homeId` → the home with its members
- `GET /api/bills/:billId` → the bill with its shares (used by the bill-detail page)

---

## Bill splitting algorithm

All money is integer cents. Floating point is never used.

```ts
function splitEqually(totalCents: number, memberCount: number): number[] {
  const base = Math.floor(totalCents / memberCount);
  const remainder = totalCents - base * memberCount; // 0 .. memberCount-1
  const shares = new Array(memberCount).fill(base);
  for (let i = 0; i < remainder; i++) shares[i] += 1;
  return shares;
}
```

**Deterministic remainder allocation:** the first `remainder` members (by `position` order)
receive one extra cent. This guarantees:

- `sum(shares) === totalCents` always (verified by an invariant check + tests)
- any two shares differ by at most 1 cent
- the split is stable across re-runs

**Examples:**

| Total | Members | Shares |
|------:|--------:|--------|
| 1000  | 3       | `[334, 333, 333]` |
| 999   | 3       | `[333, 333, 333]` |
| 100000 | 7      | `[14286, 14286, 14286, 14286, 14286, 14285, 14285]` |
| 3     | 5       | `[1, 1, 1, 0, 0]` |

The unit test suite (`api/test/split.test.ts`) fuzz-tests 12 member counts × 135 totals each
and asserts both the sum invariant and the "max − min ≤ 1" balance property.

---

## Idempotency strategy

Payment idempotency is **database-enforced**, not application-enforced. The flow:

1. **Validate** the `Idempotency-Key` header.
2. **Atomic claim** — a single conditional `UPDATE`:
   ```sql
   UPDATE shares
      SET paid_at = ?, paid_idempotency_key = ?
    WHERE id = ? AND bill_id = ? AND paid_at IS NULL
   ```
   SQLite/D1 serialises this statement; exactly one concurrent request can match
   (`meta.changes === 1`). Every other request for the same share sees `meta.changes === 0`.
3. **If we won** (`changes === 1`):
   - Build the canonical success response and persist it in `idempotency_keys`
     (`key` is `PRIMARY KEY`, so a same-key replay returns the stored row).
   - Return `200` with the paid share.
4. **If we lost** (`changes === 0`):
   - If `paid_idempotency_key === request key` → read the stored response from
     `idempotency_keys` and replay it. (If the winner has not yet written the record —
     the tightest race window — reconstruct an equivalent success from the share's
     current paid state.)
   - If `paid_idempotency_key !== request key` → return `409 Conflict`.

The `UNIQUE` constraint on `shares.paid_idempotency_key` plus the `WHERE paid_at IS NULL`
guard form a **double-locked mutex**: even if two requests race, only one can flip `paid_at`
from `NULL` to a value, and only that winner's key is recorded.

**Verified by tests** (`api/test/concurrency.test.ts`):
- 8 concurrent requests, **same key** → all 8 return `200` with an identical `paidAt`.
- 10 concurrent requests, **different keys** → exactly one `200`, nine `409`s.

---

## Error handling

- **Backend:** a single Hono `onError` handler converts `ValidationError` → `400`,
  `HttpError` → its own status, and SQLite constraint violations (`UNIQUE`/`CHECK`/`FOREIGN KEY`)
  → `409`/`400`. Unknown errors are logged server-side and return `500 INTERNAL_ERROR`
  with no stack trace leaked.
- **Frontend:** the API client (`web/src/services/api.ts`) wraps every `fetch` in try/catch,
  parses JSON safely, and throws `ApiClientError` carrying `status` + `code` + `message`.
  Every screen renders explicit **loading**, **empty**, **error** (with retry), and
  **success** states. No unhandled promise rejections.

---

## Testing

### Backend (49 tests, all passing)

```bash
pnpm --filter @homesplit/api test
```

| Suite | Tests | Covers |
|-------|------:|--------|
| `split.test.ts` | 9 | pure-function splitting: divisibility, remainder, 1..12 members × 135 totals fuzz, invariant, error cases |
| `homes.test.ts` | 7 | create home, missing/blank/non-string name, trim, health |
| `members.test.ts` | 5 | add member, position ordering, 404 home, blank/null name |
| `bills.test.ts` | 11 | 1000/3 split, 404 home, no members, zero/negative/decimal/non-number amount, missing title, single member, amount < member count, multiple bills |
| `payments.test.ts` | 8 | pay, missing/empty idempotency key, same-key replay, different-key 409, 404 unknown share, cross-bill mismatch, independent shares |
| `balances.test.ts` | 5 | zero balances, outstanding excluding paid, 404, member order, cross-home isolation |
| `concurrency.test.ts` | 4 | same-key N-concurrent, different-key N-concurrent, different shares concurrent, mixed sequential |

### Frontend (14 tests, all passing)

```bash
pnpm --filter @homesplit/web test
```

Unit tests for `formatCurrency`, `initials`, `avatarColor`, `formatDate`, `newIdempotencyKey`.

### Type-check + build

```bash
pnpm typecheck    # tsc --noEmit in both workspaces
pnpm --filter @homesplit/api build    # wrangler deploy --dry-run (106 KiB worker)
pnpm --filter @homesplit/web build    # vite build (89 KiB gzipped JS)
```

### End-to-end (manual, browser-verified)

The full flow was verified with a real browser against `wrangler dev` + `vite`:
create home → add 3 members → create $10.00 bill → verify 334/333/333 split →
pay Alice's share → verify balance updates to 334 paid / 666 outstanding →
verify 409 on different-key replay → verify mobile (375×812) layout has no overflow.

---

## Development commands

```bash
# install everything
pnpm install

# run both api (wrangler dev :8787) and web (vite :5173) in parallel
pnpm dev

# run just one workspace
pnpm --filter @homesplit/api dev
pnpm --filter @homesplit/web dev

# apply D1 migration locally
pnpm db:migrate:local

# tests
pnpm test
pnpm --filter @homesplit/api test
pnpm --filter @homesplit/web test

# typecheck + lint + build
pnpm typecheck
pnpm lint
pnpm build
```

---

## Technical trade-offs

1. **Conditional `UPDATE` as the idempotency mutex, not a transactional read-check-write.**
   A read-then-write pattern (`SELECT paid_at … if NULL then UPDATE`) is racy under concurrency.
   The single atomic `UPDATE … WHERE paid_at IS NULL` is serialised by SQLite and needs no
   application-level lock. The trade-off: the `idempotency_keys` table stores one row per
   successful payment (a small write amplification) in exchange for a durable, replayable
   response — the right swap for a payment endpoint.

2. **Integer cents everywhere, no `DECIMAL` column type.** SQLite has no native `DECIMAL`;
   storing `REAL` would invite floating-point drift. Storing `INTEGER` cents with
   `CHECK (total_amount > 0)` and a deterministic remainder allocator removes an entire
   class of bugs. The trade-off: the API contract requires callers to send cents (not dollars),
   which is documented clearly and enforced by validation.

3. **Two separate Hono sub-apps for bill routes** (`billsCreateRoute` mounted at `/api/homes`,
   `billsFetchRoute` mounted at `/api/bills`). A single router with both `/:homeId/bills` and
   `/:billId` would create path-param ambiguity. Splitting them by mount point keeps each
   route file's params unambiguous and the routing table trivially readable. The trade-off is
   one extra export — a negligible cost for clarity.

---

## Known limitations

- **No authentication / multi-tenancy.** Any caller can access any home by ID. The assignment
  scope did not require auth; production would add a session or token layer with row-level
  access checks.
- **No bill-listing endpoint.** The dashboard focuses on balances. To view a specific bill's
  shares, the bill ID (returned at creation) is entered in the "Open bill" shortcut.
  A `GET /api/homes/:homeId/bills` list endpoint would be a natural extension.
- **Local D1 only.** `wrangler.jsonc` ships with `database_id: "LOCAL_PLACEHOLDER"`. Deploying
  to production requires creating a real D1 database (`wrangler d1 create homesplit-db`),
  updating the ID, and running `pnpm db:migrate` against the remote.
- **Frontend test coverage is unit-only.** Component/integration tests with Testing Library
  are scaffolded (`test-setup.ts`, jsdom config) but the current suite covers the pure
  helpers; the full UI flow is verified manually via browser automation.

---

## Submission readiness

| Criterion | Status |
|---|---|
| All 5 required API endpoints implemented | ✅ |
| Database schema with ≥3 named constraints | ✅ (5 named + 7 CHECK) |
| Bill splitting uses integer cents | ✅ |
| Remainder allocation deterministic | ✅ |
| `sum(shares) === total` always | ✅ (invariant + fuzz tests) |
| Payment idempotency implemented | ✅ |
| Concurrent payment behaviour verified | ✅ (8 + 10 parallel requests) |
| Balance calculations correct | ✅ |
| Frontend fully connected to backend | ✅ (browser-verified) |
| No `any` types | ✅ (`noExplicitAny: "error"` in biome) |
| Loading / empty / error states | ✅ |
| Responsive UI (mobile + desktop) | ✅ (375px + 1280px verified) |
| Backend tests pass | ✅ 49/49 |
| Frontend tests pass | ✅ 14/14 |
| TypeScript typecheck passes | ✅ both workspaces |
| Backend build (wrangler dry-run) | ✅ 106 KiB |
| Frontend build (vite) | ✅ 89 KiB gzip |
| README accurate | ✅ |
| No secrets committed | ✅ |

---

Built as an SDE internship assignment. HomeSplit — split fairly, settle confidently.
#   H o m e - S p l i t  
 #   H o m e - S p l i t  
 