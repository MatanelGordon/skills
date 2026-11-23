import express from "express";
import { invoiceRouter } from "./routes/invoiceRoutes";

export const app = express();

app.use(express.json());
app.use("/api/invoices", invoiceRouter);
