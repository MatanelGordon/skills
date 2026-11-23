import { Router } from "express";
import { parseCreateOrder } from "./command";
import { handleCreateOrder } from "./handler";

export const router = Router();

router.post("/", async (req, res) => {
  try {
    const order = await handleCreateOrder(parseCreateOrder(req.body));
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
