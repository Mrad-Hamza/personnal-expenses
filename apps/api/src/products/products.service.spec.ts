import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: { product: any };

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn(), findFirst: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(ProductsService);
  });

  it('returns an empty array for a blank search query without hitting the database', async () => {
    const result = await service.search('user-1', '');

    expect(result).toEqual([]);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('searches by case-insensitive substring, scoped to the user', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Whole Milk' }]);

    const result = await service.search('user-1', 'milk');

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', name: { contains: 'milk', mode: 'insensitive' } },
      }),
    );
    expect(result).toEqual([{ id: 'p1', name: 'Whole Milk' }]);
  });

  it('throws NotFoundException when the product does not belong to the user', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(service.findOneWithHistory('user-1', 'p1')).rejects.toThrow(NotFoundException);
  });
});
