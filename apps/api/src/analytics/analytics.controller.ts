import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/types/jwt-payload.type';
import { AnalyticsService, Period } from './analytics.service';

@ApiTags('analytics')
@UseGuards(JwtAuthGuard)
@ApiCookieAuth('token')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @ApiOperation({ summary: 'Total spend bucketed by week, month, or year' })
  @ApiResponse({ status: 200, description: 'Spend totals retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('spend')
  spend(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.spend(user.sub, period, from, to);
  }

  @ApiOperation({ summary: 'Spend totals bucketed by period and broken down by category' })
  @ApiResponse({ status: 200, description: 'Spend-by-category totals retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('spend-by-category')
  spendByCategory(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'month',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.spendByCategory(user.sub, period, from, to);
  }

  @ApiOperation({ summary: 'Price history for a single product, ordered by purchase date' })
  @ApiResponse({ status: 200, description: 'Price history retrieved successfully' })
  @ApiResponse({ status: 400, description: 'productId query param is required' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('inflation')
  inflation(@CurrentUser() user: JwtPayload, @Query('productId') productId?: string) {
    return this.analyticsService.inflation(user.sub, productId as string);
  }

  @ApiOperation({
    summary: 'Top 10 products by absolute price change over the period, unchanged products excluded',
  })
  @ApiResponse({ status: 200, description: 'Inflation overview retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('inflation-overview')
  inflationOverview(
    @CurrentUser() user: JwtPayload,
    @Query('period') period: Period = 'year',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.inflationOverview(user.sub, period, from, to);
  }
}
