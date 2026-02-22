import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CashService } from './cash.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { CashEntryType, CashPaymentMethod } from './entities/cash-entry.entity';

@Controller('cash-entries')
export class CashEntriesController {
  constructor(private readonly cashService: CashService) {}

  @Post()
  create(@Body() dto: CreateCashEntryDto) {
    return this.cashService.create(dto);
  }

  @Get()
  findAll(
    @Query('date') date?: string,
    @Query('type') type?: CashEntryType,
    @Query('paymentMethod') paymentMethod?: CashPaymentMethod,
  ) {
    return this.cashService.findAll({ date, type, paymentMethod });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cashService.remove(id);
  }
}
