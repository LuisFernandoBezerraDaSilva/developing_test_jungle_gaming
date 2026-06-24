import { Bet } from "./bet.entity";
import { multiplierToCentesimos } from "./provably-fair";
import { Money } from "./money";

export type RoundPhase = "BETTING" | "RUNNING" | "CRASHED" | "SETTLED";

export class Round {
  readonly id: string;
  private _phase: RoundPhase;
  readonly serverSeed: string;
  readonly serverHash: string;
  readonly clientSeed: string;
  readonly nonce: number;
  private _crashMultiplier: string | null;
  private _phaseStartedAt: Date;
  private _crashedAt: Date | null;
  private _settledAt: Date | null;
  readonly createdAt: Date;
  private _bets: Map<string, Bet>; // playerId → Bet

  constructor(props: {
    id: string;
    phase: RoundPhase;
    serverSeed: string;
    serverHash: string;
    clientSeed: string;
    nonce: number;
    crashMultiplier: string | null;
    phaseStartedAt: Date;
    crashedAt: Date | null;
    settledAt: Date | null;
    createdAt: Date;
    bets: Bet[];
  }) {
    this.id = props.id;
    this._phase = props.phase;
    this.serverSeed = props.serverSeed;
    this.serverHash = props.serverHash;
    this.clientSeed = props.clientSeed;
    this.nonce = props.nonce;
    this._crashMultiplier = props.crashMultiplier;
    this._phaseStartedAt = props.phaseStartedAt;
    this._crashedAt = props.crashedAt;
    this._settledAt = props.settledAt;
    this.createdAt = props.createdAt;
    this._bets = new Map(props.bets.map((b) => [b.playerId, b]));
  }

  get phase(): RoundPhase { return this._phase; }
  get crashMultiplier(): string | null { return this._crashMultiplier; }
  get phaseStartedAt(): Date { return this._phaseStartedAt; }
  get crashedAt(): Date | null { return this._crashedAt; }
  get settledAt(): Date | null { return this._settledAt; }
  get bets(): Bet[] { return [...this._bets.values()]; }

  getBetByPlayer(playerId: string): Bet | undefined {
    return this._bets.get(playerId);
  }

  placeBet(bet: Bet): void {
    if (this._phase !== "BETTING") throw new Error("ROUND_NOT_IN_BETTING_PHASE");
    if (this._bets.has(bet.playerId)) throw new Error("BET_ALREADY_PLACED");
    this._bets.set(bet.playerId, bet);
  }

  removeBet(playerId: string): void {
    this._bets.delete(playerId);
  }

  startRunning(): void {
    if (this._phase !== "BETTING") throw new Error("Round must be in BETTING phase");
    this._phase = "RUNNING";
    this._phaseStartedAt = new Date();
  }

  cashoutBet(playerId: string, currentMultiplierStr: string): Bet {
    if (this._phase !== "RUNNING") throw new Error("ROUND_NOT_RUNNING");
    const bet = this._bets.get(playerId);
    if (!bet || bet.status !== "PENDING") throw new Error("NO_PENDING_BET");

    const multiplierCentesimos = multiplierToCentesimos(parseFloat(currentMultiplierStr));
    const payout = Money.fromCents(bet.amountCents).applyMultiplier(multiplierCentesimos);
    bet.cashout(currentMultiplierStr, payout.centsValue);
    return bet;
  }

  crash(crashMultiplierStr: string): void {
    if (this._phase !== "RUNNING") throw new Error("Round must be RUNNING to crash");
    this._phase = "CRASHED";
    this._crashMultiplier = crashMultiplierStr;
    this._crashedAt = new Date();
    this._phaseStartedAt = new Date();
  }

  settle(): void {
    if (this._phase !== "CRASHED") throw new Error("Round must be CRASHED to settle");
    for (const bet of this._bets.values()) {
      if (bet.status === "PENDING") {
        bet.settle("LOST", 0n);
      } else if (bet.status === "CASHED_OUT") {
        bet.settle("WON", bet.payoutCents!);
      }
    }
    this._phase = "SETTLED";
    this._settledAt = new Date();
  }

  rejectBet(betId: string): Bet | undefined {
    for (const bet of this._bets.values()) {
      if (bet.id === betId && bet.status === "PENDING") {
        bet.reject();
        this._bets.delete(bet.playerId);
        return bet;
      }
    }
    return undefined;
  }
}
