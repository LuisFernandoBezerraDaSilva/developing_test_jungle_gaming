import { Bet } from "./bet.entity";

export interface LeaderboardRow {
  playerId: string;
  profitCents: bigint; // sum(payoutCents) - sum(amountCents) no período
  totalBets: number;
}

export interface BetRepository {
  findByPlayerId(playerId: string, page: number, limit: number): Promise<{ bets: Bet[]; total: number }>;
  save(bet: Bet): Promise<void>;
  create(bet: Bet): Promise<void>;
  saveBatch(bets: Bet[]): Promise<void>;
  leaderboard(since: Date, limit: number): Promise<LeaderboardRow[]>;
}

export const BET_REPOSITORY = Symbol("BET_REPOSITORY");
