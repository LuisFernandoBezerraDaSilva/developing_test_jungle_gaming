import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { Wallet } from "../domain/wallet.entity";
import type { WalletRepository } from "../domain/wallet.repository";
import { randomUUID } from "crypto";

@Injectable()
export class WalletPrismaRepository implements WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPlayerId(playerId: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { playerId } });
    return row ? this.toEntity(row) : null;
  }

  async findById(id: string): Promise<Wallet | null> {
    const row = await this.prisma.wallet.findUnique({ where: { id } });
    return row ? this.toEntity(row) : null;
  }

  async save(wallet: Wallet): Promise<Wallet> {
    const row = await this.prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balanceCents: wallet.balanceCents,
        updatedAt: wallet.updatedAt,
      },
    });
    return this.toEntity(row);
  }

  async create(playerId: string): Promise<Wallet> {
    const row = await this.prisma.wallet.upsert({
      where: { playerId },
      create: {
        id: randomUUID(),
        playerId,
        balanceCents: 0n,
        currency: "BRL",
      },
      update: {},
    });
    return this.toEntity(row);
  }

  private toEntity(row: {
    id: string;
    playerId: string;
    balanceCents: bigint;
    currency: string;
    createdAt: Date;
    updatedAt: Date;
  }): Wallet {
    return new Wallet({
      id: row.id,
      playerId: row.playerId,
      balanceCents: row.balanceCents,
      currency: row.currency,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
