# Expenses API Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the NestJS + Prisma + PostgreSQL REST API for the personal expenses & inflation tracker — auth, categories, products, purchases, and analytics — as a standalone, fully tested backend. The Next.js frontend is a separate plan that consumes this API once it's done.

**Architecture:** A single NestJS app (`apps/api`) inside an npm-workspaces monorepo, backed by PostgreSQL via Prisma. JWT auth via an httpOnly cookie protects every domain route; every row is scoped by `userId`. Each domain area (auth, categories, products, purchases, analytics) is its own Nest module with a service (business logic, unit tested) and a controller (HTTP layer, e2e tested).

**Tech Stack:** NestJS 10 (REST, Express), Prisma 5 + PostgreSQL 16 (via Docker), Passport (local + JWT strategies), bcryptjs, class-validator/class-transformer, date-fns, Jest + Supertest.

**Spec:** [docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md](../specs/2026-08-14-expenses-inflation-tracker-design.md)

## Global Constraints

- Monorepo uses **npm workspaces** (not pnpm/yarn) — root `package.json` with `"workspaces": ["apps/*"]`.
- Backend is **REST**, not GraphQL; ORM is **Prisma** against **PostgreSQL**, run locally via Docker Compose.
- Auth: JWT stored in an **httpOnly, SameSite=Lax cookie**; passwords hashed with **bcryptjs** (pure-JS, avoids native build tools on Windows). No password reset, no refresh-token rotation in v1.
- Every domain table (`Category`, `Product`, `Purchase`) is scoped by `userId` from the start, even though only one account exists in v1.
- No multi-currency, no quantity/unit tracking, no offline/optimistic UI — purchases store total price paid only.
- Default categories (8, fixed list) are created **per user at registration**, not via a standalone DB seed script.
- Deployment target for v1 is local-only: Docker Compose runs Postgres only; the API runs via `npm run dev:api`.
- TDD for all logic-bearing code (product matching, analytics aggregation, auth). Jest for unit tests, Supertest for e2e tests against a real local Postgres.
- Prisma `Decimal` fields (`price`) must be explicitly converted to JS `number` before being returned from any service method, so API responses are always numeric, never Decimal-serialized strings.

---

## Task 1: Monorepo scaffold & Postgres via Docker

**Files:**
- Create: `package.json` (root)
- Create: `.gitignore` (root)
- Create: `docker-compose.yml` (root)

**Interfaces:**
- Produces: root npm workspace pointing at `apps/*`; a `db` Docker service reachable at `localhost:5432` with user/password/db all `expenses`.

- [ ] **Step 1: Create the root `package.json`**

```json
{
  "name": "personnal-expenses",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "apps/*"
  ],
  "scripts": {
    "dev:api": "npm run start:dev -w apps/api",
    "build:api": "npm run build -w apps/api",
    "test:api": "npm run test -w apps/api",
    "test:api:e2e": "npm run test:e2e -w apps/api",
    "prisma:generate": "npm run prisma:generate -w apps/api",
    "prisma:migrate": "npm run prisma:migrate -w apps/api",
    "prisma:migrate:deploy": "npm run prisma:migrate:deploy -w apps/api"
  }
}
```

- [ ] **Step 2: Create the root `.gitignore`**

```
node_modules/
dist/
coverage/
apps/*/dist/
apps/*/.env
.env
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: expenses
      POSTGRES_PASSWORD: expenses
      POSTGRES_DB: expenses
    ports:
      - "5432:5432"
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U expenses"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  db-data:
```

- [ ] **Step 4: Start Postgres and verify it's healthy**

Run: `docker compose up -d` then `docker compose ps`
Expected: the `db` service shows `running (healthy)`. Leave it running — every later task needs it.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore docker-compose.yml
git commit -m "chore: scaffold npm workspace monorepo and Postgres via Docker

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: NestJS app skeleton with a health check endpoint

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/tsconfig.build.json`
- Create: `apps/api/nest-cli.json`
- Create: `apps/api/.env.example`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/app.controller.ts`
- Create: `apps/api/test/jest-e2e.json`
- Test: `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Produces: a running Nest app on `PORT` (default 3001) with `GET /health` → `{ status: 'ok' }`. All later modules import into `AppModule`. Global `ValidationPipe({ whitelist: true, transform: true })` and `cookie-parser` are wired in `main.ts` from this task on — later tasks only add to `main.ts`, never remove these.

- [ ] **Step 1: Create `apps/api/package.json`**

```json
{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.6",
    "dotenv": "^16.4.5",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/cookie-parser": "^1.4.7",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "setupFiles": ["dotenv/config"],
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `apps/api/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitAny": true,
    "strictBindCallApply": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

- [ ] **Step 3: Create `apps/api/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 4: Create `apps/api/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 5: Create `apps/api/.env.example`**

```
DATABASE_URL=postgresql://expenses:expenses@localhost:5432/expenses?schema=public
JWT_SECRET=replace-with-a-long-random-string
PORT=3001
```

- [ ] **Step 6: Install dependencies**

Run (from repo root): `npm install`
Expected: completes without errors; `apps/api/node_modules` is hoisted into the root `node_modules`.

- [ ] **Step 7: Create the real `.env` and generate a JWT secret**

Run:
```bash
cp apps/api/.env.example apps/api/.env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Paste the printed value into `apps/api/.env` as `JWT_SECRET`.

- [ ] **Step 8: Create `apps/api/src/main.ts`**

```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({ origin: true, credentials: true });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
bootstrap();
```

- [ ] **Step 9: Create `apps/api/src/app.module.ts` and an empty `apps/api/src/app.controller.ts`**

`apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
```

`apps/api/src/app.controller.ts`:
```ts
import { Controller } from '@nestjs/common';

@Controller()
export class AppController {}
```

- [ ] **Step 10: Create `apps/api/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "setupFiles": ["dotenv/config"],
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

- [ ] **Step 11: Write the failing e2e test — `apps/api/test/app.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

- [ ] **Step 12: Run the e2e test and verify it fails**

Run: `npm run test:e2e -w apps/api`
Expected: FAIL — 404 Not Found on `GET /health`.

- [ ] **Step 13: Add the health route**

Modify `apps/api/src/app.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
```

- [ ] **Step 14: Run the e2e test again and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS.

- [ ] **Step 15: Commit**

```bash
git add apps/api package.json
git commit -m "feat(api): scaffold NestJS app with a health check endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Prisma schema, migrations, and PrismaService

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Test: `apps/api/src/prisma/prisma.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PrismaService` (extends `PrismaClient`, connects in `onModuleInit`, disconnects in `onModuleDestroy`) exported globally from `PrismaModule`. Every later module injects `PrismaService` via constructor. Prisma models: `User { id, email, passwordHash, createdAt }`, `Category { id, userId, name }`, `Product { id, userId, categoryId, name, createdAt }`, `Purchase { id, userId, productId, price: Decimal, purchasedAt: Date, createdAt }`.

- [ ] **Step 1: Modify `apps/api/package.json`** — add Prisma dependencies and scripts

Add to `"dependencies"`: `"@prisma/client": "^5.19.0"`
Add to `"devDependencies"`: `"prisma": "^5.19.0"`, `"dotenv-cli": "^7.4.2"`
Add to `"scripts"`:
```json
"prisma:generate": "dotenv -e .env -- prisma generate",
"prisma:migrate": "dotenv -e .env -- prisma migrate dev",
"prisma:migrate:deploy": "dotenv -e .env -- prisma migrate deploy"
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without errors.

- [ ] **Step 3: Create `apps/api/prisma/schema.prisma`**

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String     @id @default(uuid())
  email        String     @unique
  passwordHash String
  createdAt    DateTime   @default(now())
  categories   Category[]
  products     Product[]
  purchases    Purchase[]
}

