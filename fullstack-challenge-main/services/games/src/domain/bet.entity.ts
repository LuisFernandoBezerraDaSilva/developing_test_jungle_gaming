export type BetStatus = "PENDING" | "CASHED_OUT" | "WON" | "LOST" | "REJECTED";

export class Bet {
  readonly id: string;
  readonly roundId: string;
  readonly playerId: string;
  readonly amountCents: bigint;
  private _status: BetStatus;
  private _cashoutMultiplier: string | null;
  private _payoutCents: bigint | null;
  readonly createdAt: Date;
  updatedAt: Date;

  constructor(props: {
    id: string;
    roundId: string;
    playerId: string;
    amountCents: bigint;
    status: BetStatus;
    cashoutMultiplier: string | null;
    payoutCents: bigint | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.id = props.id;
    this.roundId = props.roundId;
    this.playerId = props.playerId;
    this.amountCents = props.amountCents;
    this._status = props.status;
    this._cashoutMultiplier = props.cashoutMultiplier;
    this._payoutCents = props.payoutCents;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  get status(): BetStatus { return this._status; }
  get cashoutMultiplier(): string | null { return this._cashoutMultiplier; }
  get payoutCents(): bigint | null { return this._payoutCents; }

  cashout(multiplierStr: string, payout: bigint): void {
    if (this._status !== "PENDING") throw new Error("Bet is not PENDING");
    this._status = "CASHED_OUT";
    this._cashoutMultiplier = multiplierStr;
    this._payoutCents = payout;
    this.updatedAt = new Date();
  }

  settle(outcome: "WON" | "LOST", payout: bigint): void {
    if (this._status !== "PENDING" && this._status !== "CASHED_OUT") {
      throw new Error(`Cannot settle bet in status ${this._status}`);
    }
    if (this._status === "CASHED_OUT") {
      this._status = "WON";
    } else {
      this._status = outcome;
      this._payoutCents = payout;
    }
    this.updatedAt = new Date();
  }

  reject(): void {
    if (this._status !== "PENDING") throw new Error("Bet is not PENDING");
    this._status = "REJECTED";
    this.updatedAt = new Date();
  }

  toPublicJSON(username: string) {
    return {
      playerId: this.playerId,
      username,
      amountCents: this.amountCents.toString(),
      status: this._status,
      cashoutMultiplier: this._cashoutMultiplier,
      payoutCents: this._payoutCents?.toString() ?? null,
    };
  }
}
