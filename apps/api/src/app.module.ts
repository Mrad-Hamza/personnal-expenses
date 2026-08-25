import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { PurchasesModule } from './purchases/purchases.module';

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule, CategoriesModule, PurchasesModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
