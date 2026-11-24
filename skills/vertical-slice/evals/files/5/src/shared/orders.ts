export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  customerId: string;
  lines: readonly OrderLine[];
  paymentRef: string; // what the order is paid against, for example a card charge id
}

const orders = new Map<string, Order>();

export async function saveOrder(data: Omit<Order, "id">): Promise<Order> {
  const order: Order = { ...data, id: `ord-${orders.size + 1}` };
  orders.set(order.id, order);
  return order;
}

// Charges the card for the amount and returns the charge id.
export async function chargeCard(cardToken: string, amount: number): Promise<string> {
  return `ch-${cardToken}-${Math.round(amount * 100)}`;
}