model Category {
  id       String    @id @default(uuid())
  userId   String
  user     User      @relation(fields: [userId], references: [id])
  name     String
  products Product[]

  @@unique([userId, name])
}

model Product {
  id         String     @id @default(uuid())
  userId     String
  user       User       @relation(fields: [userId], references: [id])
  categoryId String
  category   Category   @relation(fields: [categoryId], references: [id])
  name       String
  createdAt  DateTime   @default(now())
  purchases  Purchase[]

  @@index([userId, name])
}

model Purchase {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  productId   String
  product     Product  @relation(fields: [productId], references: [id])
  price       Decimal  @db.Decimal(10, 2)
  purchasedAt DateTime @db.Date
  createdAt   DateTime @default(now())

  @@index([userId, purchasedAt])
}
```

- [ ] **Step 4: Generate the Prisma client**

Run: `npm run prisma:generate -w apps/api`
Expected: "Generated Prisma Client" success message.

- [ ] **Step 5: Run the initial migration** (requires Postgres running from Task 1)

Run: `npm run prisma:migrate -w apps/api -- --name init`
Expected: creates `apps/api/prisma/migrations/<timestamp>_init/migration.sql` and applies it; ends with "Your database is now in sync with your schema."

- [ ] **Step 6: Write the failing test — `apps/api/src/prisma/prisma.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('connects and can query the database', async () => {
    const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
    expect(result[0].ok).toBe(1);
  });
});
```

- [ ] **Step 7: Run the test and verify it fails**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './prisma.service'`.

- [ ] **Step 8: Implement `PrismaService` and `PrismaModule`**

`apps/api/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 9: Wire `PrismaModule` into `AppModule`**

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 10: Run the test again and verify it passes**

Run: `npm run test -w apps/api`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api
git commit -m "feat(api): add Prisma schema, migration, and PrismaService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: AuthService — registration, credential validation, token signing

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/categories/default-categories.ts`
- Create: `apps/api/src/auth/dto/register.dto.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3).
- Produces: `DEFAULT_CATEGORY_NAMES: readonly string[]` (8 names). `AuthService.register(dto: RegisterDto): Promise<SafeUser>` — creates the user, hashes the password, and creates all 8 default categories in one transaction; throws `ConflictException` if the email is taken. `AuthService.validateUser(email: string, password: string): Promise<SafeUser | null>`. `AuthService.signToken(user: SafeUser): Promise<string>`. `AuthService.setAuthCookie(res: Response, token: string): void`. `SafeUser = { id: string; email: string }` — exported from `auth.service.ts`. Task 5 (controller/guards) consumes all of these directly.

- [ ] **Step 1: Modify `apps/api/package.json`** — add auth dependencies

Add to `"dependencies"`: `"@nestjs/jwt": "^10.2.0"`, `"bcryptjs": "^2.4.3"`
Add to `"devDependencies"`: `"@types/bcryptjs": "^2.4.6"`

- [ ] **Step 2: Install dependencies**

Run: `npm install`

- [ ] **Step 3: Create `apps/api/src/categories/default-categories.ts`**

```ts
export const DEFAULT_CATEGORY_NAMES = [
  'Groceries',
  'Transport',
  'Utilities',
  'Dining',
  'Entertainment',
  'Health',
  'Shopping',
  'Other',
] as const;
```

- [ ] **Step 4: Create `apps/api/src/auth/dto/register.dto.ts`**

```ts
import { IsEmail, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;
}
```

- [ ] **Step 5: Write the failing unit tests — `apps/api/src/auth/auth.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: any; category: any; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      category: { createMany: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed-token') },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('creates a user with a hashed password and 8 default categories', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash: 'hashed' });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    const createdHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare('password123', createdHash)).toBe(true);
    expect(prisma.category.createMany.mock.calls[0][0].data).toHaveLength(8);
    expect(prisma.category.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('rejects registration when the email is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({ email: 'a@b.com', password: 'password123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('validateUser returns null for a wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

    const result = await service.validateUser('a@b.com', 'wrong-password');

    expect(result).toBeNull();
  });

  it('validateUser returns the safe user for a correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

    const result = await service.validateUser('a@b.com', 'correct-password');

    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
  });
});
```

- [ ] **Step 6: Run the tests and verify they fail**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './auth.service'`.

- [ ] **Step 7: Implement `apps/api/src/auth/auth.service.ts`**

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { DEFAULT_CATEGORY_NAMES } from '../categories/default-categories';

