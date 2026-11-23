import { Router } from "express";
import { InvoiceController } from "../controllers/invoiceController";

const controller = new InvoiceController();

export const invoiceRouter = Router();

invoiceRouter.get("/", controller.list);
invoiceRouter.get("/:id", controller.getById);
invoiceRouter.post("/", controller.create);
invoiceRouter.post("/:id/pay", controller.markPaid);
