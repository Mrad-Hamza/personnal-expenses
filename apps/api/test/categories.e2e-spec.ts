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
  }, 30000);

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
