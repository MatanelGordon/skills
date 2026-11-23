export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  customerId: string;
  status: "open" | "paid";
  lines: InvoiceLine[];
}

const invoices = new Map<string, Invoice>();

export class InvoiceRepository {
  async findAll(): Promise<Invoice[]> {
    return [...invoices.values()];
  }

  async findById(id: string): Promise<Invoice | undefined> {
    return invoices.get(id);
  }

  async insert(data: Omit<Invoice, "id">): Promise<Invoice> {
    const invoice: Invoice = { ...data, id: `inv-${invoices.size + 1}` };
    invoices.set(invoice.id, invoice);
    return invoice;
  }

  async update(invoice: Invoice): Promise<Invoice> {
    invoices.set(invoice.id, invoice);
    return invoice;
  }
}
