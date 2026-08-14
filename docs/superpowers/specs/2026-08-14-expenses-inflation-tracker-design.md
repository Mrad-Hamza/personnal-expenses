# Personal Expenses & Inflation Tracker — Design Spec

**Date:** 2026-08-14
**Status:** Approved for implementation planning

## Summary

A personal web app for logging purchases (product name + price) and viewing
spending totals over time (week/month/year) plus a dashboard that tracks how
prices for individual products change over time — a personal inflation
tracker. Built with NestJS (API) and Next.js (frontend). Starts as a
single-user app with authentication, designed so it can be extended to
multiple users later without a schema rework.

## Goals

- Make logging a purchase (name + price) fast enough to do every time you buy something.
- Show total spend broken down by week, month, and year.
- Track price changes per product over time and surface an "inflation" view:
  which products got more/less expensive, and by how much.
- Group products into categories for spend-by-category breakdowns.
- Keep the whole thing simple to run locally, with a clear path to deploying
  to a personal server later.

## Non-Goals (v1)

- Multi-currency support (single implicit currency).
- Multi-user support (schema is user-scoped from day one, but only one
  account is created; no invite flow, no per-user permissions).
- Quantity/unit tracking (price-per-kg etc.) — purchases are logged as total
  price paid, not price-per-unit.
- Password reset / email verification flows.
- Offline support or optimistic UI.
- Receipt scanning/import, bank integration, or any automated purchase capture.

## Architecture

```
apps/
  api/    NestJS — REST API, Prisma ORM, Postgres, JWT auth (Passport)
  web/    Next.js (App Router) — Tailwind + shadcn/ui, TanStack Query, Recharts
docker-compose.yml   → Postgres (api/web run via `npm run dev` locally in v1)
package.json         → npm workspaces root ("workspaces": ["apps/*"])
```

- **Monorepo**: npm workspaces with two apps (`apps/api`, `apps/web`) sharing
  a root `package.json`/base `tsconfig`. No Nx/Turborepo — unnecessary
  tooling overhead for a single-developer, two-app project.
- **Communication**: `web` calls `api` over REST/JSON. During dev, Next.js
  proxies/rewrites API requests to avoid CORS friction. Auth token travels as
  an httpOnly cookie set by the API.
- **Local run**: `docker-compose up` starts Postgres only; `api` and `web`
  run via `npm run dev`. `api`/`web` containers can be added to compose later
  when moving to a server.
- **Data ownership**: every domain row carries a `userId` from the start, so
  extending to real multi-user later means removing the "current user"
  shortcut rather than migrating the schema.

## Data Model

```
User
  id            uuid, PK
  email         string, unique
  passwordHash  string
  createdAt     datetime

Category
  id        uuid, PK
  userId    uuid, FK -> User
  name      string          -- e.g. Groceries, Transport, Utilities
                             -- a default set is seeded per new user; user can add more

Product
  id          uuid, PK
  userId      uuid, FK -> User
  categoryId  uuid, FK -> Category
  name        string
  createdAt   datetime

Purchase
  id            uuid, PK
  userId        uuid, FK -> User
  productId     uuid, FK -> Product
  price         decimal
  purchasedAt   date
  createdAt     datetime
```

Notes:

- **Product identity / fuzzy reuse**: when logging a purchase, the entry form
  queries `GET /products?search=` for similar existing product names
  (case-insensitive substring/trigram match, scoped to the user) and offers
  them as autocomplete suggestions. Picking a suggestion reuses that
  `Product` (and its category); typing a name with no match creates a new
  `Product` on save. This is what links purchases of "the same thing" across
  time for inflation tracking, without forcing a rigid catalog-management UI.
- **Category lives on `Product`, not `Purchase`** — a product's category
  doesn't change purchase to purchase, and this keeps category-level
  aggregation a simple join through `Product`.
- **Price is the total paid** for that purchase, not a per-unit price.
- No `currency` column in v1 (see Non-Goals).

## API Design (REST, all non-auth routes scoped to `request.user`)

**Auth**
- `POST /auth/register` — `{ email, password }`. No invite/verification gate (local-only deployment).
- `POST /auth/login` — `{ email, password }`, sets httpOnly JWT cookie.
- `POST /auth/logout`
- `GET /auth/me`

**Categories**
- `GET /categories`
- `POST /categories` — `{ name }`

**Products**
- `GET /products?search=` — fuzzy name match, powers autocomplete.
- `GET /products/:id` — product detail + its full purchase history (price over time).

