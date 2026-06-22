import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Bet } from "../domain/bet.entity";
import type { BetRepository } from "../domain/bet.repository";

@Injectable()
export class BetPrismaRepository implements BetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPlayerId(playerId: string, page: number, limit: number): Promise<{ bets: Bet[]; total: number }> {
    const skip = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.bet.findMany({
        where: { playerId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.bet.count({ where: { playerId } }),
    ]);
    return { bets: rows.map((r) => this.toEntity(r)), total };
  }

  async save(bet: Bet): Promise<void> {
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

  async create(bet: Bet): Promise<void> {
    await this.prisma.bet.create({
      data: {
        id: bet.id,
        roundId: bet.roundId,
        playerId: bet.playerId,
        amountCents: bet.amountCents,
        status: bet.status,
      },
    });
  }

  async saveBatch(bets: Bet[]): Promise<void> {
    await Promise.all(bets.map((b) => this.save(b)));
  }

  private toEntity(row: {
    id: string;
    roundId: string;
    playerId: string;
    amountCents: bigint;
    status: string;
    cashoutMultiplier: string | null;
    payoutCents: bigint | null;
    createdAt: Date;
    updatedAt: Date;
  }): Bet {
    return new Bet({
      id: row.id,
      roundId: row.roundId,
      playerId: row.playerId,
      amountCents: row.amountCents,
      status: row.status as any,
      cashoutMultiplier: row.cashoutMultiplier,
      payoutCents: row.payoutCents,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