export type SafeUser = { id: string; email: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORY_NAMES.map((name) => ({ name, userId: created.id })),
      });
      return created;
    });

    return { id: user.id, email: user.email };
  }

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return null;
    return { id: user.id, email: user.email };
  }

  async signToken(user: SafeUser): Promise<string> {
    return this.jwtService.signAsync({ sub: user.id, email: user.email });
  }

  setAuthCookie(res: Response, token: string): void {
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
```

- [ ] **Step 8: Run the tests again and verify they pass**

Run: `npm run test -w apps/api`
Expected: PASS (4 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/api
git commit -m "feat(api): add AuthService with registration and credential validation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Auth HTTP layer — controller, guards, strategies, JWT cookie

**Files:**
- Create: `apps/api/src/auth/types/jwt-payload.type.ts`
- Create: `apps/api/src/auth/strategies/local.strategy.ts`
- Create: `apps/api/src/auth/strategies/jwt.strategy.ts`
- Create: `apps/api/src/auth/guards/local-auth.guard.ts`
- Create: `apps/api/src/auth/guards/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/decorators/current-user.decorator.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/test/auth.e2e-spec.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AuthService`, `SafeUser` (Task 4).
- Produces: `JwtPayload = { sub: string; email: string }`. `JwtAuthGuard` and `CurrentUser` decorator — **every later module** (Categories, Products, Purchases, Analytics) guards its controller with `@UseGuards(JwtAuthGuard)` and reads the current user with `@CurrentUser() user: JwtPayload`, using `user.sub` as the `userId`. Routes: `POST /auth/register` (201), `POST /auth/login` (200), `POST /auth/logout` (200), `GET /auth/me` (200, guarded).
- **Note on `req.user` shape:** `LocalAuthGuard` (used only on `/auth/login`) attaches a `SafeUser` (`{ id, email }`) to `request.user`. `JwtAuthGuard` (used everywhere else) attaches the raw `JwtPayload` (`{ sub, email }`) instead — the id field is named differently (`id` vs `sub`) between the two. This is intentional: don't unify them.

- [ ] **Step 1: Modify `apps/api/package.json`** — add Passport dependencies

Add to `"dependencies"`: `"@nestjs/passport": "^10.0.3"`, `"passport": "^0.7.0"`, `"passport-local": "^1.0.0"`, `"passport-jwt": "^4.0.1"`
Add to `"devDependencies"`: `"@types/passport-local": "^1.0.38"`, `"@types/passport-jwt": "^4.0.1"`

- [ ] **Step 2: Install dependencies**

Run: `npm install`

- [ ] **Step 3: Create the supporting auth files**

`apps/api/src/auth/types/jwt-payload.type.ts`:
```ts
export interface JwtPayload {
  sub: string;
  email: string;
}
```

`apps/api/src/auth/strategies/local.strategy.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return user;
  }
}
```

`apps/api/src/auth/strategies/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../types/jwt-payload.type';

function cookieExtractor(req: Request): string | null {
  return req?.cookies?.token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: cookieExtractor,
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: JwtPayload) {
    return payload;
  }
}
```

`apps/api/src/auth/guards/local-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

`apps/api/src/auth/guards/jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`apps/api/src/auth/decorators/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
```

- [ ] **Step 4: Create `apps/api/src/auth/auth.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthService, SafeUser } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './types/jwt-payload.type';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.register(dto);
    const token = await this.authService.signToken(user);
    this.authService.setAuthCookie(res, token);
    return user;
  }

  @HttpCode(HttpStatus.OK)
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@CurrentUser() user: SafeUser, @Res({ passthrough: true }) res: Response) {
    const token = await this.authService.signToken(user);
    this.authService.setAuthCookie(res, token);
    return user;
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('token');
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.sub, email: user.email };
  }
}
```

- [ ] **Step 5: Create `apps/api/src/auth/auth.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 6: Wire `AuthModule` into `AppModule`**

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
```

- [ ] **Step 7: Write the failing e2e test — `apps/api/test/auth.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a user, seeds 8 default categories, and sets an auth cookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123' })
      .expect(201);

    expect(res.body).toEqual({ id: expect.any(String), email: 'test@example.com' });
    expect(res.headers['set-cookie'][0]).toMatch(/^token=/);

    const categories = await prisma.category.findMany({ where: { userId: res.body.id } });
    expect(categories).toHaveLength(8);
  });

  it('rejects registration with a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'password123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dupe@example.com', password: 'password123' })
      .expect(409);
  });

  it('logs in with correct credentials and rejects incorrect ones', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'login@example.com', password: 'password123' })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'password123' })
      .expect(200);
    expect(loginRes.headers['set-cookie'][0]).toMatch(/^token=/);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'wrong-password' })
      .expect(401);
  });

  it('GET /auth/me requires a valid auth cookie', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);

    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/register')
      .send({ email: 'me@example.com', password: 'password123' })
      .expect(201);

    const meRes = await agent.get('/auth/me').expect(200);
    expect(meRes.body).toEqual({ id: expect.any(String), email: 'me@example.com' });
  });
});
```

- [ ] **Step 8: Run the e2e test and verify it fails**

Run: `npm run test:e2e -w apps/api`
Expected: FAIL (routes don't exist yet / compile error if any file from Step 3-6 was skipped — all should already be created above, so this mainly confirms the suite runs; if everything in Steps 3-6 was done first, note that and treat this as a red-to-green sanity run instead).

- [ ] **Step 9: Run the e2e test again and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS (4 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): add auth HTTP layer with JWT cookie sessions

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Categories module — list and create

**Files:**
- Create: `apps/api/src/categories/dto/create-category.dto.ts`
- Create: `apps/api/src/categories/categories.service.ts`
- Create: `apps/api/src/categories/categories.controller.ts`
- Create: `apps/api/src/categories/categories.module.ts`
- Test: `apps/api/src/categories/categories.service.spec.ts`
- Test: `apps/api/test/categories.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 3), `JwtAuthGuard` + `CurrentUser` + `JwtPayload` (Task 5).
- Produces: `GET /categories` (200, guarded, returns the current user's categories sorted by name), `POST /categories` (201, guarded, body `{ name: string }`, 409 on case-insensitive duplicate).

- [ ] **Step 1: Create `apps/api/src/categories/dto/create-category.dto.ts`**

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;
}
```

- [ ] **Step 2: Write the failing unit test — `apps/api/src/categories/categories.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: { category: any };

  beforeEach(async () => {
    prisma = {
      category: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  it('lists categories for the given user only', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Groceries' }]);

    const result = await service.findAll('user-1');

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(result).toEqual([{ id: 'c1', name: 'Groceries' }]);
  });

  it('creates a category when the name is not already used', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({ id: 'c2', name: 'Pets' });

    const result = await service.create('user-1', { name: 'Pets' });

    expect(result).toEqual({ id: 'c2', name: 'Pets' });
  });

  it('rejects a case-insensitive duplicate category name', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'c1', name: 'pets' });

    await expect(service.create('user-1', { name: 'Pets' })).rejects.toThrow(ConflictException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './categories.service'`.

- [ ] **Step 4: Implement `apps/api/src/categories/categories.service.ts`**

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({
      where: { userId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }
    return this.prisma.category.create({ data: { userId, name: dto.name } });
  }
}
```

- [ ] **Step 5: Run the test again and verify it passes**

Run: `npm run test -w apps/api`
Expected: PASS.

- [ ] **Step 6: Create `apps/api/src/categories/categories.controller.ts`**

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.categoriesService.findAll(user.sub);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(user.sub, dto);
  }
}
```

- [ ] **Step 7: Create `apps/api/src/categories/categories.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
```

- [ ] **Step 8: Wire `CategoriesModule` into `AppModule`**

Modify `apps/api/src/app.module.ts` — add `CategoriesModule` to the `imports` array (alongside `PrismaModule`, `AuthModule`) and its import statement.

- [ ] **Step 9: Write the failing e2e test — `apps/api/test/categories.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registeredAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return agent;
  }

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/categories').expect(401);
  });

  it('lists the 8 default categories seeded at registration', async () => {
    const agent = await registeredAgent('cats@example.com');
    const res = await agent.get('/categories').expect(200);
    expect(res.body).toHaveLength(8);
    expect(res.body.map((c: { name: string }) => c.name)).toContain('Groceries');
  });

  it('creates a custom category and rejects a duplicate name', async () => {
    const agent = await registeredAgent('custom@example.com');
    const res = await agent.post('/categories').send({ name: 'Pets' }).expect(201);
    expect(res.body).toEqual(expect.objectContaining({ name: 'Pets' }));

    await agent.post('/categories').send({ name: 'Pets' }).expect(409);
  });
});
```

- [ ] **Step 10: Run the e2e test and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS (3 tests) — the module wiring in Step 8 should already make this green on the first run.

- [ ] **Step 11: Commit**

```bash
git add apps/api
git commit -m "feat(api): add categories module

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Products module — autocomplete search and purchase history

