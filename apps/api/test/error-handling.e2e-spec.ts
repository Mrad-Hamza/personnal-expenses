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
