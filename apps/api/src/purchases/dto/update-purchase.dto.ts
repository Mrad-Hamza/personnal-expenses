import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdatePurchaseDto {
  @ApiProperty({ example: 2.8, required: false })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @ApiProperty({ example: '2026-02-01', required: false })
  @IsOptional()
  @IsDateString()
  purchasedAt?: string;
}
