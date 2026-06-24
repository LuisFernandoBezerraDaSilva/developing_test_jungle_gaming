import { randomUUID } from "crypto";
import { Wallet } from "../../src/domain/wallet.entity";
import type { WalletRepository } from "../../src/domain/wallet.repository";

/**
 * Event envelope shape used by RabbitMQService (see infrastructure/rabbitmq.service.ts).
 */
export interface Envelope {
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: unknown;
}

type Handler = (envelope: Envelope) => Promise<void>;

/**
 * In-memory stand-in for RabbitMQService. Delivers published events
 * synchronously to registered consumers — deterministic, no broker needed.
 */
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

  /** Deliver an event with an explicit eventId (used for idempotency tests). */
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

  /** Events published with a given routing key (for assertions). */
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

/** In-memory idempotency store mirroring RedisService.setNx. */
export class InMemoryRedis {
  private readonly keys = new Set<string>();
  async setNx(key: string, _ttlSeconds: number): Promise<boolean> {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }
}

/** In-memory WalletRepository backed by a Map<playerId, Wallet>. */
export class InMemoryWalletRepository implements WalletRepository {
  private readonly wallets = new Map<string, Wallet>();

  /** O bus simula o relay do outbox: ao gravar/enfileirar, "publica" o evento. */
  constructor(private readonly bus?: InMemoryBus) {}

  /** Test helper: seed a wallet with a known balance. */
  seed(playerId: string, balanceCents: bigint): Wallet {
    const wallet = new Wallet({
      id: randomUUID(),
      playerId,
      balanceCents,
      currency: "BRL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.wallets.set(playerId, wallet);
    return wallet;
  }

  async findByPlayerId(playerId: string): Promise<Wallet | null> {
    return this.wallets.get(playerId) ?? null;
  }

  async findById(id: string): Promise<Wallet | null> {
    for (const w of this.wallets.values()) if (w.id === id) return w;
    return null;
  }

  async save(wallet: Wallet): Promise<Wallet> {
    this.wallets.set(wallet.playerId, wallet);
    return wallet;
  }

  async saveWithOutbox(wallet: Wallet, event: { routingKey: string; payload: unknown }): Promise<Wallet> {
    this.wallets.set(wallet.playerId, wallet);
    await this.bus?.publish(event.routingKey, event.payload);
    return wallet;
  }

  async enqueueOutbox(event: { routingKey: string; payload: unknown }): Promise<void> {
    await this.bus?.publish(event.routingKey, event.payload);
  }

  async createOrGet(playerId: string): Promise<{ wallet: Wallet; created: boolean }> {
    const existing = this.wallets.get(playerId);
    if (existing) return { wallet: existing, created: false };
    const wallet = new Wallet({
      id: randomUUID(),
      playerId,
      balanceCents: 0n,
      currency: "BRL",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    this.wallets.set(playerId, wallet);
    return { wallet, created: true };
  }
}
