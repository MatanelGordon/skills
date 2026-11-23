import { InvoiceRepository, type Invoice, type InvoiceLine } from "../repositories/invoiceRepository";

const repository = new InvoiceRepository();

export class InvoiceService {
  listInvoices(): Promise<Invoice[]> {
    return repository.findAll();
  }

  getInvoice(id: string): Promise<Invoice | undefined> {
    return repository.findById(id);
  }

  createInvoice(input: { customerId: string; lines: InvoiceLine[] }): Promise<Invoice> {
    return repository.insert({ ...input, status: "open" });
  }

  async markPaid(id: string): Promise<Invoice | undefined> {
    const invoice = await repository.findById(id);
    if (!invoice) return undefined;
    return repository.update({ ...invoice, status: "paid" });
  }
}
