import { Controller, Get, Query } from '@nestjs/common';
import { CashService } from './cash.service';

@Controller('cash-summary')
export class CashSummaryController {
  constructor(private readonly cashService: CashService) {}

  @Get('daily')
  getDaily(@Query('date') date?: string) {
    return this.cashService.getDailySummary(date);
  }
}
