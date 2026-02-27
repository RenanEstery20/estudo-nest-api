import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashEntry as PrismaCashEntry,
  CashEntryType as PrismaCashEntryType,
  CashPaymentMethod as PrismaCashPaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { ScanReceiptDto } from './dto/scan-receipt.dto';
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

type OcrSpaceParsedResult = {
  ParsedText?: string;
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: OcrSpaceParsedResult[];
};

type ParsedReceiptResult = {
  amount?: number;
  paymentMethod?: CashPaymentMethod;
  type?: CashEntryType;
  entryDate?: string;
  description?: string;
  category?: string;
  confidence: number;
  rawText: string;
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

  private parsePtBrCurrency(rawValue: string): number | undefined {
    const normalized = rawValue
      .replace(/[R$\s]/gi, '')
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
      .trim();
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Number(parsed.toFixed(2));
  }

  private parseDateFromText(text: string): string | undefined {
    const dateMatch = text.match(
      /\b(0?[1-9]|[12][0-9]|3[01])[\/-](0?[1-9]|1[0-2])[\/-](\d{2,4})\b/,
    );
    if (!dateMatch) return undefined;

    const day = dateMatch[1].padStart(2, '0');
    const month = dateMatch[2].padStart(2, '0');
    const rawYear = dateMatch[3];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
    return `${year}-${month}-${day}`;
  }

  private inferPaymentMethod(text: string): CashPaymentMethod | undefined {
    const normalized = text.toUpperCase();

    if (/\bPIX\b/.test(normalized)) return CashPaymentMethod.PIX;
    if (/\bDINHEIRO\b|\bESPECIE\b/.test(normalized)) {
      return CashPaymentMethod.CASH;
    }
    if (/\bCARTAO\b|\bCREDITO\b|\bDEBITO\b/.test(normalized)) {
      return CashPaymentMethod.CARD;
    }

    return undefined;
  }

  private inferEntryType(text: string): CashEntryType {
    const normalized = text.toUpperCase();
    if (
      /\bVENDA\b|\bRECEB(?:IDO|IMENTO)?\b|\bCREDITO\b|\bENTRADA\b/.test(
        normalized,
      )
    ) {
      return CashEntryType.IN;
    }
    return CashEntryType.OUT;
  }

  private inferCategory(text: string): string | undefined {
    const normalized = text.toUpperCase();

    if (/\bMERCADO\b|\bSUPERMERCADO\b|\bATACADO\b/.test(normalized)) {
      return 'Compras';
    }
    if (/\bFORNECEDOR\b|\bDISTRIBUIDORA\b/.test(normalized)) {
      return 'Fornecedor';
    }
    if (/\bALUGUEL\b/.test(normalized)) {
      return 'Aluguel';
    }
    if (/\bTRANSPORTE\b|\bUBER\b|\bCOMBUSTIVEL\b/.test(normalized)) {
      return 'Transporte';
    }

    return undefined;
  }

  private inferDescription(text: string): string | undefined {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length >= 4);
    if (lines.length === 0) return undefined;

    const candidate =
      lines.find(
        (line) =>
          !/\bCNPJ\b|\bCPF\b|\bTOTAL\b|\bVALOR\b|\d{2}[\/-]\d{2}[\/-]\d{2,4}/i.test(
            line,
          ) && line.length <= 80,
      ) ?? lines[0];
    return candidate.slice(0, 120);
  }

  private extractAmount(text: string): number | undefined {
    const highPriorityPatterns = [
      /(?:TOTAL(?:\s+A\s+PAGAR)?|VALOR\s+TOTAL|VALOR|PAGO)\D{0,18}(\d{1,3}(?:\.\d{3})*,\d{2})/i,
      /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i,
    ];

    for (const pattern of highPriorityPatterns) {
      const match = text.match(pattern);
      if (!match?.[1]) continue;
      const amount = this.parsePtBrCurrency(match[1]);
      if (amount) return amount;
    }

    const values = [...text.matchAll(/\b(\d{1,3}(?:\.\d{3})*,\d{2})\b/g)]
      .map((match) => this.parsePtBrCurrency(match[1]))
      .filter((value): value is number => value !== undefined);

    if (values.length === 0) return undefined;
    return Math.max(...values);
  }

  private parseReceiptText(rawText: string): ParsedReceiptResult {
    const text = rawText.replace(/\r/g, '').trim();
    const amount = this.extractAmount(text);
    const paymentMethod = this.inferPaymentMethod(text);
    const type = this.inferEntryType(text);
    const entryDate = this.parseDateFromText(text);
    const description = this.inferDescription(text);
    const category = this.inferCategory(text);

    let confidence = 0;
    if (amount) confidence += 0.45;
    if (description) confidence += 0.2;
    if (entryDate) confidence += 0.15;
    if (paymentMethod) confidence += 0.1;
    if (category) confidence += 0.05;
    confidence += 0.05; // base score if OCR text exists

    return {
      amount,
      paymentMethod,
      type,
      entryDate,
      description,
      category,
      confidence: Number(Math.min(confidence, 0.99).toFixed(2)),
      rawText: text,
    };
  }

  private async callOcrSpace(
    base64Image: string,
    language: 'por' | 'eng',
  ): Promise<string> {
    const apiKey = process.env.OCR_SPACE_API_KEY ?? 'helloworld';
    const timeoutMs = Number(process.env.OCR_REQUEST_TIMEOUT_MS ?? 20000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const form = new FormData();
    form.append('base64Image', base64Image);
    form.append('language', language);
    form.append('isOverlayRequired', 'false');
    form.append('OCREngine', '2');
    form.append('scale', 'true');

    let response: Response;
    try {
      response = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: { apikey: apiKey },
        body: form,
        signal: controller.signal,
      });
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'AbortError'
          ? 'OCR provider timeout'
          : 'OCR provider request failed';
      throw new BadGatewayException(message);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new BadGatewayException('OCR provider request failed');
    }

    const data = (await response.json()) as OcrSpaceResponse;
    if (data.IsErroredOnProcessing) {
      const errorMessage = Array.isArray(data.ErrorMessage)
        ? data.ErrorMessage.join(', ')
        : (data.ErrorMessage ?? 'OCR processing failed');
      throw new BadGatewayException(errorMessage);
    }

    const parsedText = data.ParsedResults?.[0]?.ParsedText?.trim();
    if (!parsedText) {
      throw new BadRequestException(
        'Nao foi possivel extrair texto da imagem enviada.',
      );
    }

    return parsedText;
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

  async scanReceipt(_company: string, dto: ScanReceiptDto) {
    if (dto.base64Image.length > 10_000_000) {
      throw new BadRequestException('Imagem muito grande para processamento.');
    }

    const parsedText = await this.callOcrSpace(dto.base64Image, dto.language);
    return this.parseReceiptText(parsedText);
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
