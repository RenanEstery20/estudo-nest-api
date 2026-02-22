import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCredentialDto } from './dto/create-credential.dto';

@Injectable()
export class CredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateCredentialDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const credential = await this.prisma.credential.create({
      data: {
        name: dto.name,
        username: dto.username,
        passwordHash,
      },
    });

    return {
      id: credential.id,
      name: credential.name,
      username: credential.username,
      createdAt: credential.createdAt.toISOString(),
    };
  }

  async findAll() {
    const items = await this.prisma.credential.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      username: item.username,
      createdAt: item.createdAt.toISOString(),
    }));
  }

  async findOne(id: string) {
    const item = await this.prisma.credential.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Credential not found');

    return {
      id: item.id,
      name: item.name,
      username: item.username,
      createdAt: item.createdAt.toISOString(),
    };
  }

  async remove(id: string) {
    try {
      await this.prisma.credential.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new NotFoundException('Credential not found');
    }
  }
}