**Files:**
- Create: `apps/api/src/products/products.service.ts`
- Create: `apps/api/src/products/products.controller.ts`
- Create: `apps/api/src/products/products.module.ts`
- Test: `apps/api/src/products/products.service.spec.ts`
- Test: `apps/api/test/products.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard` + `CurrentUser` + `JwtPayload`.
- Produces: `GET /products?search=` (200, guarded, case-insensitive substring match on the current user's products, max 10, empty array for a blank query), `GET /products/:id` (200, guarded, includes `category` and `purchases` ordered oldest-first; 404 if missing or owned by another user).

- [ ] **Step 1: Write the failing unit test — `apps/api/src/products/products.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: { product: any };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn(), findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  it('returns an empty array for a blank search query without hitting the database', async () => {
    const result = await service.search('user-1', '');

    expect(result).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('searches by case-insensitive substring, scoped to the user', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Whole Milk' }]);

    const result = await service.search('user-1', 'milk');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', name: { contains: 'milk', mode: 'insensitive' } },
      }),
    );
    expect(result).toEqual([{ id: 'p1', name: 'Whole Milk' }]);
  });

  it('throws NotFoundException when the product does not belong to the user', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findOneWithHistory('user-1', 'p1')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './products.service'`.

- [ ] **Step 3: Implement `apps/api/src/products/products.service.ts`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  search(userId: string, query: string) {
    const term = query?.trim();
    if (!term) return Promise.resolve([]);
    return this.prisma.product.findMany({
      where: { userId, name: { contains: term, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  async findOneWithHistory(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, userId },
      include: {
        category: true,
        purchases: { orderBy: { purchasedAt: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}
```

- [ ] **Step 4: Run the test again and verify it passes**

Run: `npm run test -w apps/api`
Expected: PASS.

- [ ] **Step 5: Create `apps/api/src/products/products.controller.ts`**

```ts
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { ProductsService } from './products.service';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  search(@CurrentUser() user: JwtPayload, @Query('search') search = '') {
    return this.productsService.search(user.sub, search);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.findOneWithHistory(user.sub, id);
  }
}
```

- [ ] **Step 6: Create `apps/api/src/products/products.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

- [ ] **Step 7: Wire `ProductsModule` into `AppModule`**

Modify `apps/api/src/app.module.ts` — add `ProductsModule` to `imports` and its import statement.

- [ ] **Step 8: Write the failing e2e test — `apps/api/test/products.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registeredAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return { agent, userId: res.body.id as string };
  }

  it('returns products matching a case-insensitive substring search', async () => {
    const { agent, userId } = await registeredAgent('search@example.com');
    const category = await prisma.category.findFirst({ where: { userId } });
    await prisma.product.create({ data: { userId, categoryId: category!.id, name: 'Whole Milk' } });
    await prisma.product.create({ data: { userId, categoryId: category!.id, name: 'Bread' } });

    const res = await agent.get('/products').query({ search: 'milk' }).expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Whole Milk');
  });

  it('returns a product with its purchase history ordered oldest first', async () => {
    const { agent, userId } = await registeredAgent('history@example.com');
    const category = await prisma.category.findFirst({ where: { userId } });
    const product = await prisma.product.create({
      data: { userId, categoryId: category!.id, name: 'Eggs' },
    });
    await prisma.purchase.create({
      data: { userId, productId: product.id, price: 4.0, purchasedAt: new Date('2026-06-01') },
    });
    await prisma.purchase.create({
      data: { userId, productId: product.id, price: 3.5, purchasedAt: new Date('2026-01-01') },
    });

    const res = await agent.get(`/products/${product.id}`).expect(200);

    expect(res.body.name).toBe('Eggs');
    expect(res.body.purchases).toHaveLength(2);
    expect(res.body.purchases[0].purchasedAt).toContain('2026-01-01');
  });

  it('returns 404 for a product belonging to another user', async () => {
    const owner = await registeredAgent('owner@example.com');
    const category = await prisma.category.findFirst({ where: { userId: owner.userId } });
    const product = await prisma.product.create({
      data: { userId: owner.userId, categoryId: category!.id, name: 'Coffee' },
    });

    const other = await registeredAgent('other@example.com');
    await other.agent.get(`/products/${product.id}`).expect(404);
  });
});
```

- [ ] **Step 9: Run the e2e test and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS (3 tests).

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): add products module with autocomplete search

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Purchases module — create (reuse-or-create product), list, update, delete

**Files:**
- Create: `apps/api/src/purchases/dto/create-purchase.dto.ts`
- Create: `apps/api/src/purchases/dto/update-purchase.dto.ts`
- Create: `apps/api/src/purchases/purchases.service.ts`
- Create: `apps/api/src/purchases/purchases.controller.ts`
- Create: `apps/api/src/purchases/purchases.module.ts`
- Test: `apps/api/src/purchases/purchases.service.spec.ts`
- Test: `apps/api/test/purchases.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard` + `CurrentUser` + `JwtPayload`.
- Produces: `POST /purchases` (201), `GET /purchases?from=&to=` (200), `PATCH /purchases/:id` (200), `DELETE /purchases/:id` (200, `{ success: true }`) — all guarded. Every purchase object returned by this module has `price: number` (never a Prisma Decimal). This is the module Task 9 (Analytics) reads purchase data alongside, via its own Prisma queries — Analytics does not call into `PurchasesService` directly.

- [ ] **Step 1: Create the DTOs**

`apps/api/src/purchases/dto/create-purchase.dto.ts`:
```ts
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @MinLength(1)
  productName: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsNumber()
  @IsPositive()
  price: number;

  @IsDateString()
  purchasedAt: string;
}
```

`apps/api/src/purchases/dto/update-purchase.dto.ts`:
```ts
import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsDateString()
  purchasedAt?: string;
}
```

- [ ] **Step 2: Write the failing unit tests — `apps/api/src/purchases/purchases.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: { product: any; category: any; purchase: any };

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn(), create: jest.fn() },
      category: { findFirst: jest.fn() },
      purchase: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PurchasesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PurchasesService);
  });

  const baseDto = { productName: 'Milk', price: 2.5, purchasedAt: '2026-01-01' };

  it('reuses an existing product by exact productId', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-1', price: 2.5 });

    await service.create('user-1', { ...baseDto, productId: 'prod-1' });

    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-1' }) }),
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('reuses a product matched by case-insensitive name', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-2' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-2', price: 2.5 });

    await service.create('user-1', baseDto);

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', name: { equals: 'Milk', mode: 'insensitive' } },
      }),
    );
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-2' }) }),
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('creates a new product when no match exists and categoryId is provided', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
    prisma.product.create.mockResolvedValue({ id: 'prod-3' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-3', price: 2.5 });

    await service.create('user-1', { ...baseDto, categoryId: 'cat-1' });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', categoryId: 'cat-1', name: 'Milk' },
    });
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-3' }) }),
    );
  });

  it('throws when creating a new product without a categoryId', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.create('user-1', baseDto)).rejects.toThrow(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('throws when the given categoryId does not belong to the user', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', { ...baseDto, categoryId: 'not-mine' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('remove() throws NotFoundException for a purchase belonging to another user', async () => {
    prisma.purchase.findFirst.mockResolvedValue(null);

    await expect(service.remove('user-1', 'purchase-x')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './purchases.service'`.

- [ ] **Step 4: Implement `apps/api/src/purchases/purchases.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProductId(userId: string, dto: CreatePurchaseDto): Promise<string> {
    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, userId },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product.id;
    }

    const existing = await this.prisma.product.findFirst({
      where: { userId, name: { equals: dto.productName, mode: 'insensitive' } },
    });
    if (existing) {
      return existing.id;
    }

    if (!dto.categoryId) {
      throw new BadRequestException('categoryId is required when creating a new product');
    }
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, userId },
    });
    if (!category) {
      throw new BadRequestException('Unknown categoryId');
    }

    const created = await this.prisma.product.create({
      data: { userId, categoryId: dto.categoryId, name: dto.productName },
    });
    return created.id;
  }

  async create(userId: string, dto: CreatePurchaseDto) {
    const productId = await this.resolveProductId(userId, dto);
    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        productId,
        price: dto.price,
        purchasedAt: new Date(dto.purchasedAt),
      },
      include: { product: { include: { category: true } } },
    });
    return { ...purchase, price: Number(purchase.price) };
  }

  async findAll(userId: string, from?: string, to?: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        userId,
        purchasedAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { product: { include: { category: true } } },
      orderBy: { purchasedAt: 'desc' },
    });
    return purchases.map((p) => ({ ...p, price: Number(p.price) }));
  }

  async update(userId: string, id: string, dto: UpdatePurchaseDto) {
    await this.findOwned(userId, id);
    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        price: dto.price,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
      },
      include: { product: { include: { category: true } } },
    });
    return { ...updated, price: Number(updated.price) };
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.purchase.delete({ where: { id } });
    return { success: true };
  }

  private async findOwned(userId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({ where: { id, userId } });
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    return purchase;
  }
}
```

- [ ] **Step 5: Run the tests again and verify they pass**

Run: `npm run test -w apps/api`
Expected: PASS (6 tests).

- [ ] **Step 6: Create `apps/api/src/purchases/purchases.controller.ts`**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(user.sub, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.purchasesService.findAll(user.sub, from, to);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(user.sub, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.purchasesService.remove(user.sub, id);
  }
}
```

- [ ] **Step 7: Create `apps/api/src/purchases/purchases.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
```

- [ ] **Step 8: Wire `PurchasesModule` into `AppModule`**

Modify `apps/api/src/app.module.ts` — add `PurchasesModule` to `imports` and its import statement.

- [ ] **Step 9: Write the failing e2e test — `apps/api/test/purchases.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Purchases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registeredAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return { agent, userId: res.body.id as string };
  }

  it('creates a purchase, reusing the same product for a repeated name (case-insensitive)', async () => {
    const { agent, userId } = await registeredAgent('purchases@example.com');
    const categories = await agent.get('/categories').expect(200);
    const categoryId = categories.body[0].id;

    const first = await agent
      .post('/purchases')
      .send({ productName: 'Milk', categoryId, price: 2.5, purchasedAt: '2026-01-01' })
      .expect(201);

    const second = await agent
      .post('/purchases')
      .send({ productName: 'milk', price: 2.8, purchasedAt: '2026-02-01' })
      .expect(201);

    expect(second.body.product.id).toBe(first.body.product.id);
    expect(second.body.price).toBe(2.8);

    const products = await prisma.product.findMany({ where: { userId } });
    expect(products).toHaveLength(1);
  });

  it('rejects creating a new product without a categoryId', async () => {
    const { agent } = await registeredAgent('nocategory@example.com');

    await agent
      .post('/purchases')
      .send({ productName: 'Something New', price: 1, purchasedAt: '2026-01-01' })
      .expect(400);
  });

  it('lists purchases filtered by date range', async () => {
    const { agent } = await registeredAgent('list@example.com');
    const categories = await agent.get('/categories').expect(200);
    const categoryId = categories.body[0].id;

    await agent
      .post('/purchases')
      .send({ productName: 'Old Thing', categoryId, price: 1, purchasedAt: '2025-01-01' })
      .expect(201);
    await agent
      .post('/purchases')
      .send({ productName: 'Recent Thing', categoryId, price: 2, purchasedAt: '2026-06-01' })
      .expect(201);

    const res = await agent
      .get('/purchases')
      .query({ from: '2026-01-01', to: '2026-12-31' })
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].product.name).toBe('Recent Thing');
  });

  it('updates a purchase price and rejects updating another user\'s purchase', async () => {
    const owner = await registeredAgent('owner2@example.com');
    const categories = await owner.agent.get('/categories').expect(200);
    const created = await owner.agent
      .post('/purchases')
      .send({ productName: 'Cheese', categoryId: categories.body[0].id, price: 5, purchasedAt: '2026-01-01' })
      .expect(201);

    const updated = await owner.agent
      .patch(`/purchases/${created.body.id}`)
      .send({ price: 6 })
      .expect(200);
    expect(updated.body.price).toBe(6);

    const other = await registeredAgent('other2@example.com');
    await other.agent.patch(`/purchases/${created.body.id}`).send({ price: 99 }).expect(404);
  });

  it('deletes a purchase and rejects deleting another user\'s purchase', async () => {
    const owner = await registeredAgent('owner3@example.com');
    const categories = await owner.agent.get('/categories').expect(200);
    const created = await owner.agent
      .post('/purchases')
      .send({ productName: 'Butter', categoryId: categories.body[0].id, price: 3, purchasedAt: '2026-01-01' })
      .expect(201);

    const other = await registeredAgent('other3@example.com');
    await other.agent.delete(`/purchases/${created.body.id}`).expect(404);

    await owner.agent.delete(`/purchases/${created.body.id}`).expect(200);
    const remaining = await prisma.purchase.findMany({ where: { id: created.body.id } });
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 10: Run the e2e test and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS (5 tests).

- [ ] **Step 11: Commit**

```bash
git add apps/api
git commit -m "feat(api): add purchases module with product reuse-or-create logic

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Analytics module — spend totals, category breakdown, inflation

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/analytics/analytics.service.ts`
- Create: `apps/api/src/analytics/analytics.controller.ts`
- Create: `apps/api/src/analytics/analytics.module.ts`
- Test: `apps/api/src/analytics/analytics.service.spec.ts`
- Test: `apps/api/test/analytics.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PrismaService`, `JwtAuthGuard` + `CurrentUser` + `JwtPayload`.
- Produces: `Period = 'week' | 'month' | 'year'`. `GET /analytics/spend?period=&from=&to=` → `{ bucket: string, total: number }[]`. `GET /analytics/spend-by-category?...` → `{ bucket: string, categories: { category: string, total: number }[] }[]`. `GET /analytics/inflation?productId=` → `{ date: string, price: number }[]`. `GET /analytics/inflation-overview?period=&from=&to=` → top 10 `{ productId, name, firstPrice, lastPrice, changePercent }[]` sorted by absolute change, products with no price change excluded.

- [ ] **Step 1: Modify `apps/api/package.json`** — add `date-fns`

Add to `"dependencies"`: `"date-fns": "^3.6.0"`

- [ ] **Step 2: Install dependencies**

Run: `npm install`

- [ ] **Step 3: Write the failing unit tests — `apps/api/src/analytics/analytics.service.spec.ts`**

```ts
import { Test } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../prisma/prisma.service';

function purchase(productId: string, name: string, price: number, purchasedAt: string, category = 'Groceries') {
  return {
    productId,
    price,
    purchasedAt: new Date(purchasedAt),
    product: { name, category: { name: category } },
  };
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let prisma: { purchase: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { purchase: { findMany: jest.fn() } };

    const moduleRef = await Test.createTestingModule({
      providers: [AnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(AnalyticsService);
  });

  it('spend() buckets totals by month and sums same-month purchases', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      purchase('p1', 'Milk', 2.5, '2026-01-05'),
      purchase('p1', 'Milk', 2.8, '2026-01-20'),
      purchase('p2', 'Bread', 3.0, '2026-02-01'),
    ]);

    const result = await service.spend('user-1', 'month');

    expect(result).toEqual([
      { bucket: '2026-01', total: 5.3 },
      { bucket: '2026-02', total: 3 },
    ]);
  });

  it('spendByCategory() groups totals by category within each bucket', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      purchase('p1', 'Milk', 2.5, '2026-01-05', 'Groceries'),
      purchase('p2', 'Bus Ticket', 1.5, '2026-01-10', 'Transport'),
    ]);

    const result = await service.spendByCategory('user-1', 'month');

    expect(result).toEqual([
      {
        bucket: '2026-01',
        categories: expect.arrayContaining([
          { category: 'Groceries', total: 2.5 },
          { category: 'Transport', total: 1.5 },
        ]),
      },
    ]);
  });

  it('inflationOverview() computes % change from first to last purchase and excludes unchanged products', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      purchase('p1', 'Milk', 2.0, '2026-01-01'),
      purchase('p1', 'Milk', 2.5, '2026-06-01'),
      purchase('p2', 'Bread', 3.0, '2026-01-01'),
      purchase('p2', 'Bread', 3.0, '2026-06-01'),
    ]);

    const result = await service.inflationOverview('user-1', 'year');

    expect(result).toEqual([
      { productId: 'p1', name: 'Milk', firstPrice: 2.0, lastPrice: 2.5, changePercent: 25 },
    ]);
  });
});
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `npm run test -w apps/api`
Expected: FAIL — `Cannot find module './analytics.service'`.

- [ ] **Step 5: Implement `apps/api/src/analytics/analytics.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { endOfDay, format, startOfDay, startOfMonth, startOfWeek, startOfYear } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';

export type Period = 'week' | 'month' | 'year';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private bucketKey(date: Date, period: Period): string {
    if (period === 'week') return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    if (period === 'year') return format(startOfYear(date), 'yyyy');
    return format(startOfMonth(date), 'yyyy-MM');
  }

  private purchasesInRange(userId: string, from?: string, to?: string) {
    return this.prisma.purchase.findMany({
      where: {
        userId,
        purchasedAt: {
          gte: from ? startOfDay(new Date(from)) : undefined,
          lte: to ? endOfDay(new Date(to)) : undefined,
        },
      },
      include: { product: { include: { category: true } } },
      orderBy: { purchasedAt: 'asc' },
    });
  }

  async spend(userId: string, period: Period, from?: string, to?: string) {
    const purchases = await this.purchasesInRange(userId, from, to);
    const totals = new Map<string, number>();
    for (const purchase of purchases) {
      const key = this.bucketKey(purchase.purchasedAt, period);
      totals.set(key, (totals.get(key) ?? 0) + Number(purchase.price));
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, total]) => ({ bucket, total: Math.round(total * 100) / 100 }));
  }

  async spendByCategory(userId: string, period: Period, from?: string, to?: string) {
    const purchases = await this.purchasesInRange(userId, from, to);
    const totals = new Map<string, Map<string, number>>();
    for (const purchase of purchases) {
      const key = this.bucketKey(purchase.purchasedAt, period);
      const categoryName = purchase.product.category.name;
      if (!totals.has(key)) totals.set(key, new Map());
      const byCategory = totals.get(key)!;
      byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + Number(purchase.price));
    }
    return [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, byCategory]) => ({
        bucket,
        categories: [...byCategory.entries()].map(([category, total]) => ({
          category,
          total: Math.round(total * 100) / 100,
        })),
      }));
  }

  async inflation(userId: string, productId: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: { userId, productId },
      orderBy: { purchasedAt: 'asc' },
    });
    return purchases.map((p) => ({ date: p.purchasedAt, price: Number(p.price) }));
  }

  async inflationOverview(userId: string, period: Period, from?: string, to?: string) {
    const purchases = await this.purchasesInRange(userId, from, to);
    const byProduct = new Map<string, { name: string; first: number; last: number }>();
    for (const purchase of purchases) {
      const price = Number(purchase.price);
      const existing = byProduct.get(purchase.productId);
      if (!existing) {
        byProduct.set(purchase.productId, { name: purchase.product.name, first: price, last: price });
      } else {
        existing.last = price;
      }
    }
    return [...byProduct.entries()]
      .map(([productId, { name, first, last }]) => ({
        productId,
        name,
        firstPrice: first,
        lastPrice: last,
        changePercent: first === 0 ? 0 : Math.round(((last - first) / first) * 10000) / 100,
      }))
      .filter((entry) => entry.firstPrice !== entry.lastPrice)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 10);
  }
}
```

- [ ] **Step 6: Run the tests again and verify they pass**

Run: `npm run test -w apps/api`
Expected: PASS (3 tests).

- [ ] **Step 7: Create `apps/api/src/analytics/analytics.controller.ts`**

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { AnalyticsService, Period } from './analytics.service';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('spend')
  spend(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.spend(user.sub, period, from, to);
  }

  @Get('spend-by-category')
  spendByCategory(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.spendByCategory(user.sub, period, from, to);
  }

  @Get('inflation')
  inflation(@CurrentUser() user: JwtPayload, @Query('productId') productId: string) {
    return this.analyticsService.inflation(user.sub, productId);
  }

  @Get('inflation-overview')
  inflationOverview(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'year',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.inflationOverview(user.sub, period, from, to);
  }
}
```

