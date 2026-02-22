import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CredentialsModule } from './credentials/credentials.module';
import { RegisterModule } from './register/register.module';
import { LoginModule } from './login/login.module';
import { UsersModule } from './users/users.module';
import { CashModule } from './cash/cash.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CredentialsModule,
    UsersModule,
    RegisterModule,
    LoginModule,
    CashModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
