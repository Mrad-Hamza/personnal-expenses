import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: any; category: any; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      category: { createMany: jest.fn() },
      $transaction: jest.fn(async (fn) => fn(prisma)),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn().mockResolvedValue('signed-token') },
        },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  it('creates a user with a hashed password and 8 default categories', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash: 'hashed' });

    const result = await service.register({ email: 'a@b.com', password: 'password123' });

    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
    const createdHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
    expect(await bcrypt.compare('password123', createdHash)).toBe(true);
    expect(prisma.category.createMany.mock.calls[0][0].data).toHaveLength(8);
    expect(prisma.category.createMany.mock.calls[0][0].data[0]).toEqual(
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('rejects registration when the email is already taken', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    await expect(
      service.register({ email: 'a@b.com', password: 'password123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('validateUser returns null for a wrong password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

    const result = await service.validateUser('a@b.com', 'wrong-password');

    expect(result).toBeNull();
  });

  it('validateUser returns the safe user for a correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@b.com', passwordHash });

    const result = await service.validateUser('a@b.com', 'correct-password');

    expect(result).toEqual({ id: 'user-1', email: 'a@b.com' });
  });
});
