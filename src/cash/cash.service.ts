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
  dateFrom?: string;
  dateTo?: string;
  type?: CashEntryType;
  paymentMethod?: CashPaymentMethod;
  category?: string;
  description?: string;
  minAmount?: string;
  maxAmount?: string;
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

  private normalizeNumber(value?: string): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('amount filters must be valid numbers');
    }
    return parsed;
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

  async create(company: string, dto: CreateCashEntryDto) {
    const entry = await this.prisma.cashEntry.create({
      data: {
        company,
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

  async findAll(company: string, filters: ListFilters = {}) {
    const date = this.normalizeDate(filters.date);
    const dateFrom = this.normalizeDate(filters.dateFrom);
    const dateTo = this.normalizeDate(filters.dateTo);
    const minAmount = this.normalizeNumber(filters.minAmount);
    const maxAmount = this.normalizeNumber(filters.maxAmount);
    const where: Prisma.CashEntryWhereInput = { company };

    if (date) {
      where.createdAt = this.buildDayRange(date);
    } else if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
        ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
      };
    }

    if (filters.type) {
      where.type = filters.type as unknown as PrismaCashEntryType;
    }

    if (filters.paymentMethod) {
      where.paymentMethod =
        filters.paymentMethod as unknown as PrismaCashPaymentMethod;
    }

    if (filters.category?.trim()) {
      where.category = {
        contains: filters.category.trim(),
        mode: 'insensitive',
      };
    }

    if (filters.description?.trim()) {
      where.description = {
        contains: filters.description.trim(),
        mode: 'insensitive',
      };
    }

    if (minAmount !== undefined || maxAmount !== undefined) {
      where.amount = {
        ...(minAmount !== undefined ? { gte: minAmount } : {}),
        ...(maxAmount !== undefined ? { lte: maxAmount } : {}),
      };
    }

    const items = await this.prisma.cashEntry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return items.map((item) => this.serializeEntry(item));
  }

  async remove(company: string, id: string) {
    const result = await this.prisma.cashEntry.deleteMany({
      where: { id, company },
    });

    if (result.count === 0) {
      throw new NotFoundException('Cash entry not found');
    }

    return { deleted: true };
  }

  async getDailySummary(company: string, date?: string) {
    const targetDate = this.normalizeDate(date) ?? new Date().toISOString().slice(0, 10);
    const entries = await this.findAll(company, { date: targetDate });

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
