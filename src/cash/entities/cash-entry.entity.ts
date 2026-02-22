export enum CashEntryType {
  IN = 'IN',
  OUT = 'OUT',
}

export enum CashPaymentMethod {
  CASH = 'CASH',
  PIX = 'PIX',
  CARD = 'CARD',
}

export class CashEntry {
  id: string;
  type: CashEntryType;
  amount: number;
  description: string;
  category?: string;
  paymentMethod?: CashPaymentMethod;
  createdAt: string;
}