- [ ] **Step 8: Create `apps/api/src/analytics/analytics.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
```

- [ ] **Step 9: Wire `AnalyticsModule` into `AppModule`**

Modify `apps/api/src/app.module.ts` — add `AnalyticsModule` to `imports` and its import statement. At this point `AppModule`'s `imports` array should be: `[PrismaModule, AuthModule, CategoriesModule, ProductsModule, PurchasesModule, AnalyticsModule]`.

- [ ] **Step 10: Write the failing e2e test — `apps/api/test/analytics.e2e-spec.ts`**

```ts
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Analytics (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registeredAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    const res = await agent.post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return { agent, userId: res.body.id as string };
  }

  it('spend and inflation-overview reflect purchases made through the API', async () => {
    const { agent } = await registeredAgent('analytics@example.com');
    const categories = await agent.get('/categories').expect(200);
    const categoryId = categories.body[0].id;

    await agent
      .post('/purchases')
      .send({ productName: 'Milk', categoryId, price: 2.0, purchasedAt: '2026-01-05' })
      .expect(201);
    await agent
      .post('/purchases')
      .send({ productName: 'Milk', price: 2.5, purchasedAt: '2026-06-05' })
      .expect(201);

    const spendRes = await agent.get('/analytics/spend').query({ period: 'year' }).expect(200);
    expect(spendRes.body).toEqual([{ bucket: '2026', total: 4.5 }]);

    const overviewRes = await agent
      .get('/analytics/inflation-overview')
      .query({ period: 'year' })
      .expect(200);
    expect(overviewRes.body).toEqual([
      expect.objectContaining({ name: 'Milk', firstPrice: 2, lastPrice: 2.5, changePercent: 25 }),
    ]);

    const productId = overviewRes.body[0].productId;
    const inflationRes = await agent.get('/analytics/inflation').query({ productId }).expect(200);
    expect(inflationRes.body).toEqual([
      expect.objectContaining({ price: 2 }),
      expect.objectContaining({ price: 2.5 }),
    ]);
  });
});
```

