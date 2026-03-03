import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class RegisterService {
  constructor(private readonly usersService: UsersService) {}

  async register(dto: RegisterDto) {
    const [existingEmail, existingCompany] = await Promise.all([
      this.usersService.findByEmail(dto.email),
      this.usersService.findByCompany(dto.company),
    ]);

    if (existingEmail) {
      throw new ConflictException('Email already registered');
    }

    if (existingCompany) {
      throw new ConflictException('Company already registered');
    }

    const user = await this.usersService.createUser(dto);
    return {
      message: 'User registered successfully',
      user,
    };
  }
}
