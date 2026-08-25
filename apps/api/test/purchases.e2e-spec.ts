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
