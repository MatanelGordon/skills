import { chargeCard, saveOrder, type Order } from "../../../shared/orders";
import type { CreateOrderCommand } from "./command";

export async function handleCreateOrder(cmd: CreateOrderCommand): Promise<Order> {
  const amount = cmd.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const chargeId = await chargeCard(cmd.cardToken, amount);
  return saveOrder({ customerId: cmd.customerId, lines: cmd.lines, paymentRef: chargeId });
}
