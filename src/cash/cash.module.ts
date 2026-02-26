import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { CashEntriesController } from './cash-entries.controller';
import { CashSummaryController } from './cash-summary.controller';
import { CashService } from './cash.service';

@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'study-secret-change-me',
    }),
  ],
  controllers: [CashEntriesController, CashSummaryController],
  providers: [CashService, JwtAuthGuard],
})
export class CashModule {}
