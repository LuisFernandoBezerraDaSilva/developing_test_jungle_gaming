import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  Logger,
} from "@nestjs/common";
import type { RoundRepository } from "../domain/round.repository";
import { ROUND_REPOSITORY } from "../domain/round.repository";
import type { BetRepository } from "../domain/bet.repository";
import { BET_REPOSITORY } from "../domain/bet.repository";
import { RabbitMQService } from "../infrastructure/rabbitmq.service";
import { RedisService } from "../infrastructure/redis.service";
import { KeycloakService } from "../infrastructure/keycloak.service";
import { MetricsService } from "../infrastructure/metrics.service";
import { RoundEngineService } from "./round-engine.service";
import { Bet } from "../domain/bet.entity";
import { randomUUID } from "crypto";
import { multiplierAt } from "../domain/provably-fair";

const BETTING_WINDOW_SECONDS = Number(process.env.GAME_BETTING_WINDOW_SECONDS ?? 10);
const IDEMPOTENCY_TTL = 86400;

interface DebitResultPayload {
  betId: string;
  playerId: string;
  amountCents: string;
  reason?: string;
}

@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private wsGateway: { emitToPlayer: (playerId: string, event: string, data: unknown) => void; emitAll: (event: string, data: unknown) => void } | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepo: RoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepo: BetRepository,
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
    private readonly engine: RoundEngineService,
    private readonly keycloak: KeycloakService,
    private readonly metrics: MetricsService,
  ) {}

  setGateway(gateway: { emitToPlayer: (playerId: string, event: string, data: unknown) => void; emitAll: (event: string, data: unknown) => void }): void {
    this.wsGateway = gateway;
  }

  async placeBet(playerId: string, amountCentsStr: string): Promise<{ betId: string; roundId: string; amountCents: string; status: "PENDING" }> {
    const round = this.engine.getActiveRound();
    if (!round || round.phase !== "BETTING") {
      throw new BadRequestException({ statusCode: 400, error: "ROUND_NOT_IN_BETTING_PHASE", message: "Round is not accepting bets" });
    }

    const amountCents = BigInt(amountCentsStr);
    if (amountCents < 100n || amountCents > 100000n) {
      throw new BadRequestException({ statusCode: 400, error: "BET_AMOUNT_OUT_OF_RANGE", message: "Bet must be between R$1,00 and R$1.000,00" });
    }

    if (round.getBetByPlayer(playerId)) {
      throw new BadRequestException({ statusCode: 400, error: "BET_ALREADY_PLACED", message: "You already have a bet in this round" });
    }

    const bet = new Bet({
      id: randomUUID(),
      roundId: round.id,
      playerId,
      amountCents,
      status: "PENDING",
      cashoutMultiplier: null,
      payoutCents: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    round.placeBet(bet);
    await this.betRepo.create(bet);

    this.metrics.betsPlaced.inc();
    this.metrics.wageredCents.inc(Number(amountCents));

    await this.rabbitmq.publish("bet.placed", {
      betId: bet.id,
      roundId: round.id,
      playerId,
      amountCents: amountCentsStr,
    });

    const username = await this.resolveUsername(playerId);
    this.wsGateway?.emitAll("bet:placed", {
      type: "bet:placed",
      payload: { roundId: round.id, playerId, username, amountCents: amountCentsStr },
      timestamp: new Date().toISOString(),
    });

    return { betId: bet.id, roundId: round.id, amountCents: amountCentsStr, status: "PENDING" };
  }

  async cashout(playerId: string): Promise<{ betId: string; cashoutMultiplier: string; payoutCents: string }> {
    const round = this.engine.getActiveRound();
    if (!round || round.phase !== "RUNNING") {
      throw new BadRequestException({ statusCode: 400, error: "ROUND_NOT_RUNNING", message: "Round is not running" });
    }

    const existingBet = round.getBetByPlayer(playerId);
    if (!existingBet || existingBet.status !== "PENDING") {
      throw new BadRequestException({ statusCode: 400, error: "NO_PENDING_BET", message: "No active bet found" });
    }

    const result = await this.engine.cashoutBet(playerId);
    if (!result) {
      throw new BadRequestException({ statusCode: 400, error: "ROUND_NOT_RUNNING", message: "Round is not running" });
    }

    const { bet, multiplierStr } = result;

    const username = await this.resolveUsername(playerId);
    this.wsGateway?.emitAll("bet:cashed_out", {
      type: "bet:cashed_out",
      payload: {
        roundId: round.id,
        playerId,
        username,
        cashoutMultiplier: multiplierStr,
        payoutCents: bet.payoutCents!.toString(),
      },
      timestamp: new Date().toISOString(),
    });

    return {
      betId: bet.id,
      cashoutMultiplier: multiplierStr,
      payoutCents: bet.payoutCents!.toString(),
    };
  }

  async getCurrentRound() {
    // Bootstrap on-demand: além da conexão WS, uma leitura REST também inicia o
    // loop quando ocioso, de modo que quem entra pelo REST encontra um jogo ativo
    // (CONTRACT §2). Idempotente: só inicia se não houver rodada/engine ativos.
    await this.engine.ensureStarted();
    const round = await this.engine.getOrLoadCurrentRound();
    if (!round) {
      throw new NotFoundException({ statusCode: 404, error: "ROUND_NOT_FOUND", message: "No round found" });
    }
    return this.formatRound(round);
  }

  async getRoundHistory(page: number, limit: number) {
    const { rounds, total } = await this.roundRepo.findHistory(page, limit);
    return {
      rounds: rounds.map((r) => ({
        roundId: r.id,
        crashMultiplier: r.crashMultiplier ?? "1.00",
        crashedAt: r.crashedAt?.toISOString() ?? r.phaseStartedAt.toISOString(),
        totalBets: r.bets.length,
        totalWagered: r.bets.reduce((acc, b) => acc + b.amountCents, 0n).toString(),
      })),
      page,
      limit,
      total,
    };
  }

  async verifyRound(roundId: string) {
    const round = await this.roundRepo.findById(roundId);
    if (!round) {
      throw new NotFoundException({ statusCode: 404, error: "ROUND_NOT_FOUND", message: "Round not found" });
    }
    // Commit-reveal: o serverSeed (reveal) só é exposto APÓS o crash. Antes disso
    // o jogador tem apenas o serverHash (commit). Revelar o seed numa rodada ativa
    // permitiria recalcular o crashMultiplier antecipadamente (CONTRACT §4, README).
    const revealed = round.phase === "CRASHED" || round.phase === "SETTLED";
    return {
      roundId: round.id,
      serverSeed: revealed ? round.serverSeed : null,
      serverHash: round.serverHash,
      clientSeed: round.clientSeed,
      nonce: round.nonce,
      crashMultiplier: revealed ? round.crashMultiplier : null,
    };
  }

  async getLeaderboard(period: "24h" | "week", limit = 10) {
    const since = new Date(Date.now() - (period === "week" ? 7 * 24 : 24) * 60 * 60 * 1000);
    const rows = await this.betRepo.leaderboard(since, limit);
    const entries = await Promise.all(
      rows.map(async (r, i) => ({
        rank: i + 1,
        playerId: r.playerId,
        username: await this.resolveUsername(r.playerId),
        profitCents: r.profitCents.toString(),
        totalBets: r.totalBets,
      })),
    );
    return { period, entries };
  }

  async getMyBets(playerId: string, page: number, limit: number) {
    const { bets, total } = await this.betRepo.findByPlayerId(playerId, page, limit);
    return {
      bets: bets.map((b) => ({
        roundId: b.roundId,
        amountCents: b.amountCents.toString(),
        status: b.status,
        cashoutMultiplier: b.cashoutMultiplier,
        payoutCents: b.payoutCents?.toString() ?? null,
        createdAt: b.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
    };
  }

  async startConsumers(): Promise<void> {
    await this.rabbitmq.consume(
      "games.wallet.debit",
      ["wallet.debit.succeeded", "wallet.debit.failed"],
      async (envelope) => {
        const idempotencyKey = `processed:${envelope.eventId}`;
        const isNew = await this.redis.setNx(idempotencyKey, IDEMPOTENCY_TTL);
        if (!isNew) return;

        const payload = envelope.payload as DebitResultPayload;
        if (envelope.eventType === "wallet.debit.failed") {
          await this.handleDebitFailed(payload);
        }
      },
    );
  }

  private async handleDebitFailed(payload: DebitResultPayload): Promise<void> {
    const round = this.engine.getActiveRound();
    if (!round) return;

    const rejectedBet = round.rejectBet(payload.betId);
    if (rejectedBet) {
      await this.betRepo.save(rejectedBet);
      this.wsGateway?.emitToPlayer(payload.playerId, "bet:rejected", {
        type: "bet:rejected",
        payload: { betId: payload.betId, reason: payload.reason ?? "INSUFFICIENT_BALANCE" },
        timestamp: new Date().toISOString(),
      });
    }
  }

  /** Resolve o username a partir do Keycloak (fonte única, ver CONTRACT §0). */
  resolveUsername(playerId: string): Promise<string> {
    return this.keycloak.getUsername(playerId);
  }

  private async formatRound(round: import("../domain/round.entity").Round) {
    const bets = await Promise.all(
      round.bets.map(async (b) => ({
        playerId: b.playerId,
        username: await this.resolveUsername(b.playerId),
        amountCents: b.amountCents.toString(),
        status: b.status,
        cashoutMultiplier: b.cashoutMultiplier,
        payoutCents: b.payoutCents?.toString() ?? null,
      })),
    );

    const currentMultiplier = round.phase === "RUNNING"
      ? multiplierAt((Date.now() - round.phaseStartedAt.getTime()) / 1000).toFixed(2)
      : "1.00";

    return {
      roundId: round.id,
      phase: round.phase,
      phaseStartedAt: round.phaseStartedAt.toISOString(),
      bettingWindowSeconds: BETTING_WINDOW_SECONDS,
      currentMultiplier,
      serverHash: round.serverHash,
      bets,
    };
  }
}