- [ ] **Step 11: Run the e2e test and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/api
git commit -m "feat(api): add analytics module for spend and inflation tracking

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Global exception filter — consistent JSON error shape

**Files:**
- Create: `apps/api/src/common/filters/http-exception.filter.ts`
- Modify: `apps/api/src/main.ts`
- Test: `apps/api/test/error-handling.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: every error response (validation failures, 401/404/409, and any unhandled exception) is shaped `{ statusCode: number, message: string | string[], error: string }`.

- [ ] **Step 1: Write the failing e2e test — `apps/api/test/error-handling.e2e-spec.ts`**

```ts
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Error handling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Build the app the same way main.ts does, since this test verifies
    // the global pipe + filter registered there.
    const { NestFactory } = await import('@nestjs/core');
    const cookieParser = (await import('cookie-parser')).default;
    const { ValidationPipe } = await import('@nestjs/common');
    app = await NestFactory.create((await import('../src/app.module')).AppModule);
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    const { AllExceptionsFilter } = await import('../src/common/filters/http-exception.filter');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.purchase.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registeredAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send({ email, password: 'password123' }).expect(201);
    return agent;
  }

  it('returns a consistent JSON shape for validation errors', async () => {
    const agent = await registeredAgent('errors-1@example.com');
    const res = await agent.post('/purchases').send({ price: -5 }).expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ statusCode: 400, error: 'Bad Request', message: expect.any(Array) }),
    );
  });

  it('returns a consistent JSON shape for unexpected (non-HTTP) errors', async () => {
    const agent = await registeredAgent('errors-2@example.com');
    const res = await agent.get('/products/not-a-valid-uuid').expect(500);
    expect(res.body).toEqual(
      expect.objectContaining({ statusCode: 500, error: expect.any(String), message: expect.any(String) }),
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm run test:e2e -w apps/api`
Expected: FAIL — `Cannot find module '../src/common/filters/http-exception.filter'`.

- [ ] **Step 3: Implement `apps/api/src/common/filters/http-exception.filter.ts`**

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = isHttpException ? exception.getResponse() : null;

    const message =
      body && typeof body === 'object' && 'message' in body
        ? (body as { message: string | string[] }).message
        : isHttpException
          ? exception.message
          : 'Internal server error';

    const error =
      body && typeof body === 'object' && 'error' in body
        ? (body as { error: string }).error
        : HttpStatus[statusCode];

    response.status(statusCode).json({ statusCode, message, error });
  }
}
```

- [ ] **Step 4: Register the filter in `apps/api/src/main.ts`**

Modify `apps/api/src/main.ts`:
```ts
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({ origin: true, credentials: true });
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
bootstrap();
```

- [ ] **Step 5: Run the test again and verify it passes**

Run: `npm run test:e2e -w apps/api`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "feat(api): add global exception filter for consistent error responses

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Root docs (README, CLAUDE.md) and final full-suite check

**Files:**
- Create: `README.md` (root)
- Create: `CLAUDE.md` (root)

**Interfaces:**
- Consumes: nothing — this is documentation only.
- Produces: nothing consumed by other tasks; this is the final task of this plan.

- [ ] **Step 1: Create `README.md`**

```markdown
# Personal Expenses & Inflation Tracker

Log purchases (product name + price), see spend by week/month/year, and
track how prices for individual products change over time.

Design spec: [docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md](docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md)

This repo currently contains the backend API (`apps/api`). The frontend
(`apps/web`) is a separate, not-yet-implemented plan.

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
npm run prisma:migrate:deploy
```

## Running the API

```bash
npm run dev:api
```

The API listens on `http://localhost:3001` (`PORT` in `apps/api/.env`).
`GET /health` returns `{ "status": "ok" }` once it's up.

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
```

- [ ] **Step 2: Create `CLAUDE.md`**

```markdown
# CLAUDE.md

Guidance for working in this repository.

## What this is

A personal expenses and inflation tracker: log purchases (product name +
price), view spend by week/month/year, and track per-product price changes
over time. Full design: [docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md](docs/superpowers/specs/2026-08-14-expenses-inflation-tracker-design.md).

## Layout

```
apps/api/   NestJS REST API — Prisma + PostgreSQL, JWT-cookie auth
apps/web/   Next.js frontend (not yet implemented — see docs/superpowers/plans/)
```

Root is an **npm workspaces** monorepo (`"workspaces": ["apps/*"]`) —
never introduce pnpm or yarn lockfiles/commands here.

## Backend conventions (`apps/api`)

- Every domain module follows the same shape: `*.module.ts`,
  `*.controller.ts` (HTTP layer, e2e tested), `*.service.ts` (business
  logic, unit tested with a mocked `PrismaService`), `dto/*.dto.ts`
  (`class-validator` decorators).
- Every domain route is guarded with `@UseGuards(JwtAuthGuard)` and reads
  the current user via `@CurrentUser() user: JwtPayload`, using `user.sub`
  as the `userId` for every Prisma query. Every table row is scoped by
  `userId` — never query across users.
- Prisma `Decimal` fields (`Purchase.price`) must be converted with
  `Number(...)` before being returned from a service method, so API JSON
  responses always carry numeric prices, not Decimal-serialized strings.
- Config lives in `apps/api/.env` (see `.env.example`), loaded via
  `dotenv/config` at the top of `main.ts` and via Jest's `setupFiles` in
  both `package.json`'s `jest` block (unit tests) and `test/jest-e2e.json`
  (e2e tests). Prisma CLI commands load it explicitly via `dotenv-cli`
  (see the `prisma:*` scripts) rather than relying on Prisma's own
  schema-adjacent `.env` discovery.

## Testing

- Unit tests (`*.spec.ts`, colocated with the code they test) mock
  `PrismaService` entirely — no database needed, fast.
- e2e tests (`apps/api/test/*.e2e-spec.ts`) boot the real `AppModule`
  against the local Postgres from `docker compose up -d` and clean all
  tables in `afterEach`. Postgres must be running for
  `npm run test:api:e2e` to pass.
- New logic-bearing code (matching/aggregation algorithms, auth) is
  written test-first (TDD): a failing test, then the minimal
  implementation, per the project's usual workflow.

## Where designs and plans live

- Design specs: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
- Implementation plans: `docs/superpowers/plans/YYYY-MM-DD-<topic>.md`
```

- [ ] **Step 3: Run the full test suite as a final sanity check**

Run:
```bash
npm run test:api
npm run test:api:e2e
```
Expected: both PASS with no failing suites.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: add README and CLAUDE.md for the backend API

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review Notes

- **Spec coverage:** Auth (register/login/logout/me) → Tasks 4–5. Categories → Task 6. Products/autocomplete → Task 7. Purchases + product reuse-or-create → Task 8. Analytics (spend, spend-by-category, inflation, inflation-overview) → Task 9. Error shape → Task 10. Docs → Task 11. Docker/Postgres/monorepo → Task 1. Everything in the spec's API Design, Auth Flow, Error Handling, and Dev Setup sections is covered; Frontend and Testing (web side) sections belong to the separate frontend plan.
- **Placeholder scan:** no TBD/TODO markers; every step has literal file contents or an exact command.
- **Type consistency:** `JwtPayload { sub, email }` is used identically (guard-attached, `user.sub` as `userId`) across Categories, Products, Purchases, and Analytics controllers. `SafeUser { id, email }` is used only for the `/auth/login` route's `req.user`, never mixed with `JwtPayload`. `Period = 'week' | 'month' | 'year'` is defined once in `analytics.service.ts` and imported by the controller.

