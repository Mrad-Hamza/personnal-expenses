import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';

@Module({
  imports: [PrismaModule, AuthModule, ProductsModule],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
