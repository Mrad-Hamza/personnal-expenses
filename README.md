# Personal Expenses & Inflation Tracker

Log purchases (product name + price), see spend by week/month/year, and
track how prices for individual products change over time.

Design spec: [docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md](docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md)

This repo currently contains the backend API (`apps/api`) — auth,
categories, products, purchases, and analytics are all implemented. The
frontend (`apps/web`) is a separate, not-yet-implemented plan.

## Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL)

## Setup

```bash
npm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
# Generate a real secret and paste it into apps/api/.env as JWT_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run prisma:generate
npm run prisma:migrate:deploy
```

`prisma:migrate:deploy` applies existing migrations without prompting —
use it for setup. `npm run prisma:migrate` (i.e. `prisma migrate dev`) is
for authoring a *new* migration while changing `schema.prisma` during
development.

## Running the API

```bash
npm run dev:api
```

The API listens on `http://localhost:3001` (`PORT` in `apps/api/.env`).
`GET /health` returns `{ "status": "ok" }` once it's up.

## API routes

All routes below except `/health`, `/auth/register`, and `/auth/login`
require the JWT auth cookie set by `POST /auth/login` (`@UseGuards(JwtAuthGuard)`).
Every resource is scoped to the authenticated user.

| Module     | Routes                                                                 |
|------------|-------------------------------------------------------------------------|
| Health     | `GET /health`                                                          |
| Auth       | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| Categories | `GET /categories`, `POST /categories`                                  |
| Products   | `GET /products` (autocomplete search), `GET /products/:id`             |
| Purchases  | `POST /purchases`, `GET /purchases`, `PATCH /purchases/:id`, `DELETE /purchases/:id` |
| Analytics  | `GET /analytics/spend`, `GET /analytics/spend-by-category`, `GET /analytics/inflation`, `GET /analytics/inflation-overview` |

Live interactive docs: `GET /docs` (Swagger UI) and `GET /docs-json`
(raw OpenAPI spec) once the API is running. A Postman collection
generated from that spec lives at
[docs/postman/personnal-expenses.postman_collection.json](docs/postman/personnal-expenses.postman_collection.json)
— regenerate it after changing routes with:

```bash
npm run docs:generate -w apps/api
```

## Testing

```bash
npm run test:api       # unit tests
npm run test:api:e2e   # e2e tests (requires Postgres running)
```

## Environment variables (`apps/api/.env`)

| Variable       | Purpose                                   |
|----------------|--------------------------------------------|
| `DATABASE_URL` | Postgres connection string                |
| `JWT_SECRET`   | Signs/verifies the auth cookie's JWT       |
| `PORT`         | Port the API listens on (default `3001`)  |
