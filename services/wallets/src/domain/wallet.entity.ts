export class InsufficientBalanceError extends Error {
  constructor() {
    super("INSUFFICIENT_BALANCE");
    this.name = "InsufficientBalanceError";
  }
}

export class Wallet {
  readonly id: string;
  readonly playerId: string;
  private _balanceCents: bigint;
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
    this._balanceCents = props.balanceCents;
    this.currency = props.currency;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get balanceCents(): bigint {
    return this._balanceCents;
  }

  debit(amountCents: bigint): void {
    if (amountCents <= 0n) throw new Error("Amount must be positive");
    if (this._balanceCents < amountCents) throw new InsufficientBalanceError();
    this._balanceCents -= amountCents;
    this.updatedAt = new Date();
  }

  credit(amountCents: bigint): void {
    if (amountCents <= 0n) throw new Error("Amount must be positive");
    this._balanceCents += amountCents;
    this.updatedAt = new Date();
  }

  toJSON() {
    return {
      id: this.id,
      playerId: this.playerId,
      balanceCents: this._balanceCents.toString(),
      currency: this.currency,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
