import { Module } from '@nestjs/common';
import { CashEntriesController } from './cash-entries.controller';
import { CashSummaryController } from './cash-summary.controller';
import { CashService } from './cash.service';

@Module({
  controllers: [CashEntriesController, CashSummaryController],
  providers: [CashService],
})
export class CashModule {}
