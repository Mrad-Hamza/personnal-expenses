import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePurchaseDto {
  @ApiProperty({ example: 'Milk' })
  @IsString()
  @MinLength(1)
  productName: string;

  @ApiProperty({
    example: '5f8d0d55-6c22-4a2f-9f2c-1f2b3c4d5e6f',
    description: 'Reuse an existing product by id. Omit to match/create by productName instead.',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({
    example: '5f8d0d55-6c22-4a2f-9f2c-1f2b3c4d5e6f',
    description: 'Required when no existing product matches productName (creates a new product in this category).',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ example: 2.5 })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  purchasedAt: string;
}
