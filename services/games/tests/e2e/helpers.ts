import { randomUUID, randomBytes, createHash } from "crypto";
import { Round } from "../../src/domain/round.entity";
import { Bet } from "../../src/domain/bet.entity";
import { CLIENT_SEED } from "../../src/domain/provably-fair";
import type { RoundRepository } from "../../src/domain/round.repository";
import type { BetRepository } from "../../src/domain/bet.repository";

export interface Envelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
}

type Handler = (envelope: Envelope) => Promise<void>;

/** In-memory stand-in for RabbitMQService (synchronous, deterministic). */
export class InMemoryBus {
  readonly published: Envelope[] = [];
  private readonly handlers: { keys: string[]; handler: Handler }[] = [];

  async publish<T>(routingKey: string, payload: T): Promise<void> {
    await this.dispatch({
      eventId: randomUUID(),
      eventType: routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }

  async deliver<T>(routingKey: string, payload: T, eventId: string): Promise<void> {
    await this.dispatch({
      eventId,
      eventType: routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }

  async consume(_queue: string, routingKeys: string[], handler: Handler): Promise<void> {
    this.handlers.push({ keys: routingKeys, handler });
  }

  publishedOf(routingKey: string): Envelope[] {
    return this.published.filter((e) => e.eventType === routingKey);
  }

  private async dispatch(envelope: Envelope): Promise<void> {
    this.published.push(envelope);
    for (const h of this.handlers) {
      if (h.keys.includes(envelope.eventType)) await h.handler(envelope);
    }
  }
}

export class InMemoryRedis {
  private readonly keys = new Set<string>();
  async setNx(key: string, _ttl: number): Promise<boolean> {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

export class InMemoryRoundRepository implements RoundRepository {
  readonly rounds = new Map<string, Round>();
  private nonce = 0;

  async findCurrent(): Promise<Round | null> {
    const active = [...this.rounds.values()].find((r) => r.phase !== "SETTLED");
    if (active) return active;
    const settled = [...this.rounds.values()].reverse().find((r) => r.phase === "SETTLED");
    return settled ?? null;
  }
  async findById(id: string): Promise<Round | null> {
    return this.rounds.get(id) ?? null;
  }
  async findHistory(page: number, limit: number): Promise<{ rounds: Round[]; total: number }> {
    const all = [...this.rounds.values()].filter((r) => r.phase === "SETTLED").reverse();
    const skip = (page - 1) * limit;
    return { rounds: all.slice(skip, skip + limit), total: all.length };
  }
  async save(round: Round): Promise<void> {
    this.rounds.set(round.id, round);
  }
  async create(round: Round): Promise<void> {
    this.rounds.set(round.id, round);
  }
  async getNextNonce(): Promise<number> {
    return ++this.nonce;
  }
}

export class InMemoryBetRepository implements BetRepository {
  readonly bets = new Map<string, Bet>();

  async findByPlayerId(playerId: string, page: number, limit: number): Promise<{ bets: Bet[]; total: number }> {
    const all = [...this.bets.values()].filter((b) => b.playerId === playerId).reverse();
    const skip = (page - 1) * limit;
    return { bets: all.slice(skip, skip + limit), total: all.length };
  }
  async save(bet: Bet): Promise<void> {
    this.bets.set(bet.id, bet);
  }
  async create(bet: Bet): Promise<void> {
    this.bets.set(bet.id, bet);
  }
  async saveBatch(bets: Bet[]): Promise<void> {
    for (const b of bets) this.bets.set(b.id, b);
  }
}

/**
 * Test-controllable replacement for RoundEngineService. Holds a single real
 * Round entity and exposes deterministic helpers to drive phases — no timers,
 * no socket.io, no random crash. Mirrors the engine's public surface used by
 * GameService plus the round.settled publication done on crash.
 */
export class FakeEngine {
  private round: Round | null = null;
  private currentMultiplierStr = "1.00";

  constructor(
    private readonly roundRepo: InMemoryRoundRepository,
    private readonly bus: InMemoryBus,
  ) {}

  // --- surface consumed by GameService ---
  /** Rounds are created explicitly by tests, so bootstrap is a no-op here. */
  async ensureStarted(): Promise<void> {}

  getActiveRound(): Round | null {
    return this.round && this.round.phase !== "SETTLED" ? this.round : null;
  }
  async getOrLoadCurrentRound(): Promise<Round | null> {
    return this.round ?? this.roundRepo.findCurrent();
  }
  async cashoutBet(playerId: string): Promise<{ bet: Bet; multiplierStr: string } | null> {
    if (!this.round || this.round.phase !== "RUNNING") return null;
    const bet = this.round.cashoutBet(playerId, this.currentMultiplierStr);
    await this.roundRepo.save(this.round);
    return { bet, multiplierStr: this.currentMultiplierStr };
  }

  // --- test helpers ---
  async newBettingRound(): Promise<Round> {
    const serverSeed = randomBytes(32).toString("hex");
    const serverHash = createHash("sha256").update(serverSeed).digest("hex");
    const round = new Round({
      id: randomUUID(),
      phase: "BETTING",
      serverSeed,
      serverHash,
      clientSeed: CLIENT_SEED,
      nonce: await this.roundRepo.getNextNonce(),
      crashMultiplier: null,
      phaseStartedAt: new Date(),
      crashedAt: null,
      settledAt: null,
      createdAt: new Date(),
      bets: [],
    });
    await this.roundRepo.create(round);
    this.round = round;
    return round;
  }

  async startRunning(multiplierStr = "1.00"): Promise<void> {
    if (!this.round) throw new Error("no round");
    this.round.startRunning();
    this.currentMultiplierStr = multiplierStr;
    await this.roundRepo.save(this.round);
  }

  setMultiplier(multiplierStr: string): void {
    this.currentMultiplierStr = multiplierStr;
  }

  /** Crash + settle the round and publish round.settled per non-rejected bet. */
  async crashAndSettle(crashMultiplierStr: string): Promise<void> {
    if (!this.round) throw new Error("no round");
    const round = this.round;
    round.crash(crashMultiplierStr);
    round.settle();
    await this.roundRepo.save(round);
    for (const bet of round.bets) {
      if (bet.status === "REJECTED") continue;
      await this.bus.publish("round.settled", {
        betId: bet.id,
        roundId: round.id,
        playerId: bet.playerId,
        outcome: bet.status === "WON" ? "WON" : "LOST",
        amountCents: bet.amountCents.toString(),
        payoutCents: (bet.payoutCents ?? 0n).toString(),
      });
    }
  }
}
