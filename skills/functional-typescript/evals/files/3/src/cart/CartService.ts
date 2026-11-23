// src/cart/CartService.ts
export interface Item {
  sku: string;
  name: string;
  priceCents: number;
  qty: number;
}

const COUPONS: Record<string, number> = {
  WELCOME10: 10,
  SPRING25: 25,
};

export class CartService {
  private items: Item[] = [];
  private discountPercent = 0;

  add(item: Item): void {
    const existing = this.items.find((i) => i.sku === item.sku);
    if (existing) {
      existing.qty += item.qty;
      return;
    }
    this.items.push(item);
  }

  remove(sku: string): void {
    const index = this.items.findIndex((i) => i.sku === sku);
    if (index === -1) {
      throw new Error(`No item with sku ${sku} in the cart`);
    }
    this.items.splice(index, 1);
  }

  applyCoupon(code: string): void {
    const percent = COUPONS[code];
    if (percent === undefined) {
      throw new Error(`Unknown coupon: ${code}`);
    }
    this.discountPercent = percent;
  }

  totalCents(): number {
    const subtotal = this.items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    return Math.round(subtotal * (1 - this.discountPercent / 100));
  }

  getItems(): Item[] {
    return this.items;
  }
}
