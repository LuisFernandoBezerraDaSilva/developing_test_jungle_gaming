import { Wallet } from "./wallet.entity";

/** Evento a ser publicado via outbox (gravado na mesma transação do estado). */
export interface OutboxEventInput {
  routingKey: string;
  payload: unknown;
}

export interface WalletRepository {
  findByPlayerId(playerId: string): Promise<Wallet | null>;
  findById(id: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<Wallet>;
  /** Persiste o saldo e enfileira o evento no outbox, atomicamente. */
  saveWithOutbox(wallet: Wallet, event: OutboxEventInput): Promise<Wallet>;
  /** Enfileira um evento no outbox sem mudança de estado (ex: débito falho). */
  enqueueOutbox(event: OutboxEventInput): Promise<void>;
  createOrGet(playerId: string): Promise<{ wallet: Wallet; created: boolean }>;
}

export const WALLET_REPOSITORY = Symbol("WALLET_REPOSITORY");
