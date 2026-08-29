import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('Error handling (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    // Build the app the same way main.ts does, since this test verifies
    // the global pipe + filter registered there.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
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
});
