import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveProductId(userId: string, dto: CreatePurchaseDto): Promise<string> {
    if (dto.productId) {
      const product = await this.prisma.product.findFirst({
        where: { id: dto.productId, userId },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      return product.id;
    }

    const existing = await this.prisma.product.findFirst({
      where: { userId, name: { equals: dto.productName, mode: 'insensitive' } },
    });
    if (existing) {
      return existing.id;
    }

    if (!dto.categoryId) {
      throw new BadRequestException('categoryId is required when creating a new product');
    }
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, userId },
    });
    if (!category) {
      throw new BadRequestException('Unknown categoryId');
    }

    const created = await this.prisma.product.create({
      data: { userId, categoryId: dto.categoryId, name: dto.productName },
    });
    return created.id;
  }

  async create(userId: string, dto: CreatePurchaseDto) {
    const productId = await this.resolveProductId(userId, dto);
    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        productId,
        price: dto.price,
        purchasedAt: new Date(dto.purchasedAt),
      },
      include: { product: { include: { category: true } } },
    });
    return { ...purchase, price: Number(purchase.price) };
  }

  async findAll(userId: string, from?: string, to?: string) {
    const purchases = await this.prisma.purchase.findMany({
      where: {
        userId,
        purchasedAt: {
          gte: from ? new Date(from) : undefined,
          lte: to ? new Date(to) : undefined,
        },
      },
      include: { product: { include: { category: true } } },
      orderBy: { purchasedAt: 'desc' },
    });
    return purchases.map((p) => ({ ...p, price: Number(p.price) }));
  }

  async update(userId: string, id: string, dto: UpdatePurchaseDto) {
    await this.findOwned(userId, id);
    const updated = await this.prisma.purchase.update({
      where: { id },
      data: {
        price: dto.price,
        purchasedAt: dto.purchasedAt ? new Date(dto.purchasedAt) : undefined,
      },
      include: { product: { include: { category: true } } },
    });
    return { ...updated, price: Number(updated.price) };
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.purchase.delete({ where: { id } });
    return { success: true };
  }

  private async findOwned(userId: string, id: string) {
    const purchase = await this.prisma.purchase.findFirst({ where: { id, userId } });
    if (!purchase) {
      throw new NotFoundException('Purchase not found');
    }
    return purchase;
  }
}
