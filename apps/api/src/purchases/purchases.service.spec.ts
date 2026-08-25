import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PurchasesService', () => {
  let service: PurchasesService;
  let prisma: { product: any; category: any; purchase: any };

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn(), create: jest.fn() },
      category: { findFirst: jest.fn() },
      purchase: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [PurchasesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(PurchasesService);
  });

  const baseDto = { productName: 'Milk', price: 2.5, purchasedAt: '2026-01-01' };

  it('reuses an existing product by exact productId', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-1' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-1', price: 2.5 });

    await service.create('user-1', { ...baseDto, productId: 'prod-1' });

    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-1' }) }),
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('reuses a product matched by case-insensitive name', async () => {
    prisma.product.findFirst.mockResolvedValue({ id: 'prod-2' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-2', price: 2.5 });

    await service.create('user-1', baseDto);

    expect(prisma.product.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', name: { equals: 'Milk', mode: 'insensitive' } },
      }),
    );
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-2' }) }),
    );
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('creates a new product when no match exists and categoryId is provided', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue({ id: 'cat-1' });
    prisma.product.create.mockResolvedValue({ id: 'prod-3' });
    prisma.purchase.create.mockResolvedValue({ id: 'purchase-3', price: 2.5 });

    await service.create('user-1', { ...baseDto, categoryId: 'cat-1' });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', categoryId: 'cat-1', name: 'Milk' },
    });
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ productId: 'prod-3' }) }),
    );
  });

  it('throws when creating a new product without a categoryId', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.create('user-1', baseDto)).rejects.toThrow(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('throws when the given categoryId does not belong to the user', async () => {
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.category.findFirst.mockResolvedValue(null);

    await expect(
      service.create('user-1', { ...baseDto, categoryId: 'not-mine' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('remove() throws NotFoundException for a purchase belonging to another user', async () => {
    prisma.purchase.findFirst.mockResolvedValue(null);

    await expect(service.remove('user-1', 'purchase-x')).rejects.toThrow(NotFoundException);
  });
});
