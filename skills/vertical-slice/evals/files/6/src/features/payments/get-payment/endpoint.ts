import { Router } from "express";
import { handleGetPayment } from "./handler";

export const router = Router();

router.get("/:id", async (req, res) => {
  const payment = await handleGetPayment({ paymentId: req.params.id });
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json(payment);
});
