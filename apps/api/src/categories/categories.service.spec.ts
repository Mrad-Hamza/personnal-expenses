import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: { category: any };

  beforeEach(async () => {
    prisma = {
      category: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [CategoriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(CategoriesService);
  });

  it('lists categories for the given user only', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: 'Groceries' }]);

    const result = await service.findAll('user-1');

    expect(prisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
    expect(result).toEqual([{ id: 'c1', name: 'Groceries' }]);
  });

  it('creates a category when the name is not already used', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({ id: 'c2', name: 'Pets' });

    const result = await service.create('user-1', { name: 'Pets' });

    expect(result).toEqual({ id: 'c2', name: 'Pets' });
  });

  it('rejects a case-insensitive duplicate category name', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'c1', name: 'pets' });

    await expect(service.create('user-1', { name: 'Pets' })).rejects.toThrow(ConflictException);
    expect(prisma.category.create).not.toHaveBeenCalled();
  });
});
