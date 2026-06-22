import { Bet } from "./bet.entity";

export interface BetRepository {
  findByPlayerId(playerId: string, page: number, limit: number): Promise<{ bets: Bet[]; total: number }>;
  save(bet: Bet): Promise<void>;
  create(bet: Bet): Promise<void>;
  saveBatch(bets: Bet[]): Promise<void>;
}

export const BET_REPOSITORY = Symbol("BET_REPOSITORY");
