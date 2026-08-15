import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [PrismaModule, AuthModule, CategoriesModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
