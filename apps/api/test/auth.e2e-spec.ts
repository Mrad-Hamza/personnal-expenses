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
