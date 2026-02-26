import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CashService } from './cash.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { CashEntryType, CashPaymentMethod } from './entities/cash-entry.entity';

@Controller('cash-entries')
@UseGuards(JwtAuthGuard)
export class CashEntriesController {
  constructor(private readonly cashService: CashService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateCashEntryDto) {
    return this.cashService.create(req.user.company, dto);
  }

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('date') date?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('type') type?: CashEntryType,
    @Query('paymentMethod') paymentMethod?: CashPaymentMethod,
    @Query('category') category?: string,
    @Query('description') description?: string,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
  ) {
    return this.cashService.findAll(req.user.company, {
      date,
      dateFrom,
      dateTo,
      type,
      paymentMethod,
      category,
      description,
      minAmount,
      maxAmount,
    });
  }

  @Delete(':id')
  remove(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.cashService.remove(req.user.company, id);
  }
}
