export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Totals {
  subtotal: number;
  tax: number;
  total: number;
}

export class InvoiceService {
  constructor(private readonly taxRate: number) {}

  calculateTotals(lines: readonly InvoiceLine[]): Totals {
    const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    const tax = Math.floor(subtotal * this.taxRate * 100) / 100;
    const total = subtotal + tax;
    return { subtotal, tax, total };
  }

  formatTotal(totals: Totals): string {
    return totals.total.toFixed(2);
  }
}
