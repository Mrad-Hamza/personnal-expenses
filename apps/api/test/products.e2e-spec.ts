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
