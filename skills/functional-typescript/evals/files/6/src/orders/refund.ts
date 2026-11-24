// src/orders/refund.ts
import { db } from "../db";
import { mailer } from "../mailer";

export type Order = {
  id: string;
  customerId: string;
  totalCents: number;
  status: "open" | "paid" | "shipped" | "refunded";
  paidAt?: Date;
  trackingNumber?: string;
  refundedAt?: Date;
  refundReason?: string;
  refunds: number[];
};

const REFUND_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function refundOrder(order: Order, amountCents: number, reason: string): Order {
  if (order.status === "refunded") {
    throw new Error("Order already refunded");
  }
  if (order.status === "open") {
    throw new Error("Order was never paid");
  }
  if (Date.now() - order.paidAt!.getTime() > REFUND_WINDOW_DAYS * DAY_MS) {
    throw new Error("Refund window has closed");
  }
  if (amountCents > order.totalCents) {
    throw new Error("Refund exceeds order total");
  }

  order.status = "refunded";
  order.refundedAt = new Date();
  order.refundReason = reason;
  order.refunds.push(amountCents);
  return order;
}

export async function handleRefund(req: { body: any }): Promise<Order> {
  const order = (await db.orders.find(req.body.orderId)) as Order;
  const refunded = refundOrder(order, req.body.amountCents, req.body.reason);
  await db.orders.save(refunded);
  await mailer.send(refunded.customerId, "Your refund is on its way");
  return refunded;
}
