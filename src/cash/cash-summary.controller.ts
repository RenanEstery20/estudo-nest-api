import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard, type AuthenticatedRequest } from '../auth/jwt-auth.guard';
import { CashService } from './cash.service';

@Controller('cash-summary')
@UseGuards(JwtAuthGuard)
export class CashSummaryController {
  constructor(private readonly cashService: CashService) {}

  @Get('daily')
  getDaily(@Req() req: AuthenticatedRequest, @Query('date') date?: string) {
    return this.cashService.getDailySummary(req.user.company, date);
  }
}
