import { Injectable, Inject, Logger, OnModuleDestroy } from "@nestjs/common";
import { Server } from "socket.io";
import { randomBytes, createHash } from "crypto";
import { Round } from "../domain/round.entity";
import type { RoundRepository } from "../domain/round.repository";
import { ROUND_REPOSITORY } from "../domain/round.repository";
import type { BetRepository } from "../domain/bet.repository";
import { BET_REPOSITORY } from "../domain/bet.repository";
import { RabbitMQService } from "../infrastructure/rabbitmq.service";
import {
  calculateCrashPoint,
  multiplierAt,
  CLIENT_SEED,
} from "../domain/provably-fair";
import { randomUUID } from "crypto";

const BETTING_WINDOW_SECONDS = 10;
const TICK_INTERVAL_MS = 100;
const K = 0.06;

@Injectable()
export class RoundEngineService implements OnModuleDestroy {
  private readonly logger = new Logger(RoundEngineService.name);
  private io: Server | null = null;
  private connectedClients = 0;
  private activeRound: Round | null = null;
  private engineRunning = false;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private bettingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    @Inject(ROUND_REPOSITORY) private readonly roundRepo: RoundRepository,
    @Inject(BET_REPOSITORY) private readonly betRepo: BetRepository,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  setServer(io: Server): void {
    this.io = io;
  }

  onClientConnect(): void {
    this.connectedClients++;
    if (this.connectedClients === 1 && !this.engineRunning) {
      this.startEngine();
    }
  }

  onClientDisconnect(): void {
    this.connectedClients = Math.max(0, this.connectedClients - 1);
  }

  getActiveRound(): Round | null {
    return this.activeRound;
  }

  async getOrLoadCurrentRound(): Promise<Round | null> {
    if (this.activeRound) return this.activeRound;
    return this.roundRepo.findCurrent();
  }

  private async startEngine(): Promise<void> {
    this.engineRunning = true;
    this.logger.log("Engine started");
    await this.startBettingPhase();
  }

  private async startBettingPhase(): Promise<void> {
    const serverSeed = randomBytes(32).toString("hex");
    const serverHash = createHash("sha256").update(serverSeed).digest("hex");
    const nonce = await this.roundRepo.getNextNonce();

    const round = new Round({
      id: randomUUID(),
      phase: "BETTING",
      serverSeed,
      serverHash,
      clientSeed: CLIENT_SEED,
      nonce,
      crashMultiplier: null,
      phaseStartedAt: new Date(),
      crashedAt: null,
      settledAt: null,
      createdAt: new Date(),
      bets: [],
    });

    await this.roundRepo.create(round);
    this.activeRound = round;

    this.io?.emit("round:betting_started", {
      type: "round:betting_started",
      payload: {
        roundId: round.id,
        bettingWindowSeconds: BETTING_WINDOW_SECONDS,
        serverHash: round.serverHash,
      },
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`BETTING started — round ${round.id}, hash ${serverHash}`);

    this.bettingTimeout = setTimeout(async () => {
      await this.startRunningPhase();
    }, BETTING_WINDOW_SECONDS * 1000);
  }

  private async startRunningPhase(): Promise<void> {
    if (!this.activeRound) return;

    const round = this.activeRound;
    const crashPoint = calculateCrashPoint(round.serverSeed, round.clientSeed, round.nonce);
    round.startRunning();
    await this.roundRepo.save(round);

    this.io?.emit("round:started", {
      type: "round:started",
      payload: { roundId: round.id, startedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`RUNNING started — crash at ${crashPoint.toFixed(2)}x`);

    const startTime = Date.now();

    this.tickInterval = setInterval(async () => {
      if (!this.activeRound) return;
      const t = (Date.now() - startTime) / 1000;
      const current = multiplierAt(t, K);

      this.io?.emit("round:tick", {
        type: "round:tick",
        payload: { roundId: round.id, multiplier: current.toFixed(2) },
        timestamp: new Date().toISOString(),
      });

      if (current >= crashPoint) {
        clearInterval(this.tickInterval!);
        this.tickInterval = null;
        await this.crashRound(round, crashPoint.toFixed(2));
      }
    }, TICK_INTERVAL_MS);
  }

  private async crashRound(round: Round, crashMultiplierStr: string): Promise<void> {
    round.crash(crashMultiplierStr);
    await this.roundRepo.save(round);

    this.io?.emit("round:crashed", {
      type: "round:crashed",
      payload: {
        roundId: round.id,
        crashMultiplier: crashMultiplierStr,
        serverSeed: round.serverSeed,
        serverHash: round.serverHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
      },
      timestamp: new Date().toISOString(),
    });

    this.logger.log(`CRASHED at ${crashMultiplierStr}x — round ${round.id}`);

    // Settle
    round.settle();
    await this.roundRepo.save(round);

    // Publish round.settled for each bet
    for (const bet of round.bets) {
      if (bet.status === "REJECTED") continue;
      await this.rabbitmq.publish("round.settled", {
        betId: bet.id,
        roundId: round.id,
        playerId: bet.playerId,
        outcome: bet.status === "WON" ? "WON" : "LOST",
        amountCents: bet.amountCents.toString(),
        payoutCents: (bet.payoutCents ?? 0n).toString(),
      });
    }

    this.activeRound = null;

    // Continue loop if clients connected
    if (this.connectedClients > 0) {
      setTimeout(async () => {
        await this.startBettingPhase();
      }, 3000);
    } else {
      this.engineRunning = false;
      this.logger.log("Engine stopped — no clients");
    }
  }

  async cashoutBet(playerId: string): Promise<{ bet: import("../domain/bet.entity").Bet; multiplierStr: string } | null> {
    if (!this.activeRound || this.activeRound.phase !== "RUNNING") return null;

    const round = this.activeRound;
    const t = (Date.now() - round.phaseStartedAt.getTime()) / 1000;
    const currentMultiplierStr = multiplierAt(t, K).toFixed(2);

    const bet = round.cashoutBet(playerId, currentMultiplierStr);
    await this.roundRepo.save(round);

    return { bet, multiplierStr: currentMultiplierStr };
  }

  onModuleDestroy(): void {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.bettingTimeout) clearTimeout(this.bettingTimeout);
  }
}
