import { ConflictException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { DEFAULT_CATEGORY_NAMES } from '../categories/default-categories';

export type SafeUser = { id: string; email: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email: dto.email, passwordHash },
      });
      await tx.category.createMany({
        data: DEFAULT_CATEGORY_NAMES.map((name) => ({ name, userId: created.id })),
      });
      return created;
    });

    return { id: user.id, email: user.email };
  }

  async validateUser(email: string, password: string): Promise<SafeUser | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) return null;
    return { id: user.id, email: user.email };
  }

  async signToken(user: SafeUser): Promise<string> {
    return this.jwtService.signAsync({ sub: user.id, email: user.email });
  }

  setAuthCookie(res: Response, token: string): void {
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
