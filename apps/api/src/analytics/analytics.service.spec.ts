import { BadRequestException } from '@nestjs/common';
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

  it('spend() buckets totals by week (Monday start) and sums same-week purchases', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      purchase('p1', 'Milk', 2.0, '2026-01-05'), // Monday
      purchase('p1', 'Milk', 1.0, '2026-01-08'), // Thursday, same week
      purchase('p2', 'Bread', 3.0, '2026-01-12'), // next Monday, new week
    ]);

    const result = await service.spend('user-1', 'week');

    expect(result).toEqual([
      { bucket: '2026-01-05', total: 3 },
      { bucket: '2026-01-12', total: 3 },
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

  it('inflationOverview() sorts results by absolute change percent, descending', async () => {
    prisma.purchase.findMany.mockResolvedValue([
      purchase('p1', 'A', 100, '2026-01-01'),
      purchase('p1', 'A', 110, '2026-06-01'), // +10%
      purchase('p2', 'B', 100, '2026-01-01'),
      purchase('p2', 'B', 70, '2026-06-01'), // -30%
      purchase('p3', 'C', 100, '2026-01-01'),
      purchase('p3', 'C', 105, '2026-06-01'), // +5%
    ]);

    const result = await service.inflationOverview('user-1', 'year');

    expect(result.map((r) => r.productId)).toEqual(['p2', 'p1', 'p3']);
  });

  it('inflationOverview() caps the result at the top 10 products by absolute change', async () => {
    const purchases: ReturnType<typeof purchase>[] = [];
    for (let i = 1; i <= 12; i++) {
      const productId = `p${i}`;
      purchases.push(purchase(productId, `Product ${i}`, 100, '2026-01-01'));
      purchases.push(purchase(productId, `Product ${i}`, 100 + i, '2026-06-01')); // +i%
    }
    prisma.purchase.findMany.mockResolvedValue(purchases);

    const result = await service.inflationOverview('user-1', 'year');

    expect(result).toHaveLength(10);
    expect(result.map((r) => r.productId)).toEqual([
      'p12', 'p11', 'p10', 'p9', 'p8', 'p7', 'p6', 'p5', 'p4', 'p3',
    ]);
  });

  it('inflation() throws BadRequestException when productId is missing', async () => {
    await expect(service.inflation('user-1', undefined as unknown as string)).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.purchase.findMany).not.toHaveBeenCalled();
  });

  it('inflation() throws BadRequestException when productId is an empty string', async () => {
    await expect(service.inflation('user-1', '')).rejects.toThrow(BadRequestException);
    expect(prisma.purchase.findMany).not.toHaveBeenCalled();
  });
});
