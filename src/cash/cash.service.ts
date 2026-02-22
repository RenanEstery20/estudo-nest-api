import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CashEntry as PrismaCashEntry,
  CashEntryType as PrismaCashEntryType,
  CashPaymentMethod as PrismaCashPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import {
  CashEntryType,
  CashPaymentMethod,
} from './entities/cash-entry.entity';

type ListFilters = {
  date?: string;
  type?: CashEntryType;
  paymentMethod?: CashPaymentMethod;
};

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeDate(date?: string): string | undefined {
    if (!date) return undefined;
    const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(date);
    if (!validFormat) {
      throw new BadRequestException('date must be in YYYY-MM-DD format');
    }
    return date;
  }

  private buildCreatedAt(entryDate?: string): Date {
    if (!entryDate) {
      return new Date();
    }

    // Noon UTC avoids accidental day shift when formatting/filtering by YYYY-MM-DD.
    return new Date(`${entryDate}T12:00:00.000Z`);
  }

  private buildDayRange(date: string): { gte: Date; lt: Date } {
    return {
      gte: new Date(`${date}T00:00:00.000Z`),
      lt: new Date(`${date}T23:59:59.999Z`),
    };
  }

  private serializeEntry(entry: PrismaCashEntry) {
    return {
      id: entry.id,
      type: entry.type as unknown as CashEntryType,
      paymentMethod: entry.paymentMethod as unknown as CashPaymentMethod,
      amount: entry.amount,
      description: entry.description,
      category: entry.category ?? undefined,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  async create(dto: CreateCashEntryDto) {
    const entry = await this.prisma.cashEntry.create({
      data: {
        type: dto.type as unknown as PrismaCashEntryType,
        paymentMethod: dto.paymentMethod as unknown as PrismaCashPaymentMethod,
        amount: Number(dto.amount),
        description: dto.description.trim(),
        category: dto.category?.trim() || null,
        createdAt: this.buildCreatedAt(dto.entryDate),
      },
    });

    return this.serializeEntry(entry);
  }

  async findAll(filters: ListFilters = {}) {
    const date = this.normalizeDate(filters.date);
    const where: Prisma.CashEntryWhereInput = {};

    if (date) {
      where.createdAt = this.buildDayRange(date);
    }

    if (filters.type) {
      where.type = filters.type as unknown as PrismaCashEntryType;
    }

    if (filters.paymentMethod) {
      where.paymentMethod =
        filters.paymentMethod as unknown as PrismaCashPaymentMethod;
    }

    const items = await this.prisma.cashEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeEntry(item));
  }

  async remove(id: string) {
    try {
      await this.prisma.cashEntry.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new NotFoundException('Cash entry not found');
    }
  }

  async getDailySummary(date?: string) {
    const targetDate = this.normalizeDate(date) ?? new Date().toISOString().slice(0, 10);
    const entries = await this.findAll({ date: targetDate });

    const totals = entries.reduce(
      (acc, entry) => {
        if (entry.type === CashEntryType.IN) {
          acc.totalIn += entry.amount;
          acc.countIn += 1;
        } else {
          acc.totalOut += entry.amount;
          acc.countOut += 1;
        }
        return acc;
      },
      { totalIn: 0, totalOut: 0, countIn: 0, countOut: 0 },
    );

    return {
      date: targetDate,
      totalIn: Number(totals.totalIn.toFixed(2)),
      totalOut: Number(totals.totalOut.toFixed(2)),
      balance: Number((totals.totalIn - totals.totalOut).toFixed(2)),
      countIn: totals.countIn,
      countOut: totals.countOut,
      totalEntries: entries.length,
    };
  }
}
