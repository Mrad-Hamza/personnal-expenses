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
