// src/shipping/methods.ts
export abstract class ShippingMethod {
  constructor(protected weightKg: number) {}

  abstract costCents(): number;
  abstract label(): string;

  describe(): string {
    return `${this.label()}: ${(this.costCents() / 100).toFixed(2)}`;
  }
}

export class StandardShipping extends ShippingMethod {
  costCents(): number {
    return 499 + Math.ceil(this.weightKg) * 50;
  }

  label(): string {
    return "Standard (3-5 days)";
  }
}

export class ExpressShipping extends ShippingMethod {
  constructor(weightKg: number, private saturdayDelivery: boolean) {
    super(weightKg);
  }

  costCents(): number {
    const base = 1299 + Math.ceil(this.weightKg) * 120;
    return this.saturdayDelivery ? base + 800 : base;
  }

  label(): string {
    return this.saturdayDelivery ? "Express (Saturday)" : "Express (next day)";
  }
}

export class PickupPoint extends ShippingMethod {
  constructor(weightKg: number, private lockerId: string) {
    super(weightKg);
  }

  costCents(): number {
    return 199;
  }

  label(): string {
    return `Pickup at locker ${this.lockerId}`;
  }
}
