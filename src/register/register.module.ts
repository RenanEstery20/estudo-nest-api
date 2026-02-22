import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { RegisterController } from './register.controller';
import { RegisterService } from './register.service';

@Module({
  imports: [UsersModule],
  controllers: [RegisterController],
  providers: [RegisterService],
})
export class RegisterModule {}
