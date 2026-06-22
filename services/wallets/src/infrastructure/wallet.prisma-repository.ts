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

  async createOrGet(playerId: string): Promise<{ wallet: Wallet; created: boolean }> {
    const existing = await this.prisma.wallet.findUnique({ where: { playerId } });
    if (existing) return { wallet: this.toEntity(existing), created: false };

    const row = await this.prisma.wallet.create({
      data: { id: randomUUID(), playerId, balanceCents: 0n, currency: "BRL" },
    });
    return { wallet: this.toEntity(row), created: true };
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
