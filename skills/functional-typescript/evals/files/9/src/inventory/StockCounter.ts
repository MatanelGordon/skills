// src/inventory/StockCounter.ts
export class StockCounter {
  private onHand = new Map<string, number>();
  private reserved = new Map<string, number>();

  receive(sku: string, qty: number): void {
    this.onHand.set(sku, (this.onHand.get(sku) ?? 0) + qty);
  }

  reserve(sku: string, qty: number): void {
    if (qty > this.available(sku)) {
      throw new Error(`Cannot reserve ${qty} of ${sku}: only ${this.available(sku)} available`);
    }
    this.reserved.set(sku, (this.reserved.get(sku) ?? 0) + qty);
  }

  release(sku: string, qty: number): void {
    const current = this.reserved.get(sku) ?? 0;
    this.reserved.set(sku, Math.max(0, current - qty));
  }

  available(sku: string): number {
    return (this.onHand.get(sku) ?? 0) + (this.reserved.get(sku) ?? 0);
  }
}
