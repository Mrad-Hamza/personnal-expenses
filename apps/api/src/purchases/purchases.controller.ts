import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { UpdatePurchaseDto } from './dto/update-purchase.dto';

@ApiTags('purchases')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('token')
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @ApiOperation({
    summary: 'Log a purchase, reusing a matching product or creating a new one',
  })
  @ApiResponse({ status: 201, description: 'Purchase created successfully' })
  @ApiResponse({ status: 400, description: 'categoryId is required to create a new product, or is unknown' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'productId does not exist for this user' })
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreatePurchaseDto) {
    return this.purchasesService.create(user.sub, dto);
  }

  @ApiOperation({ summary: 'List purchases for the current user, optionally filtered by date range' })
  @ApiResponse({ status: 200, description: 'Purchases retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.purchasesService.findAll(user.sub, from, to);
  }

  @ApiOperation({ summary: 'Update a purchase\'s price and/or date' })
  @ApiResponse({ status: 200, description: 'Purchase updated successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Purchase not found or not owned by user' })
  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdatePurchaseDto) {
    return this.purchasesService.update(user.sub, id, dto);
  }

  @ApiOperation({ summary: 'Delete a purchase' })
  @ApiResponse({ status: 200, description: 'Purchase deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Purchase not found or not owned by user' })
  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.purchasesService.remove(user.sub, id);
  }
}
