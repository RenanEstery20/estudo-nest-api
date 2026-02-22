import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  Min,
} from 'class-validator';
import { CashEntryType, CashPaymentMethod } from '../entities/cash-entry.entity';

export class CreateCashEntryDto {
  @IsEnum(CashEntryType)
  type: CashEntryType;

  @IsDefined()
  @IsEnum(CashPaymentMethod)
  paymentMethod: CashPaymentMethod;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'entryDate must be in YYYY-MM-DD format',
  })
  entryDate?: string;
}
