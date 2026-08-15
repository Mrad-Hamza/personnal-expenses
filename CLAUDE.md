# CLAUDE.md

Guidance for working in this repository.

## What this is

A personal expenses and inflation tracker: log purchases (product name +
price), view spend by week/month/year, and track per-product price changes
over time. Full design: [docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md](docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md).
Implementation plan (backend): [docs/superpowers/plans/2026-08-15-expenses-api-backend.md](docs/superpowers/plans/2026-08-15-expenses-api-backend.md).

## Layout

```
apps/api/   NestJS REST API — Prisma + PostgreSQL, JWT-cookie auth
apps/web/   Next.js frontend (not yet implemented — separate plan, written after the API is done)
```

Root is an **npm workspaces** monorepo (`"workspaces": ["apps/*"]`) —
never introduce pnpm or yarn lockfiles/commands here.

## Current status (as of this checkpoint)

Done, tested, and merged to `master`: monorepo/Docker scaffold, NestJS app
skeleton with a `/health` route, Prisma schema + migration, and the full
auth flow (register, login, logout, `/auth/me`, JWT-cookie guard).

Not yet built: Categories, Products, Purchases, and Analytics modules; the
global exception filter; the root README. These are Tasks 6–11 in the
implementation plan linked above — pick up there.

## Backend conventions (`apps/api`)

- Every domain module follows the same shape: `*.module.ts`,
  `*.controller.ts` (HTTP layer, e2e tested), `*.service.ts` (business
  logic, unit tested with a mocked `PrismaService`), `dto/*.dto.ts`
  (`class-validator` decorators). See `auth/` for the reference example.
- Every domain route is guarded with `@UseGuards(JwtAuthGuard)` and reads
  the current user via `@CurrentUser() user: JwtPayload`, using `user.sub`
  as the `userId` for every Prisma query. Every table row is scoped by
  `userId` — never query across users.
- **`req.user` has two different shapes depending on which guard ran**:
  `LocalAuthGuard` (only on `POST /auth/login`) attaches a `SafeUser`
  (`{ id, email }`); `JwtAuthGuard` (everywhere else) attaches the raw
  `JwtPayload` (`{ sub, email }`). Don't confuse `.id` and `.sub`.
- `PrismaModule` is `@Global()`, so any module can inject `PrismaService`
  directly without importing `PrismaModule` itself.
- Prisma `Decimal` fields (`Purchase.price`) must be converted with
  `Number(...)` before being returned from a service method, so API JSON
  responses always carry numeric prices, not Decimal-serialized strings.
- **Dependency versions are pinned exactly, no `^`/`~` ranges**, in
  `apps/api/package.json`. When adding a new dependency, install it with
  `npm install --save-exact --workspace=apps/api <pkg>` rather than
  hand-editing a version number in — this also keeps `package-lock.json`
  consistent.
- Config lives in `apps/api/.env` (see `.env.example`), loaded via
  `dotenv/config` at the top of `main.ts` and via Jest's `setupFiles` in
  both `package.json`'s `jest` block (unit tests) and `test/jest-e2e.json`
  (e2e tests). Prisma CLI commands load it explicitly via `dotenv-cli`
  (see the `prisma:*` scripts) rather than relying on Prisma's own
  schema-adjacent `.env` discovery.
- `tsconfig.json` has `esModuleInterop: true` — required for default
  imports like `import request from 'supertest'` or
  `import cookieParser from 'cookie-parser'` to actually work at runtime,
  not just type-check. Don't remove it.

## Testing

- Unit tests (`*.spec.ts`, colocated with the code they test) mock
  `PrismaService` entirely — no database needed, fast.
- e2e tests (`apps/api/test/*.e2e-spec.ts`) boot the real `AppModule`
  against the local Postgres from `docker compose up -d` and clean all
  tables in `afterEach`. Postgres must be running for
  `npm run test:api:e2e` to pass.
- New logic-bearing code (matching/aggregation algorithms, auth) is
  written test-first (TDD): a failing test, then the minimal
  implementation.

## Local environment notes

- **Docker Desktop** and **GitHub CLI (`gh`)** were both installed via
  `winget` mid-session, after this shell's `PATH` was already captured —
  so commands may need the full executable path (e.g.
  `"C:\Program Files\Docker\Docker\resources\bin\docker.exe"`) until a
  fresh shell picks up the updated `PATH`.
- GitHub remote: `https://github.com/Mrad-Hamza/personnal-expenses` (public).

## Where designs and plans live

- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`

## Workflow preferences

- Implementation happens **inline, task by task**, following the written
  plan in `docs/superpowers/plans/`. Each plan task gets its own git
  branch, is implemented with TDD (failing test → minimal implementation →
  passing test), committed, and merged to `master` with `--no-ff` before
  starting the next task's branch.
- The user is learning NestJS (and later Next.js) through this project —
  explain new concepts (modules, DI, guards/strategies, decorators, Prisma
  patterns, etc.) as they come up during implementation, not just silently
  write the code.
