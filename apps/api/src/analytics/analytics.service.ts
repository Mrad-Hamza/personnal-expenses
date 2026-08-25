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
