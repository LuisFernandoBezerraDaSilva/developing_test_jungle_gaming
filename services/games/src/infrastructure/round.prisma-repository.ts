import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { Round, RoundPhase } from "../domain/round.entity";
import { Bet, BetStatus } from "../domain/bet.entity";
import type { RoundRepository } from "../domain/round.repository";
import type { OutboxEventInput } from "../domain/bet.repository";

type PrismaRoundRow = {
  id: string;
  phase: string;
  serverSeed: string;
  serverHash: string;
  clientSeed: string;
  nonce: number;
  crashMultiplier: string | null;
  phaseStartedAt: Date;
  crashedAt: Date | null;
  settledAt: Date | null;
  createdAt: Date;
  bets: PrismaBetRow[];
};

type PrismaBetRow = {
  id: string;
  roundId: string;
  playerId: string;
  amountCents: bigint;
  status: string;
  cashoutMultiplier: string | null;
  payoutCents: bigint | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class RoundPrismaRepository implements RoundRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrent(): Promise<Round | null> {
    const row = await this.prisma.round.findFirst({
      where: { phase: { not: "SETTLED" } },
      orderBy: { createdAt: "desc" },
      include: { bets: true },
    });
    if (row) return this.toEntity(row as PrismaRoundRow);

    // Return last settled round when idle
    const last = await this.prisma.round.findFirst({
      where: { phase: "SETTLED" },
      orderBy: { createdAt: "desc" },
      include: { bets: true },
    });
    return last ? this.toEntity(last as PrismaRoundRow) : null;
  }

  async findById(id: string): Promise<Round | null> {
    const row = await this.prisma.round.findUnique({
      where: { id },
      include: { bets: true },
    });
    return row ? this.toEntity(row as PrismaRoundRow) : null;
  }

  async findHistory(page: number, limit: number): Promise<{ rounds: Round[]; total: number }> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.round.findMany({
        where: { phase: "SETTLED" },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { bets: true },
      }),
      this.prisma.round.count({ where: { phase: "SETTLED" } }),
    ]);
    return { rounds: rows.map((r) => this.toEntity(r as PrismaRoundRow)), total };
  }

  async save(round: Round): Promise<void> {
    await this.prisma.round.update({
      where: { id: round.id },
      data: {
        phase: round.phase,
        crashMultiplier: round.crashMultiplier,
        phaseStartedAt: round.phaseStartedAt,
        crashedAt: round.crashedAt,
        settledAt: round.settledAt,
      },
    });

    for (const bet of round.bets) {
      await this.prisma.bet.update({
        where: { id: bet.id },
        data: {
          status: bet.status,
          cashoutMultiplier: bet.cashoutMultiplier,
          payoutCents: bet.payoutCents,
          updatedAt: bet.updatedAt,
        },
      });
    }
  }

  async saveSettledWithOutbox(round: Round, events: OutboxEventInput[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.round.update({
        where: { id: round.id },
        data: {
          phase: round.phase,
          crashMultiplier: round.crashMultiplier,
          phaseStartedAt: round.phaseStartedAt,
          crashedAt: round.crashedAt,
          settledAt: round.settledAt,
        },
      }),
      ...round.bets.map((bet) =>
        this.prisma.bet.update({
          where: { id: bet.id },
          data: {
            status: bet.status,
            cashoutMultiplier: bet.cashoutMultiplier,
            payoutCents: bet.payoutCents,
            updatedAt: bet.updatedAt,
          },
        }),
      ),
      ...events.map((e) =>
        this.prisma.outboxEvent.create({
          data: { routingKey: e.routingKey, payload: e.payload as Prisma.InputJsonValue },
        }),
      ),
    ]);
  }

  async create(round: Round): Promise<void> {
    await this.prisma.round.create({
      data: {
        id: round.id,
        phase: round.phase,
        serverSeed: round.serverSeed,
        serverHash: round.serverHash,
        clientSeed: round.clientSeed,
        nonce: round.nonce,
        crashMultiplier: round.crashMultiplier,
        phaseStartedAt: round.phaseStartedAt,
      },
    });
  }

  async getNextNonce(): Promise<number> {
    const count = await this.prisma.round.count();
    return count + 1;
  }

  private toEntity(row: PrismaRoundRow): Round {
    const bets = row.bets.map(
      (b) =>
        new Bet({
          id: b.id,
          roundId: b.roundId,
          playerId: b.playerId,
          amountCents: b.amountCents,
          status: b.status as BetStatus,
          cashoutMultiplier: b.cashoutMultiplier,
          payoutCents: b.payoutCents,
          createdAt: b.createdAt,
          updatedAt: b.updatedAt,
        }),
    );

    return new Round({
      id: row.id,
      phase: row.phase as RoundPhase,
      serverSeed: row.serverSeed,
      serverHash: row.serverHash,
      clientSeed: row.clientSeed,
      nonce: row.nonce,
      crashMultiplier: row.crashMultiplier,
      phaseStartedAt: row.phaseStartedAt,
      crashedAt: row.crashedAt,
      settledAt: row.settledAt,
      createdAt: row.createdAt,
      bets,
    });
  }
}
