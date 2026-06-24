import { Money } from "./money";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
  }
}

export class Wallet {
  readonly id: string;
  readonly playerId: string;
  private _balance: Money;
  readonly currency: string;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: {
    id: string;
    playerId: string;
    balanceCents: bigint;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.playerId = props.playerId;
    this._balance = Money.fromCents(props.balanceCents);
    this.currency = props.currency;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get balanceCents(): bigint {
    return this._balance.centsValue;
  }

  debit(amountCents: bigint): void {
    const amount = Money.fromCents(amountCents);
    if (!amount.isPositive()) throw new Error("Amount must be positive");
    // Invariante: saldo nunca negativo — débito que ultrapassaria 0 falha.
    if (this._balance.isLessThan(amount)) throw new InsufficientBalanceError();
    this._balance = this._balance.subtract(amount);
    this.updatedAt = new Date();
  }

  credit(amountCents: bigint): void {
    const amount = Money.fromCents(amountCents);
    if (!amount.isPositive()) throw new Error("Amount must be positive");
    this._balance = this._balance.add(amount);
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      playerId: this.playerId,
      balanceCents: this._balance.toString(),
      currency: this.currency,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
