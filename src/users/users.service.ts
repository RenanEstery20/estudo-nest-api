import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  company: string;
  createdAt: string;
};

type CreateUserInput = {
  email: string;
  name: string;
  company: string;
  password: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  sanitize(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      company: user.company,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async findById(id: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ?? undefined;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    return user ?? undefined;
  }

  async createUser(input: CreateUserInput): Promise<PublicUser> {
    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        company: input.company.trim(),
        passwordHash,
      },
    });

    return this.sanitize(user);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }
}
