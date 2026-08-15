import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { ProductsService } from './products.service';

@ApiTags('products')
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({ summary: 'Search products by name (case-insensitive substring match)' })
  @ApiResponse({ status: 200, description: 'Products matching the search query' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiCookieAuth('token')
  @Get()
  search(@CurrentUser() user: JwtPayload, @Query('search') search = '') {
    return this.productsService.search(user.sub, search);
  }

  @ApiOperation({ summary: 'Get a product with its purchase history' })
  @ApiResponse({ status: 200, description: 'Product with purchase history' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 404, description: 'Product not found or not owned by user' })
  @ApiCookieAuth('token')
  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.findOneWithHistory(user.sub, id);
  }
}
