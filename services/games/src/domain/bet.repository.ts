import { Bet } from "./bet.entity";

export interface LeaderboardRow {
  playerId: string;
  profitCents: bigint; // sum(payoutCents) - sum(amountCents) no período
  totalBets: number;
}

/** Evento a ser publicado via outbox (gravado na mesma transação do estado). */
export interface OutboxEventInput {
  routingKey: string;
  payload: unknown;
}

export interface BetRepository {
  findByPlayerId(playerId: string, page: number, limit: number): Promise<{ bets: Bet[]; total: number }>;
  save(bet: Bet): Promise<void>;
  create(bet: Bet): Promise<void>;
  /** Cria a aposta e enfileira o evento no outbox, atomicamente. */
  createWithOutbox(bet: Bet, event: OutboxEventInput): Promise<void>;
  saveBatch(bets: Bet[]): Promise<void>;
  leaderboard(since: Date, limit: number): Promise<LeaderboardRow[]>;
}

export const BET_REPOSITORY = Symbol("BET_REPOSITORY");
