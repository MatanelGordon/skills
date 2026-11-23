import type { Request, Response } from "express";
import { InvoiceService } from "../services/invoiceService";

const service = new InvoiceService();

export class InvoiceController {
  list = async (_req: Request, res: Response) => {
    res.json(await service.listInvoices());
  };

  getById = async (req: Request, res: Response) => {
    const invoice = await service.getInvoice(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  };

  create = async (req: Request, res: Response) => {
    res.status(201).json(await service.createInvoice(req.body));
  };

  markPaid = async (req: Request, res: Response) => {
    const invoice = await service.markPaid(req.params.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    res.json(invoice);
  };
}
