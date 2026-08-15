import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  search(userId: string, query: string) {
    const term = query?.trim();
    if (!term) return Promise.resolve([]);
    return this.prisma.product.findMany({
      where: { userId, name: { contains: term, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  async findOneWithHistory(userId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, userId },
      include: {
        category: true,
        purchases: { orderBy: { purchasedAt: 'asc' } },
      },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    return product;
  }
}
