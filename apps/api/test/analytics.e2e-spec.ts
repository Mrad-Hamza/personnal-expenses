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
