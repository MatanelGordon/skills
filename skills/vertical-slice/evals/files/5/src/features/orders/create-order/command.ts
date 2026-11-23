import type { OrderLine } from "../../../shared/orders";

export interface CreateOrderCommand {
  customerId: string;
  cardToken: string;
  lines: readonly OrderLine[];
}

export function parseCreateOrder(body: unknown): CreateOrderCommand {
  const { customerId, cardToken, lines } = (body ?? {}) as Partial<CreateOrderCommand>;
  if (!customerId || !cardToken || !lines?.length) {
    throw new Error("customerId, cardToken and at least one line are required");
  }
  return { customerId, cardToken, lines };
}