**Purchases**
- `POST /purchases` — `{ productName, productId?, categoryId?, price, purchasedAt }`.
  If `productId` is present (user picked an autocomplete suggestion) it's
  reused; otherwise a new `Product` is created from `productName` +
  `categoryId`.
- `GET /purchases?from=&to=` — history, filterable by date range.
- `PATCH /purchases/:id`
- `DELETE /purchases/:id`

**Analytics**
- `GET /analytics/spend?period=week|month|year&from=&to=` — total spend bucketed over time.
- `GET /analytics/spend-by-category?period=&from=&to=` — same, broken down by category.
- `GET /analytics/inflation?productId=` — price-over-time series for one product.
- `GET /analytics/inflation-overview?period=year` — products with the largest
  price increases/decreases over the selected range.

## Auth Flow

- Passwords hashed with bcrypt; login via Passport-Local strategy.
- On success, API issues a JWT set as an **httpOnly, SameSite=Lax cookie**
  (never returned in the JSON body) — avoids XSS token theft, no manual
  token handling in the frontend.
- A NestJS `AuthGuard` (JWT strategy reading the cookie) protects all
  `/products`, `/purchases`, `/categories`, `/analytics` routes, injecting
  `userId` into `request.user`; every query is scoped to that user
  automatically.
- Next.js middleware checks for the cookie's presence to redirect
  unauthenticated visitors to `/login`; the API still validates the token on
  every request regardless.
- No refresh-token rotation or password-reset flow in v1.

## Frontend

**Pages**
- `/login`, `/register` — auth forms.
- `/` — home/quick-add: prominent "log a purchase" form (product name with
  autocomplete, price, date defaulting to today, category auto-filled from
  the picked product or chosen for a new one) plus at-a-glance totals for
  this week/month/year.
- `/expenses` — full purchase history: filterable/sortable table (date
  range, category, product), inline edit/delete.
- `/dashboard` — analytics:
  - Spend-over-time chart (togglable week/month/year buckets).
  - Spend-by-category breakdown (bar or donut).
  - Inflation panel: "biggest movers" list (largest price change over the
    selected period) plus a per-product drill-down line chart on click.

**Stack**
- Next.js App Router; server components for simple initial data fetches
  (e.g. history table); TanStack Query for interactive/client-side data
  (autocomplete, mutations, live-updating charts).
- Tailwind + shadcn/ui for forms, tables, cards, combobox, dialogs.
- Recharts for all charts.
- `react-hook-form` + `zod` for form validation, mirroring API validation rules.

## Error Handling

- API: global exception filter → consistent JSON error shape
  (`{ statusCode, message, error }`); `class-validator` DTOs validate all
  inputs (e.g. price must be positive, `purchasedAt` must be a valid date),
  returning 400 with field-level messages.
- Auth failures → 401; frontend redirects to `/login` on 401 responses.
- Frontend surfaces API errors via shadcn `Sonner`/`Toast`; form-level
  validation errors shown inline via `react-hook-form` + `zod`.
- No offline support or optimistic UI in v1.

## Testing

- **API**: Jest. Unit tests for services with real logic (product fuzzy
  matching, analytics aggregation queries). E2E tests for main flows
  (register/login, add purchase → appears in analytics) against a test
  Postgres DB via docker-compose.
- **Web**: React Testing Library component tests for the add-expense form
  and dashboard charts. No Playwright/full E2E in v1.
- TDD for the logic-heavy pieces (product matching, analytics aggregation).

## Dev Setup & Deployment

- `docker-compose.yml`: Postgres service only in v1; `api`/`web` run via
  `npm run dev`.
- Root `.env` (gitignored) for `DATABASE_URL`, `JWT_SECRET`; `.env.example`
  committed.
- Prisma migrations committed to the repo (`prisma/migrations`); npm scripts
  for `db:migrate` and `db:seed` (seeds default categories).
- Deployment target for v1 is the local machine; the Postgres-via-Docker
  choice and user-scoped schema keep the path to a self-hosted server (or
  later multi-user) open without rework.
- A `CLAUDE.md` (repo conventions/architecture, for future Claude sessions)
  and a `README.md` (human setup steps) will be created as part of initial
  project scaffolding in the implementation plan.

## Open Questions / Future Extensions (not part of v1)

- Multi-user support (auth already user-scoped; would need registration
  gating/invites and possibly per-user data export).
- Multi-currency.
- Price-per-unit tracking for more accurate inflation math.
- Password reset flow if ever deployed beyond local-only use.
