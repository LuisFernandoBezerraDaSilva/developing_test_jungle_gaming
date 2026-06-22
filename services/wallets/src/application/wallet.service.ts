import { Injectable, Inject, NotFoundException, Logger } from "@nestjs/common";
import type { WalletRepository } from "../domain/wallet.repository";
import { WALLET_REPOSITORY } from "../domain/wallet.repository";
import { InsufficientBalanceError } from "../domain/wallet.entity";
import { RabbitMQService } from "../infrastructure/rabbitmq.service";
import { RedisService } from "../infrastructure/redis.service";

const IDEMPOTENCY_TTL = 86400; // 24h

interface BetPlacedPayload {
  betId: string;
  roundId: string;
  playerId: string;
  amountCents: string;
}

interface RoundSettledPayload {
  betId: string;
  roundId: string;
  playerId: string;
  outcome: "WON" | "LOST";
  amountCents: string;
  payoutCents: string;
}

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepository,
    private readonly rabbitmq: RabbitMQService,
    private readonly redis: RedisService,
  ) {}

  async createOrGet(playerId: string): Promise<{ wallet: import("../domain/wallet.entity").Wallet; created: boolean }> {
    return this.walletRepo.createOrGet(playerId);
  }

  async getByPlayerId(playerId: string) {
    const wallet = await this.walletRepo.findByPlayerId(playerId);
    if (!wallet) throw new NotFoundException({ statusCode: 404, error: "WALLET_NOT_FOUND", message: "Wallet not found" });
    return wallet;
  }

  async startConsumers(): Promise<void> {
    await this.rabbitmq.consume(
      "wallets.bet.placed",
      ["bet.placed"],
      async (envelope) => {
        const idempotencyKey = `processed:${envelope.eventId}`;
        const isNew = await this.redis.setNx(idempotencyKey, IDEMPOTENCY_TTL);
        if (!isNew) return;

        const payload = envelope.payload as BetPlacedPayload;
        await this.handleBetPlaced(payload);
      },
    );

    await this.rabbitmq.consume(
      "wallets.round.settled",
      ["round.settled"],
      async (envelope) => {
        const idempotencyKey = `processed:${envelope.eventId}`;
        const isNew = await this.redis.setNx(idempotencyKey, IDEMPOTENCY_TTL);
        if (!isNew) return;

        const payload = envelope.payload as RoundSettledPayload;
        await this.handleRoundSettled(payload);
      },
    );
  }

  private async handleBetPlaced(payload: BetPlacedPayload): Promise<void> {
    const wallet = await this.walletRepo.findByPlayerId(payload.playerId);
    if (!wallet) {
      this.logger.warn(`Wallet not found for player ${payload.playerId}, failing debit`);
      await this.rabbitmq.publish("wallet.debit.failed", {
        betId: payload.betId,
        playerId: payload.playerId,
        amountCents: payload.amountCents,
        reason: "INSUFFICIENT_BALANCE",
      });
      return;
    }

    try {
      wallet.debit(BigInt(payload.amountCents));
      await this.walletRepo.save(wallet);
      await this.rabbitmq.publish("wallet.debit.succeeded", {
        betId: payload.betId,
        playerId: payload.playerId,
        amountCents: payload.amountCents,
      });
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        await this.rabbitmq.publish("wallet.debit.failed", {
          betId: payload.betId,
          playerId: payload.playerId,
          amountCents: payload.amountCents,
          reason: "INSUFFICIENT_BALANCE",
        });
      } else {
        throw err;
      }
    }
  }

  private async handleRoundSettled(payload: RoundSettledPayload): Promise<void> {
    if (payload.outcome !== "WON") return;

    const payoutCents = BigInt(payload.payoutCents);
    if (payoutCents <= 0n) return;

    const wallet = await this.walletRepo.findByPlayerId(payload.playerId);
    if (!wallet) {
      this.logger.error(`Wallet not found for player ${payload.playerId} on round.settled — payout lost!`);
      return;
    }

    wallet.credit(payoutCents);
    await this.walletRepo.save(wallet);
    this.logger.log(`Credited ${payoutCents} to player ${payload.playerId} for bet ${payload.betId}`);
  }
}
